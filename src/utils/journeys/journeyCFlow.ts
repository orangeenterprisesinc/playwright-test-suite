import type { APIRequestContext, TestInfo } from '@playwright/test';
import { makeCrewTableName } from '@data/generated';
import { JOURNEY_C_FIXTURE } from '@data/journey-c/fixture';
import { punchDay } from '@data/journey-b/fixture';
import type { CrewTableCase } from '@data/schemas/journeyCScenario';
import { ensureCrewTable, findCrewTableByName, type CrewTableRecord } from '@utils/api/crewTablesApi';
import { createCrewTimeIn, listCrewTimeIns, punchTime, type CrewTimeInRow } from '@utils/api/crewTimeInApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import { ensureCrew, ensureEmployee, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { CARD_TYPE, findByReferences, isoDay } from '@utils/api/timeCardsApi';
import { currentScope } from '@utils/cleanup/cleanupScope';
import { runCleanup, type CleanupContext } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';

// Journey C: the kiosk is the real capture surface and has no office-side automation. This layer
// owns the office half: the crew and its workers, the table (minted name or fixed fixture row), the
// crew time-in that stands in for the kiosk sync, and the day's punches grouped by table.

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
 * Seeds the office side, sweeps the fixture day, and binds the table name into the case. A minted
 * table is created by the spec on screen (C6-001); the fixture table is ensured here (C6-002).
 */
export async function prepareJourneyC(
    scenario: CrewTableCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<JourneyCRun> {
    const { sessionApi, testInfo } = opts;
    const F = JOURNEY_C_FIXTURE;
    const tableName = scenario.table.source === 'minted' ? makeCrewTableName() : F.table.name;
    const substituted = substituteTokens(scenario, { tableName });
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [] };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, () =>
        runCleanup(substituted.cleanup, sessionApi, testInfo, ctx),
    );
    const cleanup = async (): Promise<void> => {
        await runCleanup(substituted.cleanup, sessionApi, testInfo, ctx);
        registration?.complete();
    };

    // Journey B's rows give the punch its ranch/field/job; the crew and members are Journey C's own.
    const office = await seedOfficeFixture(sessionApi);
    office.crew = await ensureCrew(sessionApi, F.crew);
    office.employees = new Map<string, EnsuredRecord>();
    for (const person of [...F.tableWorkers, F.supervisor]) {
        office.employees.set(person.code, await ensureEmployee(sessionApi, person));
    }
    ctx.office = office;
    const supervisor = office.employees.get(F.supervisor.code)!;
    const member = (code: string): EnsuredRecord => {
        const hit = office.employees.get(code);
        if (!hit) throw new Error(`${substituted.label}: code '${code}' is not in the Journey C fixture`);
        return hit;
    };
    const workers = (substituted.capture?.workerCodes ?? []).map(member);
    const offTable = (substituted.capture?.offTableCodes ?? []).map(member);

    const table =
        substituted.table.source === 'fixture'
            ? await ensureCrewTable(sessionApi, {
                  name: tableName,
                  crewCounter: office.crew.id,
                  supervisorCounter: substituted.table.withSupervisor ? supervisor.id : null,
              })
            : null;

    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });

    return { scenario: substituted, tableName, table, office, supervisor, workers, offTable, punchDate, day, cleanup, ctx };
}

/** The run's table as the API lists it now — after C6-001 saved it on screen, or the fixture row. */
export function lookupTable(run: JourneyCRun, sessionApi: APIRequestContext): Promise<CrewTableRecord | null> {
    return findCrewTableByName(sessionApi, run.tableName);
}

export interface CaptureResult {
    /** References in the order the server created them: on-table workers first, then off-table. */
    references: string[];
    /** The on-table punches as `GET time-cards/crew-time-in` lists them (the read that carries the table). */
    onTable: CrewTimeInRow[];
    offTable: CrewTimeInRow[];
}

/**
 * Clock the run's workers in against the table through `POST time-cards/crew-time-in`, the write
 * the kiosk's sync would perform, and the off-table members with no table. It is a substitute for
 * the transport, not for the assertions: it proves the office stores and groups the punches by
 * table, not the device-to-office pipeline.
 */
export async function captureByTable(
    run: JourneyCRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<CaptureResult> {
    const { sessionApi, testInfo } = opts;
    if (!run.table) throw new Error(`${run.scenario.label}: no table record to capture against`);
    if (!run.workers.length) throw new Error(`${run.scenario.label}: no capture.workerCodes, nothing to clock in`);
    testInfo.annotations.push({
        type: 'transport-substitute',
        description:
            'Punches were written through POST time-cards/crew-time-in (the write the kiosk sync performs) ' +
            'with the table selected; the kiosk itself is out of automated scope.',
    });
    const { hour, minute } = run.scenario.punch;
    const context = {
        dateTime: punchTime(hour, minute, run.punchDate),
        crewCounter: run.office.crew.id,
        ranchCounter: run.office.ranch.id,
        fieldCounter: run.office.field.id,
        jobCounter: run.office.job.id,
    };
    const onTable = await createCrewTimeIn(sessionApi, {
        ...context,
        employeeIds: run.workers.map((w) => w.id),
        crewTableCounter: run.table.crewTableCounter,
    });
    const offTable = run.offTable.length
        ? await createCrewTimeIn(sessionApi, { ...context, employeeIds: run.offTable.map((w) => w.id), crewTableCounter: null })
        : { created: 0, references: [] };
    const references = [...onTable.references, ...offTable.references];

    // The generic card list is what cleanup deletes by; the crew-time-in list is what carries the table.
    run.ctx.cards = await findByReferences(sessionApi, references, {
        from: run.day,
        to: run.day,
        cardType: CARD_TYPE.timeIn,
        timeoutMs: 30_000,
        testInfo,
    });
    const rows = await listCrewTimeIns(sessionApi, { from: run.day, to: run.day });
    const byReference = new Map(rows.map((r) => [String(r.reference ?? ''), r]));
    const pick = (refs: string[]) => refs.map((ref) => byReference.get(ref)).filter((r): r is CrewTimeInRow => r !== undefined);
    const result = { references, onTable: pick(onTable.references), offTable: pick(offTable.references) };
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
