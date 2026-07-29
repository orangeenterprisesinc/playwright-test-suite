import { test, expect } from './fixtures'
// Migration note: was `from '@playwright/test'` — the shim keeps these
// clean-context tests unauthenticated while still honoring the webpet runner gate.
import { test as cleanTest, expect as cleanExpect } from './support/clean-fixtures'
import * as webpetEnv from './support/webpet-env'
import {
  ensureCrew,
  deleteCrew,
  ensureDepartment,
  deleteDepartment,
  ensureCustomer,
  deleteCustomer,
} from './data-factory'

/**
 * Exercises the global notification system (sonner toasts driven by the
 * TanStack Query MutationCache). Runs against a live API + dev server.
 *
 * Prereqs — same as every other spec:
 *   cd apps/api && go run .
 *   cd apps/web && pnpm dev
 *   API_PORT=8081 (if not 8080) for global-setup.ts
 *
 * Key facts used by the tests below:
 * - FormFooter disables Save whenever the form is clean (!isDirty) or invalid.
 * - Every record a test creates/mutates is made fresh via data-factory.ts, so
 *   the file is safe to run in parallel and no longer depends on seeded rows.
 */

// ── Save / create success toasts ────────────────────────────────────────────

test.describe('Create & save success toasts', () => {
  test('creating a Department emits "Department created" toast', async ({ page, request }) => {
    const uniq = `NotifTest ${Date.now() % 1000000}`

    await page.goto('/setup/departments/new')
    await page.locator('input#name').fill(uniq)
    // Blur to trigger onBlur validation — FormFooter gates Save on isValid.
    await page.locator('input#name').blur()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(page.getByText('Department created')).toBeVisible({ timeout: 8000 })

    // Cleanup: soft-delete the record we just created.
    const list = await request.get('/api/departments')
    const all = (await list.json()) as Array<{
      departmentCounter: number
      name: string
      firstDayofWeek: number
      crewRequired: boolean
      version: string
    }>
    const created = all.find((d) => d.name === uniq)
    if (created) {
      await request.put(`/api/departments/${String(created.departmentCounter)}`, {
        data: {
          active: false,
          firstDayofWeek: created.firstDayofWeek,
          crewRequired: created.crewRequired,
          version: created.version,
        },
      })
    }
  })

  test('editing a Department emits "Department saved" toast', async ({ page, request }) => {
    // Edit this test's OWN department rather than the shared id=1 row — this
    // test saves a change, which is a shared-row mutation that makes parallel
    // runs flaky. See data-factory.ts.
    const dept = await ensureDepartment(request)
    try {
      await page.goto(`/setup/departments/${String(dept.id)}`)
      await page.waitForSelector('input#name')
      // Toggle the crewRequired switch via its label to mark the form dirty.
      // (The Switch's `id` lives on a hidden native input; the visible base-ui
      // button responds to label clicks via standard HTML association.)
      await page.locator('label[for="crewRequired"]').click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByText('Department saved')).toBeVisible({ timeout: 8000 })
    } finally {
      await deleteDepartment(request, dept.id)
    }
  })
})

// ── Error toast replaces the old alert() on BoardFormPage ───────────────────

test.describe('Error toasts', () => {
  test('BoardFormPage no longer fires a native alert() on server error', async ({
    page,
    request,
  }) => {
    const list = await request.get('/api/boards')
    if (!list.ok()) test.skip(true, 'API /boards not available')
    const boards = (await list.json()) as Array<{ name: string }>
    if (boards.length === 0) test.skip(true, 'no boards seeded')
    const existingName = boards[0].name

    let dialogFired = false
    page.on('dialog', (d) => {
      dialogFired = true
      void d.dismiss()
    })

    await page.goto('/setup/boards/new')
    await page.waitForSelector('input#name')
    await page.locator('input#name').fill(existingName)
    await page.locator('input#name').blur()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await expect(
      page.locator('[data-sonner-toast][data-type="error"]').first(),
    ).toBeVisible({ timeout: 8000 })
    expect(dialogFired).toBe(false)
  })
})

