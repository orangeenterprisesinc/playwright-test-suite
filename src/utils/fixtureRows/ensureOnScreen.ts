/**
 * @fileoverview The fixture rows a journey needs, made real on screen.
 *
 * D6 was the first journey driven entirely through the UI, and doing that exposed a
 * fixture that had been invalid for weeks while the API-driven version stayed green:
 * employees that were inactive and had no home crew, an inactive job, a time-in with
 * no Phase. `POST /employees` accepted every one of them. **The API accepts what the
 * product rejects**, so a fixture the API built proves nothing about the workflow that
 * runs on top of it.
 *
 * So existence stays a GET — cheap, and in steady state that is the whole cost — while
 * the create and any repair go through the screen's own form, which enforces what the
 * product enforces. The remaining API write is the recycle-bin restore: an arrange write that brings
 * a reference row back before the workflow runs (a `RecycleBinPage` would retire it).
 *
 * "Fixture rows" rather than "fixtures": `src/fixtures/` is Playwright's.
 */
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '../../fixtures/pages.fixture';
import { listCrewTables, type CrewTableRecord } from '../api/crewTablesApi';
import {
    findByCode,
    restoreFromRecycleBin,
    type EnsuredRecord,
} from '../api/setupEntitiesApi';
import { allowApiWrites } from '../api/writeGuard';
import { Logger } from '../logger';

const logger = new Logger('FixtureRows');

export interface OnScreenDeps {
    api: APIRequestContext;
    pages: PageObjects;
    testInfo?: TestInfo;
}

/** What a repair put right. Each maps to one form control. */
export type Repair = 'active' | 'homeCrew';

export interface EnsuredOnScreen extends EnsuredRecord {
    /** Where the row came from — `created` is the only one that drove a form. */
    source: 'existing' | 'restored' | 'created';
    repaired: Repair[];
}

/**
 * Per-worker memo. Fixture rows are shared across spec files, and in steady state
 * every lookup answers "exists" — remembering that saves a request per spec without
 * ever masking a change, because a worker that repairs a row also updates the entry.
 */
const memo = new Map<string, EnsuredOnScreen>();

/** Tools-project escape hatch: the fixture-freshness proof creates and deletes for real. */
export function resetEnsureMemo(): void {
    memo.clear();
}

interface EntitySpec<TCreate> {
    /** Collection path relative to the API base. */
    path: string;
    /** Key carrying the id in a listed row, e.g. `ranchCounter`. */
    idKey: string;
    /** For messages and annotations. */
    label: string;
    /** Drive the New form. Resolves to the new id, or null when the form rejected. */
    create(deps: OnScreenDeps, spec: TCreate): Promise<number | null>;
    /** Read the record's current state, to decide whether it needs repairing. */
    readDetail?(deps: OnScreenDeps, id: number): Promise<Record<string, unknown>>;
    /** Pure: what is wrong with the record as read. */
    needsRepair?(detail: Record<string, unknown>, spec: TCreate): Repair[];
    /** Put those things right, on screen. */
    repair?(deps: OnScreenDeps, id: number, name: string, repairs: Repair[], spec: TCreate): Promise<void>;
}

interface CodedSpec {
    code: string;
    name: string;
}

