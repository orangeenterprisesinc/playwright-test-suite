/**
 * E2E data factory — create test records on the fly via the real API instead
 * of depending on hardcoded, shared client-DB fixture rows (Crew id=1 /
 * 'Crew 01', Department id=1 / 'ADP 5', etc.).
 *
 * WHY THIS EXISTS
 * The suite was authored against a specific seeded DB snapshot, so many specs
 * hardcode both a record id *and* its expected value, and several unrelated
 * files read/mutate the SAME physical row. That makes the suite unsafe above
 * one worker (concurrent workers collide on the shared row) and brittle across
 * DB swaps (PetData → DelLlano → Sycamore). The fix is to let each spec file
 * create the record it needs — with a run-unique name — and assert against what
 * the factory returned, so no two files (or workers) ever touch the same row.
 *
 * CONTRACT
 * - Every ensureX() creates a fresh, uniquely-named record and returns its id +
 *   the field values a spec would assert on. Assert against the RETURNED value,
 *   never a literal.
 * - Call ensureX() from a spec's `test.beforeAll(async ({ request }) => ...)`
 *   (the same authed `request` fixture crew.spec.ts already uses), and pair it
 *   with the matching deleteX() in `test.afterAll` so runs don't leave a trail
 *   of rows behind.
 * - No raw SQL / no DB access — only the running API + app, exactly like
 *   global-setup.ts's RestrictedTest provisioning.
 *
 * PARALLEL SAFETY
 * Names embed a per-worker token + a per-call sequence, so names are unique
 * within a worker and across workers even if two start in the same millisecond.
 * The name-uniqueness also sidesteps the unfiltered UNIQUE-constraint "ghost
 * row" problem (soft-deleted rows still occupy the name) — every run uses a new
 * name, mirroring variety-equivalence-cucumbers-european.spec.ts's RUN_TOKEN.
 */
import type { APIRequestContext } from '@playwright/test'

// Per-worker token: Date.now() gives run-freshness; the worker index guarantees
// two workers that boot in the same millisecond still get distinct tokens.
const WORKER_INDEX =
  process.env['TEST_WORKER_INDEX'] ?? process.env['TEST_PARALLEL_INDEX'] ?? '0'
const RUN_TOKEN = `${Date.now().toString(36).slice(-5)}${WORKER_INDEX}`.toUpperCase()

let seq = 0

/**
 * A run-unique name. `prefix` keeps records human-identifiable in the DB when
 * triaging leftovers; the token+seq suffix guarantees uniqueness per worker and
 * across concurrent workers. Kept well under typical name-column limits.
 */
export function uniqueName(prefix: string): string {
  seq += 1
  return `${prefix}_${RUN_TOKEN}_${seq}`
}

async function bodyText(res: { text: () => Promise<string> }): Promise<string> {
  return res.text().catch(() => '<unreadable body>')
}

// ── Crew ────────────────────────────────────────────────────────────────────

export interface EnsuredCrew {
  id: number
  name: string
  version: string
  shortName: string | null
}

/**
 * Creates a fresh active Crew (name is the only required field on POST /crews;
 * every other column has a server default). Returns the id + the fields the
 * crew specs assert on. Assert `name`/`shortName` against these, not a literal.
 */