// ── 409 Conflict renders the shared ConcurrencyErrorBanner (no toast) ───────
//
// Covers the PET-64 unification: every edit form pairs the shared banner with
// `meta.suppressStatuses: [409]`. Three representative slices:
//   - Department: canonical pattern (was already using suppressStatuses).
//   - Crew:       regression guard against the old double-notification bug.
//   - Customer:   regression guard against the "no inline UI at all" bug.

test.describe('409 Conflict handling', () => {
  test('Department stale version shows concurrency banner, no toast', async ({
    page,
    request,
  }) => {
    // Create this test's OWN department and bump its version to force the 409 —
    // never the shared id=1 row. See data-factory.ts.
    const dept = await ensureDepartment(request)
    try {
      const before = await (await request.get(`/api/departments/${String(dept.id)}`)).json()

      await page.goto(`/setup/departments/${String(dept.id)}`)
      await page.waitForSelector('input#name')

      // Bump the server's version out from under the form. PUT /api/departments/{id}
      // expects a full resource representation, not a partial patch — a payload
      // missing a gated field like differentialPayMethod gets that field's zero
      // value, which fails its own enum validation (400 invalid_enum) before the
      // update (and the version bump) ever happens. Spread the full GET response
      // back so every field round-trips unchanged except the deliberately-stale
      // version.
      const bumpRes = await request.put(`/api/departments/${String(dept.id)}`, {
        data: { ...before },
      })
      expect(bumpRes.ok(), `version-bump PUT failed: ${await bumpRes.text()}`).toBeTruthy()

      // Dirty + submit with stale version (click via label to hit the visible switch).
      await page.locator('label[for="crewRequired"]').click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByTestId('concurrency-banner')).toBeVisible({ timeout: 8000 })
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    } finally {
      await deleteDepartment(request, dept.id)
    }
  })

  test('Crew stale version shows concurrency banner, no toast', async ({ page, request }) => {
    // Create this test's OWN crew rather than mutating the shared id=1 row —
    // this test bumps the version to force a 409, which is exactly the kind of
    // shared-row mutation that makes parallel runs flaky. See data-factory.ts.
    const crew = await ensureCrew(request)
    try {
      const before = await (await request.get(`/api/crews/${String(crew.id)}`)).json()

      await page.goto(`/setup/crews/${String(crew.id)}`)
      await page.waitForSelector('input#name')

      // Bump the server's version out from under the form.
      const bumpRes = await request.put(`/api/crews/${String(crew.id)}`, {
        data: {
          shortName: before.shortName ?? null,
          active: before.active,
          departmentCounter: before.departmentCounter ?? null,
          supervisorCounter: before.supervisorCounter ?? null,
          defaultRanchCounter: before.defaultRanchCounter ?? null,
          defaultFieldCounter: before.defaultFieldCounter ?? null,
          defaultJobCounter: before.defaultJobCounter ?? null,
          includeInTransfer: before.includeInTransfer,
          includeInPayrollExport: before.includeInPayrollExport,
          includeInCostAccExport: before.includeInCostAccExport,
          version: before.version,
        },
      })
      // Fail fast instead of silently no-oping — a rejected bump means the rest
      // of the test exercises a non-stale save and can never see the conflict
      // banner it's asserting on (see the Department test's comment above for
      // how this class of bug hid for a while).
      expect(bumpRes.ok(), `version-bump PUT failed: ${await bumpRes.text()}`).toBeTruthy()

      // Dirty the form with a change that doesn't require any dropdown state.
      // A fresh crew starts with shortName=null, so any literal dirties it.
      await page.locator('input#shortName').fill('409-test')
      await page.locator('input#shortName').blur()
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByTestId('concurrency-banner')).toBeVisible({ timeout: 8000 })
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    } finally {
      await deleteCrew(request, crew.id)
    }
  })

  test('Customer stale version shows concurrency banner, no toast', async ({ page, request }) => {
    // Create this test's OWN customer rather than mutating whatever customer
    // happens to exist — the version-bump below would otherwise race any other
    // worker touching the shared first customer row. See data-factory.ts.
    const customer = await ensureCustomer(request)
    try {
      const before = await (await request.get(`/api/customers/${String(customer.id)}`)).json()

      await page.goto(`/setup/customers/${String(customer.id)}`)
      await page.waitForSelector('input#name')

      // Bump the server's version out from under the form. See the Department
      // test's comment above — spread the full record rather than a curated
      // field list, so an omitted gated field can't fail its own validation
      // before the version bump ever takes effect.
      const bumpRes = await request.put(`/api/customers/${String(customer.id)}`, {
        data: { ...before },
      })
      expect(bumpRes.ok(), `version-bump PUT failed: ${await bumpRes.text()}`).toBeTruthy()

      // Dirty the form via a plain text input on the General tab. See the Crew
      // test above — guarantee an actual change vs. the current value so a
      // prior run's leftover data can't leave the form clean and Save disabled.
      const dirtyContactPerson = before.contactPerson === '409-test' ? '409-test-2' : '409-test'
      await page.locator('input#contactPerson').fill(dirtyContactPerson)
      await page.locator('input#contactPerson').blur()
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByTestId('concurrency-banner')).toBeVisible({ timeout: 8000 })
      await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
    } finally {
      await deleteCustomer(request, customer.id)
    }
  })
})