async function getDetail(api: APIRequestContext, path: string, id: number): Promise<Record<string, unknown>> {
    const res = await api.get(`${path}/${String(id)}`);
    if (!res.ok()) throw new Error(`GET ${path}/${String(id)} failed with ${String(res.status())}`);
    const text = await res.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function annotate(deps: OnScreenDeps, type: string, description: string): void {
    deps.testInfo?.annotations.push({ type, description });
    logger.info(`${type}: ${description}`);
}

/**
 * The generic core. Every entity differs only in its form.
 *
 * 1. memo hit → return
 * 2. GET by code → `existing`
 * 3. else restore from the recycle bin → `restored` (a binned row still owns its name,
 *    so the create would 409 forever)
 * 4. else drive the New form → `created`; a rejection means another worker won the race
 *    or the name is recycled, so look again before failing
 * 5. read it back and repair on screen what the product would not accept
 */
async function ensureOnScreen<TCreate extends CodedSpec>(
    entity: EntitySpec<TCreate>,
    spec: TCreate,
    deps: OnScreenDeps,
): Promise<EnsuredOnScreen> {
    const key = `${entity.path}:${spec.code}`;
    const remembered = memo.get(key);
    if (remembered) return remembered;

    let record = await findByCode(deps.api, entity.path, spec.code, entity.idKey);
    let source: EnsuredOnScreen['source'] = 'existing';

    if (!record) {
        const restored = await allowApiWrites('arrange', `restore binned ${entity.label} ${spec.code}`, () =>
            restoreFromRecycleBin(deps.api, entity.path, entity.idKey, spec.code, spec.name),
        );
        if (restored) {
            record = restored;
            source = 'restored';
            annotate(deps, 'fixture-restored-via-api', `${entity.label} '${spec.name}' (${spec.code})`);
        }
    }

    if (!record) {
        const id = await entity.create(deps, spec);
        if (id === null) {
            // Lookup-then-create is not atomic, and a recycled name rejects the same way.
            record = await findByCode(deps.api, entity.path, spec.code, entity.idKey);
            if (!record) {
                throw new Error(
                    `The New ${entity.label} form rejected '${spec.name}' (code ${spec.code}) and no ` +
                        'such record exists afterwards, so it was not a lost race. Open the form and ' +
                        'read what it is refusing.',
                );
            }
        } else {
            record = { id, code: spec.code, name: spec.name, created: true };
            source = 'created';
            annotate(deps, 'fixture-created-on-screen', `${entity.label} '${spec.name}' (${spec.code})`);
        }
    }

    // A name mismatch means the code belongs to someone else's record; binding to it
    // would assert against a stranger's data. findByCode cannot see that — it matches
    // on code alone — so it is checked here.
    if (record.name && spec.name && record.name !== spec.name) {
        throw new Error(
            `${entity.path}: code '${spec.code}' belongs to '${record.name}', not the expected ` +
                `'${spec.name}'. Pick a different fixture code or reconcile the record by hand.`,
        );
    }

    const repaired: Repair[] = [];
    if (entity.readDetail && entity.needsRepair && entity.repair && source !== 'created') {
        const detail = await entity.readDetail(deps, record.id);
        const wanted = entity.needsRepair(detail, spec);
        if (wanted.length) {
            await entity.repair(deps, record.id, record.name || spec.name, wanted, spec);
            const after = entity.needsRepair(await entity.readDetail(deps, record.id), spec);
            if (after.length) {
                throw new Error(
                    `${entity.label} '${spec.name}': repaired ${wanted.join(', ')} on screen but the ` +
                        `record still reports ${after.join(', ')} wrong.`,
                );
            }
            repaired.push(...wanted);
            annotate(deps, 'fixture-repaired-on-screen', `${entity.label} '${spec.name}': ${wanted.join(', ')}`);
        }
    }

    const result: EnsuredOnScreen = { ...record, source, repaired };
    memo.set(key, result);
    return result;
}

// ── Entities ────────────────────────────────────────────────────────

const isActive = (detail: Record<string, unknown>): boolean => detail.active !== false;

export interface RanchSpec extends CodedSpec {
    department?: string;
}

const RANCH: EntitySpec<RanchSpec> = {
    path: 'ranches',
    idKey: 'ranchCounter',
    label: 'Ranch',
    async create({ pages }, spec) {
        const outcome = await pages.ranch.createRanch(spec);
        return outcome === 'created' ? pages.ranch.savedIdFromUrl() : null;
    },
    readDetail: ({ api }, id) => getDetail(api, 'ranches', id),
    needsRepair: (detail) => (isActive(detail) ? [] : ['active']),
    async repair({ pages }, id, name) {
        await pages.ranch.gotoEditById(id, name);
        await pages.ranch.setActive(true);
    },
};

export interface FieldSpec extends CodedSpec {
    ranch: { id: number; name: string };
    crop?: string;
    state?: string;
}

const FIELD: EntitySpec<FieldSpec> = {
    path: 'fields',
    idKey: 'fieldCounter',
    label: 'Field',
    async create({ pages }, spec) {
        const outcome = await pages.field.createField({
            name: spec.name,
            code: spec.code,
            ranch: spec.ranch.name,
            crop: spec.crop,
            state: spec.state,
        });
        return outcome === 'created' ? pages.field.savedIdFromUrl() : null;
    },
};

export interface CrewSpec extends CodedSpec {
    shortName?: string;
}

const CREW: EntitySpec<CrewSpec> = {
    path: 'crews',
    idKey: 'crewCounter',
    label: 'Crew',
    async create({ pages }, spec) {
        const outcome = await pages.crew.createCrew(spec);
        return outcome === 'created' ? pages.crew.savedIdFromUrl() : null;
    },
};

export interface EmployeeSpec extends CodedSpec {
    homeCrew?: { id: number; name: string };
}

const EMPLOYEE: EntitySpec<EmployeeSpec> = {
    path: 'employees',
    idKey: 'employeeCounter',
    label: 'Employee',
    async create({ pages }, spec) {
        const [firstName, ...rest] = spec.name.split(' ');
        const outcome = await pages.employee.createEmployee({
            name: spec.name,
            code: spec.code,
            firstName,
            lastName: rest.join(' ') || firstName,
            crew: spec.homeCrew?.name,
        });
        return outcome === 'created' ? pages.employee.savedIdFromUrl() : null;
    },
    readDetail: ({ api }, id) => getDetail(api, 'employees', id),
    needsRepair: (detail, spec) => {
        const repairs: Repair[] = [];
        if (!isActive(detail)) repairs.push('active');
        // The D6 fixture's exact fault: a punch needs a home crew, and nothing in the
        // API path ever said so.
        if (spec.homeCrew && Number(detail.crewCounter ?? 0) !== spec.homeCrew.id) repairs.push('homeCrew');
        return repairs;
    },
    async repair({ pages }, id, name, repairs, spec) {
        await pages.employee.gotoEditById(id, name);
        if (repairs.includes('homeCrew') && spec.homeCrew) await pages.employee.setHomeCrew(spec.homeCrew.name);
        if (repairs.includes('active')) await pages.employee.setActive(true);
    },
};

export interface JobSpec extends CodedSpec {
    paymentType?: 'Time' | 'Piece';
    hourlyRate?: number;
    pieceRate?: number;
}

const JOB: EntitySpec<JobSpec> = {
    path: 'jobs',
    idKey: 'jobCounter',
    label: 'Job',
    async create({ pages }, spec) {
        const outcome = await pages.job.createJob({
            name: spec.name,
            code: spec.code,
            paymentType: spec.paymentType ?? 'Time',
            hourlyRate: spec.hourlyRate,
            pieceRate: spec.pieceRate,
        });
        return outcome === 'created' ? pages.job.savedJobId() : null;
    },
    readDetail: ({ api }, id) => getDetail(api, 'jobs', id),
    needsRepair: (detail) => (isActive(detail) ? [] : ['active']),
    async repair({ pages }, id, name) {
        await pages.job.gotoEditById(id, name);
        await pages.job.setActive(true);
    },
};

export interface CrewTableSpec {
    name: string;
    crew: { id: number; name: string };
    supervisor?: { id: number; name: string };
}

/**
 * Tables carry no code, so the generic core cannot key them: existence is name + crew (uniqueness is
 * per crew). No repair and no recycle-bin restore — `GET crew-tables/{id}` and `/deleted` both 500 on dev.
 */
export async function ensureCrewTableOnScreen(
    spec: CrewTableSpec,
    deps: OnScreenDeps,
): Promise<CrewTableRecord & { source: 'existing' | 'created' }> {
    const find = async (): Promise<CrewTableRecord | undefined> =>
        (await listCrewTables(deps.api)).find(
            (t) => String(t.name ?? '').trim() === spec.name.trim() && Number(t.crewCounter) === spec.crew.id,
        );

    const existing = await find();
    if (existing) return { ...existing, source: 'existing' };

    const outcome = await deps.pages.crewTable.createTable({
        name: spec.name,
        crew: spec.crew.name,
        supervisor: spec.supervisor?.name,
    });
    if (outcome === 'created') {
        annotate(deps, 'fixture-created-on-screen', `Table '${spec.name}' under crew '${spec.crew.name}'`);
        return {
            crewTableCounter: deps.pages.crewTable.savedTableId(),
            name: spec.name,
            crewCounter: spec.crew.id,
            supervisorCounter: spec.supervisor?.id ?? null,
            source: 'created',
        };
    }
    // Lookup-then-create is not atomic: a rejection can be another worker winning the race.
    const raced = await find();
    if (!raced) {
        throw new Error(
            `The New Table form rejected '${spec.name}' under crew '${spec.crew.name}' and no such table ` +
                'exists afterwards, so it was not a lost race. Open the form and read what it is refusing.',
        );
    }
    return { ...raced, source: 'existing' };
}

export interface OvertimeRuleSpec {
    name: string;
    overtimeDailyHours: number;
    doubleTimeDailyHours: number;
    wageOrder: string;
    agType: boolean;
}

/**
 * Rules carry no code, so they are keyed by name. The list read only decides create-or-open; the
 * thresholds, wage order and Ag Type are read back from the Edit form and repaired there.
 */
export async function ensureOvertimeRuleOnScreen(
    spec: OvertimeRuleSpec,
    deps: OnScreenDeps,
): Promise<{ id: number; name: string; source: 'existing' | 'created'; repaired: boolean }> {
    const exists = async (): Promise<boolean> => {
        const res = await deps.api.get('overtime-rules');
        if (!res.ok()) throw new Error(`GET overtime-rules failed with ${String(res.status())}`);
        const body = (await res.json()) as Record<string, unknown>[] | { items?: Record<string, unknown>[] };
        const rows = Array.isArray(body) ? body : (body.items ?? []);
        return rows.some((r) => String(r.name ?? '').trim() === spec.name.trim() && r.active !== false);
    };
    const { overtimeRule } = deps.pages;

    if (!(await exists())) {
        if ((await overtimeRule.createRule(spec)) === 'created') {
            annotate(deps, 'fixture-created-on-screen', `Over-Time Rule '${spec.name}'`);
            return { id: overtimeRule.savedIdFromUrl(), name: spec.name, source: 'created', repaired: false };
        }
        // Lookup-then-create is not atomic; a binned rule keeps its name (WEBPET-2368) and rejects the same way.
        if (!(await exists())) {
            throw new Error(
                `The New Over-Time Rule form rejected '${spec.name}' and no such rule exists afterwards, so it was not a ` +
                    'lost race — a recycle-bin rule may still own the name. Check Deleted Records.',
            );
        }
    }

    await overtimeRule.openByName(spec.name);
    const id = overtimeRule.savedIdFromUrl();
    const before = await overtimeRule.readRule();
    const after = await overtimeRule.setRule(spec);
    const wanted = { overtimeDailyHours: spec.overtimeDailyHours, doubleTimeDailyHours: spec.doubleTimeDailyHours, wageOrder: spec.wageOrder, agType: spec.agType };
    if (JSON.stringify(after) !== JSON.stringify(wanted)) {
        throw new Error(`Over-Time Rule '${spec.name}': repaired on screen but the form reads ${JSON.stringify(after)}, wanted ${JSON.stringify(wanted)}.`);
    }
    const repaired = JSON.stringify(before) !== JSON.stringify(after);
    if (repaired) annotate(deps, 'fixture-repaired-on-screen', `Over-Time Rule '${spec.name}': ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    return { id, name: spec.name, source: 'existing', repaired };
}

// ── Public API ──────────────────────────────────────────────────────

export const ensureRanchOnScreen = (spec: RanchSpec, deps: OnScreenDeps) => ensureOnScreen(RANCH, spec, deps);
export const ensureFieldOnScreen = (spec: FieldSpec, deps: OnScreenDeps) => ensureOnScreen(FIELD, spec, deps);
export const ensureCrewOnScreen = (spec: CrewSpec, deps: OnScreenDeps) => ensureOnScreen(CREW, spec, deps);
export const ensureEmployeeOnScreen = (spec: EmployeeSpec, deps: OnScreenDeps) => ensureOnScreen(EMPLOYEE, spec, deps);
export const ensureJobOnScreen = (spec: JobSpec, deps: OnScreenDeps) => ensureOnScreen(JOB, spec, deps);