export async function ensureCrew(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredCrew> {
  const name = uniqueName(opts.namePrefix ?? 'E2ECrew')
  const res = await request.post('/api/crews', { data: { name, active: true } })
  if (!res.ok()) {
    throw new Error(`ensureCrew: POST /api/crews failed (${res.status()}): ${await bodyText(res)}`)
  }
  const { crewCounter } = (await res.json()) as { crewCounter: number }

  // POST returns only { crewCounter, code }; GET the full row for version + name.
  const detailRes = await request.get(`/api/crews/${String(crewCounter)}`)
  if (!detailRes.ok()) {
    throw new Error(
      `ensureCrew: GET /api/crews/${String(crewCounter)} failed (${detailRes.status()})`
    )
  }
  const detail = (await detailRes.json()) as {
    name: string
    version: string
    shortName: string | null
  }
  return {
    id: crewCounter,
    name: detail.name,
    version: detail.version,
    shortName: detail.shortName ?? null,
  }
}

/**
 * Soft-deletes a factory-created crew (rowversion-guarded). Best-effort: a
 * missing/already-deleted crew is a no-op so afterAll cleanup never fails a run.
 * Safe because a freshly-created crew has no Employee children to block the
 * delete (the only FK the API guards on).
 */
export async function deleteCrew(request: APIRequestContext, id: number): Promise<void> {
  // Best-effort: never let cleanup fail an otherwise-passing test (e.g. if the
  // request context is already tearing down when an in-test finally runs).
  try {
    const detailRes = await request.get(`/api/crews/${String(id)}`)
    if (!detailRes.ok()) return
    const { version } = (await detailRes.json()) as { version: string }
    await request.delete(`/api/crews/${String(id)}`, { data: { rowversion: version } })
  } catch {
    /* swallow — cleanup is best-effort */
  }
}

/**
 * Generic rowversion-guarded soft-delete for the setup entities whose DELETE
 * body is `{ rowversion }` and whose GET returns a `version` field
 * (department, employee, crop, equipment, variety). Best-effort — a missing row
 * is a no-op so afterAll cleanup never fails a run.
 */
async function deleteByRowversion(
  request: APIRequestContext,
  path: string,
  id: number
): Promise<void> {
  // Best-effort: never let cleanup fail an otherwise-passing test (e.g. if the
  // request context is already tearing down when an in-test finally runs).
  try {
    const detailRes = await request.get(`${path}/${String(id)}`)
    if (!detailRes.ok()) return
    const { version } = (await detailRes.json()) as { version: string }
    if (!version) return
    await request.delete(`${path}/${String(id)}`, { data: { rowversion: version } })
  } catch {
    /* swallow — cleanup is best-effort */
  }
}

/** Resolves the first id from a list endpoint via a picker fn; throws if empty. */
async function firstIdFrom<T>(
  request: APIRequestContext,
  path: string,
  pick: (row: T) => number
): Promise<number> {
  const res = await request.get(path)
  if (!res.ok()) throw new Error(`firstIdFrom: GET ${path} failed (${res.status()})`)
  const rows = (await res.json()) as T[]
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`firstIdFrom: ${path} returned no rows — cannot resolve an FK for the factory`)
  }
  return pick(rows[0])
}

// ── Department ────────────────────────────────────────────────────────────────

export interface EnsuredDepartment {
  id: number
  name: string
  version: string
  code: string
}

/**
 * Creates a fresh Department. CreateDepartment runs ~10 enum/range validators
 * even on create (firstDayofWeek 1-7, differentialPayMethod ∈ {1,2}, several
 * NOT-NULL enum ints that reject Go's zero-value), so rather than hand-encode
 * every constraint we CLONE an existing department: GET one real record, give
 * it a run-unique name, drop the identity/auto fields, and POST it back. The
 * payload is valid by construction (it came from a real row). Unknown JSON
 * fields are ignored by the Go decoder, so a spare field on the detail body is
 * harmless.
 */