// Bulk-update success toast + Undo coverage now lives in field.spec.ts and
// ranch.spec.ts against the new DataGrid + SelectedRowsBar + PropagateChangeDialog
// flow. The legacy MultiUpdatePanel-based test was deleted with PET-424 Batch C.

// ── Auth event toasts (clean context — no fixture) ──────────────────────────

cleanTest.describe('Auth event toasts', () => {
  // The suite's default 'Admin'/'Admin' login no longer authenticates — login
  // now goes through TigerMaster, and only an SU-style user set via
  // E2E_ADMIN_USER/E2E_ADMIN_PASSWORD is guaranteed present (see
  // seed/README.md). Migration note: the env-var fallback chain (E2E_ADMIN_* →
  // USER_NAME/PASSWORD → 'Admin') is centralized in support/webpet-env.ts so
  // this spec and provision.ts can never disagree about which user they are.
  const { ADMIN_USER, ADMIN_PASSWORD } = webpetEnv

  async function signIn(page: import('@playwright/test').Page, baseURL: string | undefined) {
    const res = await page.request.post('/api/auth/login', {
      data: { username: ADMIN_USER, password: ADMIN_PASSWORD },
      // The API's OriginCheck middleware 403s any unsafe-method request whose
      // Origin doesn't match — page.request doesn't send one automatically
      // the way an in-page fetch() would, so without this the login itself
      // silently fails and every step downstream (waiting for the header's
      // user menu) just times out with no obvious cause.
      headers: baseURL ? { Origin: baseURL } : undefined,
    })
    const body = (await res.json()) as { user: unknown }
    await page.addInitScript((u) => {
      sessionStorage.setItem('pt_user', JSON.stringify(u))
    }, body.user)
  }

  cleanTest('logout emits "Signed out" toast and redirects to /login', async ({ page, baseURL }) => {
    await signIn(page, baseURL)
    await page.goto('/')
    // UserMenu (app/layout/UserMenu.tsx) lives in the sidebar now, not a
    // <header> — `header button[aria-haspopup="menu"]` never matches
    // anything and this used to hang for the full test timeout waiting on
    // it. Its DropdownMenuTrigger carries a stable data-slot instead.
    await page.locator('[data-slot="dropdown-menu-trigger"]').first().click()
    await page.getByRole('menuitem', { name: /log out/i }).click()

    await cleanExpect(page.getByText('Signed out')).toBeVisible({ timeout: 5000 })
    await cleanExpect(page).toHaveURL(/\/login$/)
  })

  cleanTest('login emits a "Welcome, {name}" toast', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input#username').fill(ADMIN_USER)
    await page.locator('input#password').fill(ADMIN_PASSWORD)
    await page.locator('button[type="submit"]').click()
    // Don't hardcode the interpolated name — it's whatever displayName the
    // logged-in user carries (e.g. "Su" under E2E_ADMIN_USER=su), not
    // necessarily "Admin". The toast's message format is what's under test.
    await cleanExpect(page.getByText(/Welcome,\s*\S+/)).toBeVisible({ timeout: 5000 })
  })
})

