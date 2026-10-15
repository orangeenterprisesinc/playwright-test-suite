import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { makeCrewTableName } from '@data/generated';
import { JOURNEY_C_FIXTURE } from '@data/journey-c/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import type { CrewTableCase } from '@data/schemas/journeyCScenario';
import type { CrewTableRecord } from '@utils/api/crewTablesApi';
import { listCrewTimeIns, type CrewTimeInRow } from '@utils/api/crewTimeInApi';
import type { OfficeFixture } from '@utils/api/officeFixture';
import type { EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { CARD_TYPE, isoDay, listTimeCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { currentScope } from '@utils/cleanup/cleanupScope';
import { runCleanup, type CleanupContext } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';
import {
    ensureCrewOnScreen,
    ensureCrewTableOnScreen,
    ensureEmployeeOnScreen,
    ensureFieldOnScreen,
    ensureJobOnScreen,
    ensureRanchOnScreen,
} from '@utils/fixtureRows/ensureOnScreen';

// Journey C: the kiosk is the real capture surface and has no office-side automation. This layer
// owns the office half: the crew and its workers, the table (minted name or fixed fixture row), the
// punches entered on Input > Batch > Crew Time In, and the day's punches grouped by table.

export interface JourneyCRun {
    /** The case with `{tableName}` substituted. */
    scenario: CrewTableCase;
    /** The table's name: run-unique for `source: minted`, the fixture's for `source: fixture`. */
    tableName: string;
    /** The fixture table record (`source: fixture`); null for a minted table until the spec creates it. */
    table: CrewTableRecord | null;
    /** Journey B's ranch/field/job plus Journey C's own crew and members under `employees`. */
    office: OfficeFixture;
    supervisor: EnsuredRecord;
    /** Fixture workers in `capture.workerCodes` order (empty for a setup-only case). */
    workers: EnsuredRecord[];
    /** Fixture members clocked in with no table, in `capture.offTableCodes` order. */
    offTable: EnsuredRecord[];
    punchDate: Date;
    /** `YYYY-MM-DD` of the fixture day. */
    day: string;
    /** The case's cleanup steps, 'after' phase; also registered with the test's cleanup scope. */
    cleanup(): Promise<void>;
    /** Shared with captureByTable so the cards it finds are the ones the after-phase deletes. */
    readonly ctx: CleanupContext;
}

/**
 * Ensures the office side on screen (ranch, field, job, crew, its members, the fixture table),
 * sweeps the fixture day, and binds the table name into the case. A minted table is created by the
 * spec on screen; the fixture table is ensured here.
 */
export async function prepareJourneyC(
    scenario: CrewTableCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<JourneyCRun> {
    const { sessionApi, testInfo, pages } = opts;
    const F = JOURNEY_C_FIXTURE;
    const B = JOURNEY_B_FIXTURE;
    const tableName = scenario.table.source === 'minted' ? makeCrewTableName() : F.table.name;
    const substituted = substituteTokens(scenario, { tableName });
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [] };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, (api) =>
        runCleanup(substituted.cleanup, api, testInfo, ctx),
    );
    const cleanup = async (): Promise<void> => {
        await runCleanup(substituted.cleanup, sessionApi, testInfo, ctx);
        registration?.complete();
    };

    const deps = { api: sessionApi, pages, testInfo };
    const ranch = await ensureRanchOnScreen({ code: B.ranch.code, name: B.ranch.name }, deps);
    const field = await ensureFieldOnScreen(
        { code: B.field.code, name: B.field.name, ranch: { id: ranch.id, name: ranch.name } },
        deps,
    );
    const job = await ensureJobOnScreen({ code: B.job.code, name: B.job.name, paymentType: B.job.paymentType }, deps);
    // The crew first: the New Employee form's Crew combobox arrives pre-filled with another crew, and
    // the Crew Time In roster comes from crew membership.
    const crew = await ensureCrewOnScreen(F.crew, deps);
    const homeCrew = { id: crew.id, name: crew.name };
    const employees = new Map<string, EnsuredRecord>();
    for (const person of [...F.tableWorkers, F.supervisor]) {
        employees.set(person.code, await ensureEmployeeOnScreen({ ...person, homeCrew }, deps));
    }

    // Cleanup reads only `employees`; the rest of OfficeFixture is Journey B's, so this is deliberately partial.
    const office = { ranch, field, job, crew, employees } as unknown as OfficeFixture;
    ctx.office = office;
    const supervisor = employees.get(F.supervisor.code)!;
    const member = (code: string): EnsuredRecord => {
        const hit = employees.get(code);
        if (!hit) throw new Error(`${substituted.label}: code '${code}' is not in the Journey C fixture`);
        return hit;
    };
    const workers = (substituted.capture?.workerCodes ?? []).map(member);
    const offTable = (substituted.capture?.offTableCodes ?? []).map(member);

    const table =
        substituted.table.source === 'fixture'
            ? await ensureCrewTableOnScreen(
                  {
                      name: tableName,
                      crew: homeCrew,
                      supervisor: substituted.table.withSupervisor ? { id: supervisor.id, name: supervisor.name } : undefined,
                  },
                  deps,
              )
            : null;

    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });

    return { scenario: substituted, tableName, table, office, supervisor, workers, offTable, punchDate, day, cleanup, ctx };
}