export async function ensureDepartment(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredDepartment> {
  const templateId = await firstIdFrom<{ departmentCounter: number }>(
    request,
    '/api/departments',
    (d) => d.departmentCounter
  )
  const detailRes = await request.get(`/api/departments/${String(templateId)}`)
  if (!detailRes.ok()) {
    throw new Error(`ensureDepartment: GET template ${templateId} failed (${detailRes.status()})`)
  }
  const template = (await detailRes.json()) as Record<string, unknown>

  const name = uniqueName(opts.namePrefix ?? 'E2EDept')
  // Clone the template but let the server assign identity/auto fields.
  const body: Record<string, unknown> = {
    ...template,
    name,
    code: null,
    exportIdentifier: null,
  }
  delete body['departmentCounter']
  delete body['version']

  const res = await request.post('/api/departments', { data: body })
  if (!res.ok()) {
    throw new Error(
      `ensureDepartment: POST /api/departments failed (${res.status()}): ${await bodyText(res)}`
    )
  }
  const { departmentCounter } = (await res.json()) as { departmentCounter: number }
  const created = (await request.get(`/api/departments/${String(departmentCounter)}`).then((r) =>
    r.json()
  )) as { name: string; version: string; code?: string | null }
  return {
    id: departmentCounter,
    name: created.name,
    version: created.version,
    code: created.code ?? '',
  }
}

export async function deleteDepartment(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/departments', id)
}

// ── Employee ──────────────────────────────────────────────────────────────────

export interface EnsuredEmployee {
  id: number
  name: string
  firstName: string
  lastName: string
  code: string | null
  departmentId: number | null
  departmentName: string | null
}

/**
 * Creates a fresh active Employee. `name` (≤50) + `payPeriod` (0-5) are the only
 * hard requirements; firstName/lastName are set explicitly so specs can assert
 * against the returned values. Optionally assigns a department (resolved to a
 * real id) so the department-dropdown edit test has a current value to show.
 */
export async function ensureEmployee(
  request: APIRequestContext,
  opts: {
    namePrefix?: string
    /** Assign to a specific department (its name is returned for assertions). */
    department?: { id: number; name: string }
    /** Or auto-resolve the first existing department. Ignored if `department` set. */
    withDepartment?: boolean
  } = {}
): Promise<EnsuredEmployee> {
  const lastName = uniqueName(opts.namePrefix ?? 'E2EEmp').slice(0, 20)
  const firstName = 'Test'
  const name = `${lastName}, ${firstName}`.slice(0, 50)

  let departmentId: number | null = opts.department?.id ?? null
  let departmentName: string | null = opts.department?.name ?? null
  if (departmentId == null && opts.withDepartment) {
    const listRes = await request.get('/api/departments')
    if (listRes.ok()) {
      const depts = (await listRes.json()) as Array<{ departmentCounter: number; name: string }>
      if (depts.length > 0) {
        departmentId = depts[0].departmentCounter
        departmentName = depts[0].name
      }
    }
  }

  const res = await request.post('/api/employees', {
    data: {
      name,
      firstName,
      lastName,
      active: true,
      payPeriod: 0,
      ...(departmentId != null ? { departmentCounter: departmentId } : {}),
    },
  })
  if (!res.ok()) {
    throw new Error(
      `ensureEmployee: POST /api/employees failed (${res.status()}): ${await bodyText(res)}`
    )
  }
  const created = (await res.json()) as { employeeCounter?: number; code?: string | null }
  const id = created.employeeCounter
  if (!id) throw new Error('ensureEmployee: POST response missing employeeCounter')
  return {
    id,
    name,
    firstName,
    lastName,
    code: created.code ?? null,
    departmentId,
    departmentName,
  }
}

export async function deleteEmployee(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/employees', id)
}

// ── Crop ────────────────────────────────────────────────────────────────────

export interface EnsuredCrop {
  id: number
  name: string
  exportIdentifier: string
}

/** Creates a fresh Crop (name is the only required field). */
export async function ensureCrop(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredCrop> {
  const name = uniqueName(opts.namePrefix ?? 'E2ECrop')
  const res = await request.post('/api/crops', { data: { name, active: true } })
  if (!res.ok()) {
    throw new Error(`ensureCrop: POST /api/crops failed (${res.status()}): ${await bodyText(res)}`)
  }
  const created = (await res.json()) as { cropCounter?: number }
  if (!created.cropCounter) throw new Error('ensureCrop: response missing cropCounter')
  const detail = (await request
    .get(`/api/crops/${String(created.cropCounter)}`)
    .then((r) => r.json())) as { exportIdentifier?: string | null }
  return { id: created.cropCounter, name, exportIdentifier: detail.exportIdentifier ?? '' }
}

export async function deleteCrop(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/crops', id)
}

// ── Variety (needs a parent Crop) ─────────────────────────────────────────────

export interface EnsuredVariety {
  id: number
  name: string
  cropId: number
  code: string
  exportIdentifier: string
}

/**
 * Creates a fresh Variety under `cropId` (required FK). If no cropId is passed,
 * resolves the first existing crop. Variety's Name is unique per crop and the
 * constraint is unfiltered (soft-deleted rows still hold the name), so the
 * run-unique name is what keeps repeated runs from colliding.
 */
export async function ensureVariety(
  request: APIRequestContext,
  opts: { namePrefix?: string; cropId?: number } = {}
): Promise<EnsuredVariety> {
  const cropId =
    opts.cropId ??
    (await firstIdFrom<{ cropCounter: number }>(request, '/api/crops', (c) => c.cropCounter))
  const name = uniqueName(opts.namePrefix ?? 'E2EVar')
  const res = await request.post('/api/varieties', {
    data: { name, cropCounter: cropId, active: true },
  })
  if (!res.ok()) {
    throw new Error(
      `ensureVariety: POST /api/varieties failed (${res.status()}): ${await bodyText(res)}`
    )
  }
  const created = (await res.json()) as { varietyCounter?: number }
  if (!created.varietyCounter) throw new Error('ensureVariety: response missing varietyCounter')
  const detail = (await request
    .get(`/api/varieties/${String(created.varietyCounter)}`)
    .then((r) => r.json())) as { code?: string | null; exportIdentifier?: string | null }
  return {
    id: created.varietyCounter,
    name,
    cropId,
    code: detail.code ?? '',
    exportIdentifier: detail.exportIdentifier ?? '',
  }
}

export async function deleteVariety(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/varieties', id)
}

// ── Equipment (needs an EquipmentType) ────────────────────────────────────────

export interface EnsuredEquipment {
  id: number
  name: string
  equipmentTypeId: number
  equipmentTypeName: string
  code: string
}

/**
 * Creates a fresh Equipment. equipmentTypeCounter is a required FK, so we
 * resolve an existing EquipmentType (the first one) and return its name too, so
 * the "type dropdown is populated" test can assert a real, present option
 * rather than a hardcoded 'Trailer' that may not be seeded.
 */
export async function ensureEquipment(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredEquipment> {
  const typesRes = await request.get('/api/equipment-types')
  if (!typesRes.ok()) {
    throw new Error(`ensureEquipment: GET /api/equipment-types failed (${typesRes.status()})`)
  }
  const types = (await typesRes.json()) as Array<{ equipmentTypeCounter: number; name: string }>
  if (types.length === 0) {
    throw new Error('ensureEquipment: no equipment types exist — cannot satisfy the required FK')
  }
  const equipmentTypeId = types[0].equipmentTypeCounter
  const equipmentTypeName = types[0].name

  const name = uniqueName(opts.namePrefix ?? 'E2EEquip')
  // Route is /api/equipments (plural) — see cmd/server/main.go.
  const res = await request.post('/api/equipments', {
    data: { name, equipmentTypeCounter: equipmentTypeId, active: true },
  })
  if (!res.ok()) {
    throw new Error(
      `ensureEquipment: POST /api/equipments failed (${res.status()}): ${await bodyText(res)}`
    )
  }
  const created = (await res.json()) as { equipmentCounter?: number }
  if (!created.equipmentCounter) throw new Error('ensureEquipment: response missing equipmentCounter')
  const detail = (await request
    .get(`/api/equipments/${String(created.equipmentCounter)}`)
    .then((r) => r.json())) as { code?: string | null }
  return {
    id: created.equipmentCounter,
    name,
    equipmentTypeId,
    equipmentTypeName,
    code: detail.code ?? '',
  }
}

export async function deleteEquipment(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/equipments', id)
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface EnsuredCustomer {
  id: number
  name: string
  version: string
  contactPerson: string | null
}

/**
 * Creates a fresh active Customer (name is the only required field on POST
 * /customers; every other column is optional or server-defaulted). Returns the
 * id + the fields the concurrency test reads (version, contactPerson). Giving
 * each file its OWN customer is what makes the stale-version 409 test safe in
 * parallel — it previously bumped the version of the shared first customer row.
 */
export async function ensureCustomer(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredCustomer> {
  const name = uniqueName(opts.namePrefix ?? 'E2ECust')
  const res = await request.post('/api/customers', { data: { name, active: true } })
  if (!res.ok()) {
    throw new Error(
      `ensureCustomer: POST /api/customers failed (${res.status()}): ${await bodyText(res)}`
    )
  }
  const { customerCounter } = (await res.json()) as { customerCounter: number }
  const detail = (await request
    .get(`/api/customers/${String(customerCounter)}`)
    .then((r) => r.json())) as { version: string; contactPerson?: string | null }
  return {
    id: customerCounter,
    name,
    version: detail.version,
    contactPerson: detail.contactPerson ?? null,
  }
}

export async function deleteCustomer(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/customers', id)
}

// ── Job (needs an OvertimeRule / JobType FK) ──────────────────────────────────

export interface EnsuredJob {
  id: number
  name: string
  code: string
}

/**
 * Creates a fresh Job. `overtimeRulesCounter` (a JobType id) is a required,
 * must-be-non-zero FK, so we resolve the first existing overtime rule; the
 * endpoint exposes it as `jobTypeCounter`. paymentType defaults to 0 (Time),
 * overridable via `opts.paymentType` for tests that need a type-gated field
 * (e.g. 8 = Non-Labor, 15 = Extra Wages, both required for includeIdleTime).
 * This is enough to open the JobFormPage; specs assert against the returned
 * id/name/code, never a hardcoded /setup/jobs/1 or a seeded "0 - PISCA".
 */
export async function ensureJob(
  request: APIRequestContext,
  opts: { namePrefix?: string; paymentType?: number } = {}
): Promise<EnsuredJob> {
  const overtimeRulesCounter = await firstIdFrom<{ jobTypeCounter: number }>(
    request,
    '/api/overtime-rules',
    (o) => o.jobTypeCounter
  )
  const name = uniqueName(opts.namePrefix ?? 'E2EJob')
  const res = await request.post('/api/jobs', {
    data: { name, active: true, paymentType: opts.paymentType ?? 0, overtimeRulesCounter },
  })
  if (!res.ok()) {
    throw new Error(`ensureJob: POST /api/jobs failed (${res.status()}): ${await bodyText(res)}`)
  }
  const { jobCounter } = (await res.json()) as { jobCounter: number }
  if (!jobCounter) throw new Error('ensureJob: response missing jobCounter')
  const detail = (await request
    .get(`/api/jobs/${String(jobCounter)}`)
    .then((r) => r.json())) as { code?: string | null }
  return { id: jobCounter, name, code: detail.code ?? '' }
}

export async function deleteJob(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/jobs', id)
}

// ── JobGroup ──────────────────────────────────────────────────────────────────

export interface EnsuredJobGroup {
  id: number
  name: string
  code: string
}

/**
 * Creates a fresh JobGroup (name ≤40 is the only required field). JobGroup does
 * not auto-assign a code, so `code` is empty unless one is supplied — returned
 * so the edit spec can assert the form's Code field against real data.
 */
export async function ensureJobGroup(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredJobGroup> {
  const name = uniqueName(opts.namePrefix ?? 'E2EJG')
  const res = await request.post('/api/job-groups', { data: { name, active: true } })
  if (!res.ok()) {
    throw new Error(
      `ensureJobGroup: POST /api/job-groups failed (${res.status()}): ${await bodyText(res)}`
    )
  }
  const { jobGroupCounter } = (await res.json()) as { jobGroupCounter: number }
  if (!jobGroupCounter) throw new Error('ensureJobGroup: response missing jobGroupCounter')
  const detail = (await request
    .get(`/api/job-groups/${String(jobGroupCounter)}`)
    .then((r) => r.json())) as { code?: string | null }
  return { id: jobGroupCounter, name, code: detail.code ?? '' }
}

export async function deleteJobGroup(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/job-groups', id)
}

// ── Ranch ─────────────────────────────────────────────────────────────────────

export interface EnsuredRanch {
  id: number
  name: string
  version: string
  code: string
}

/**
 * Creates a fresh active Ranch (name is the only required field; department /
 * customer FKs are optional). Returns id + version + code so bulk-update specs
 * can create as many run-unique ranches as they need instead of depending on
 * ≥N seeded uniquely-named ranches.
 */
export async function ensureRanch(
  request: APIRequestContext,
  opts: { namePrefix?: string } = {}
): Promise<EnsuredRanch> {
  const name = uniqueName(opts.namePrefix ?? 'E2ERanch')
  const res = await request.post('/api/ranches', { data: { name, active: true } })
  if (!res.ok()) {
    throw new Error(`ensureRanch: POST /api/ranches failed (${res.status()}): ${await bodyText(res)}`)
  }
  const { ranchCounter } = (await res.json()) as { ranchCounter: number }
  if (!ranchCounter) throw new Error('ensureRanch: response missing ranchCounter')
  const detail = (await request
    .get(`/api/ranches/${String(ranchCounter)}`)
    .then((r) => r.json())) as { version: string; code?: string | null }
  return { id: ranchCounter, name, version: detail.version, code: detail.code ?? '' }
}

export async function deleteRanch(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/ranches', id)
}

// ── Field (needs a parent Ranch) ──────────────────────────────────────────────

export interface EnsuredField {
  id: number
  name: string
  ranchId: number
  code: string
}

/**
 * Creates a fresh Field under `ranchId` (required FK). If no ranchId is passed,
 * resolves the first existing ranch. Returns id + code so field specs can make
 * as many run-unique fields as they need instead of depending on ≥N seeded
 * uniquely-named fields.
 */
export async function ensureField(
  request: APIRequestContext,
  opts: { namePrefix?: string; ranchId?: number } = {}
): Promise<EnsuredField> {
  const ranchId =
    opts.ranchId ??
    (await firstIdFrom<{ ranchCounter: number }>(request, '/api/ranches', (r) => r.ranchCounter))
  const name = uniqueName(opts.namePrefix ?? 'E2EField')
  const res = await request.post('/api/fields', {
    data: { name, ranchCounter: ranchId, active: true },
  })
  if (!res.ok()) {
    throw new Error(`ensureField: POST /api/fields failed (${res.status()}): ${await bodyText(res)}`)
  }
  const created = (await res.json()) as { fieldCounter?: number }
  if (!created.fieldCounter) throw new Error('ensureField: response missing fieldCounter')
  const detail = (await request
    .get(`/api/fields/${String(created.fieldCounter)}`)
    .then((r) => r.json())) as { code?: string | null }
  return { id: created.fieldCounter, name, ranchId, code: detail.code ?? '' }
}

export async function deleteField(request: APIRequestContext, id: number): Promise<void> {
  await deleteByRowversion(request, '/api/fields', id)
}