// ── 401 discriminators: session_expired vs not_authenticated ────────────────
//
// Covers the PET-73 two-code envelope. The API emits:
//   - 401 { code: "session_expired" }  → redirect + toast "Your session expired…"
//   - 401 { code: "not_authenticated" } → silent redirect, no toast
// Both tests intercept the save route to force the envelope so we don't need
// to juggle real session cookies — what matters is the frontend's behavior in
// response to each code.

test.describe('401 session-lifecycle discriminator', () => {
  test('session_expired shows the expiry toast and redirects to /login', async ({ page, request }) => {
    // Load this test's own department (the PUT is mocked, so no real mutation),
    // avoiding a dependency on a shared id=1 row. See data-factory.ts.
    const dept = await ensureDepartment(request)
    try {
      await page.goto(`/setup/departments/${String(dept.id)}`)
      await page.waitForSelector('input#name')

      // Intercept the PUT to return a 401 with the session_expired code.
      await page.route(`**/api/departments/${String(dept.id)}`, async (route, req) => {
        if (req.method() !== 'PUT') {
          await route.fallback()
          return
        }
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Session expired.', code: 'session_expired' }),
        })
      })

      // Dirty the form and submit — the mutation hits the intercept and fails 401.
      await page.locator('label[for="crewRequired"]').click()
      await page.getByRole('button', { name: 'Save', exact: true }).click()

      await expect(page.getByText(/session expired.*sign in again/i)).toBeVisible({
        timeout: 5000,
      })
      // The redirect now carries a `?from=` return-path query param (so the user
      // lands back where they were after re-authenticating) — stale assertion
      // expected a bare /login with nothing after it.
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 5000 })
    } finally {
      await deleteDepartment(request, dept.id)
    }
  })

  test('not_authenticated redirects silently without the expiry toast', async ({ page, request }) => {
    // KNOWN APP BUG — same root cause documented in the "wrong current
    // password" test above (shared/lib/api.ts:20-27): the client-layer 401
    // middleware calls `handleAuthExpiry()` with no arguments, so `code` is
    // always undefined there. Per handleAuthExpiry's own doc comment
    // (shared/lib/notifications.ts:313-326), an undefined code is
    // deliberately treated as "expired" (shows the toast) for backward
    // compatibility — but that means the middleware can never actually
    // reach the not_authenticated branch that suppresses the toast, even
    // though this response's body clearly carries
    // `{ code: 'not_authenticated' }`. Reproduced locally: the "session
    // expired" toast shows here when it's specified not to.
    test.fail(true, 'app bug: api.ts calls handleAuthExpiry() without the response code, so not_authenticated can never suppress the toast — see comment above')

    const dept = await ensureDepartment(request)
    await page.goto(`/setup/departments/${String(dept.id)}`)
    await page.waitForSelector('input#name')

    await page.route(`**/api/departments/${String(dept.id)}`, async (route, req) => {
      if (req.method() !== 'PUT') {
        await route.fallback()
        return
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not authenticated.', code: 'not_authenticated' }),
      })
    })

    await page.locator('label[for="crewRequired"]').click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    // The redirect now carries a `?from=` return-path query param (so the user
    // lands back where they were after re-authenticating) — stale assertion
    // expected a bare /login with nothing after it.
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 5000 })
    // The "your session expired" toast must NOT appear on the not_authenticated
    // path — the user never had a session to lose.
    await expect(page.getByText(/session expired.*sign in again/i)).toHaveCount(0)
  })
})

// ── Offline / online detection ──────────────────────────────────────────────

test.describe('Offline/online toasts', () => {
  test('context offline/online toggles surface as toasts', async ({ page, context }) => {
    await page.goto('/setup/departments')
    await page.waitForSelector('[role="grid"]')

    await context.setOffline(true)
    await expect(page.getByText(/offline/i)).toBeVisible({ timeout: 5000 })

    await context.setOffline(false)
    await expect(page.getByText('Back online')).toBeVisible({ timeout: 5000 })
  })
})