export interface CaptureResult {
    /** References in the order the server created them: on-table workers first, then off-table. */
    references: string[];
    /** The on-table punches as `GET time-cards/crew-time-in` lists them (the read that carries the table). */
    onTable: CrewTimeInRow[];
    offTable: CrewTimeInRow[];
}

/**
 * Clock the run's workers in against the table on Input > Batch > Crew Time In, then the off-table
 * members with no table, and read the day's punches back. The card ids are recorded before the
 * caller asserts anything, so cleanup knows them even when an assertion fails.
 */
export async function captureByTable(
    run: JourneyCRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<CaptureResult> {
    const { sessionApi, testInfo, pages } = opts;
    if (!run.table) throw new Error(`${run.scenario.label}: no table record to capture against`);
    if (!run.workers.length) throw new Error(`${run.scenario.label}: no capture.workerCodes, nothing to clock in`);
    const { hour, minute } = run.scenario.punch;
    const context = {
        day: run.day,
        hour,
        minute,
        crew: run.office.crew.name,
        ranch: run.office.ranch.name,
        field: run.office.field.name,
        job: run.office.job.name,
    };

    await pages.crewTimeIn.punchIn({ ...context, table: run.tableName, employees: run.workers.map((w) => w.name) });
    if (run.offTable.length) {
        await pages.crewTimeIn.punchIn({ ...context, employees: run.offTable.map((w) => w.name) });
    }

    const crewId = run.office.crew.id;
    const employeeIds = new Set([...run.workers, ...run.offTable].map((w) => w.id));
    const expectedCount = run.workers.length + run.offTable.length;
    let cards: OfficeTimeCard[] = [];
    await expect(async () => {
        cards = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter(
            (c) =>
                Number(c.crewCounter) === crewId &&
                Number(c.cardType) === CARD_TYPE.timeIn &&
                c.transferred !== true &&
                employeeIds.has(Number(c.employeeCounter)),
        );
        expect(cards).toHaveLength(expectedCount);
    }).toPass({ timeout: 60_000 });
    run.ctx.cards = cards;

    const references = cards.map((c) => String(c.reference ?? ''));
    const rows = await listCrewTimeIns(sessionApi, { from: run.day, to: run.day });
    const byReference = new Map(rows.map((r) => [String(r.reference ?? ''), r]));
    const found = references.map((ref) => byReference.get(ref)).filter((r): r is CrewTimeInRow => r !== undefined);
    const tableId = run.table.crewTableCounter;
    const result: CaptureResult = {
        references,
        onTable: found.filter((r) => Number(r.crewTableCounter ?? 0) === tableId),
        offTable: found.filter((r) => Number(r.crewTableCounter ?? 0) !== tableId),
    };
    await testInfo.attach(`crew-time-in-${run.scenario.label}.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    return result;
}

export interface TableRollUp {
    /** Every crew time-in punch of the fixture crew on the fixture day. */
    crewRows: CrewTimeInRow[];
    /** Rows keyed by `crewTableCounter` (`0` = no table). */
    byTable: Map<number, CrewTimeInRow[]>;
    onTable: CrewTimeInRow[];
    offTable: CrewTimeInRow[];
}

/**
 * The reporting view C6 describes, at data level: the crew's day grouped by table. A table is a
 * grouping, not a structure, so the groups must partition the crew total exactly.
 */
export async function rollUpByTable(run: JourneyCRun, sessionApi: APIRequestContext): Promise<TableRollUp> {
    if (!run.table) throw new Error(`${run.scenario.label}: no table record to roll up by`);
    const crewId = run.office.crew.id;
    const tableId = run.table.crewTableCounter;
    const crewRows = (await listCrewTimeIns(sessionApi, { from: run.day, to: run.day })).filter((r) => Number(r.crewCounter) === crewId);
    const byTable = new Map<number, CrewTimeInRow[]>();
    for (const row of crewRows) {
        const key = Number(row.crewTableCounter ?? 0);
        byTable.set(key, [...(byTable.get(key) ?? []), row]);
    }
    return {
        crewRows,
        byTable,
        onTable: byTable.get(tableId) ?? [],
        offTable: crewRows.filter((r) => Number(r.crewTableCounter ?? 0) !== tableId),
    };
}
