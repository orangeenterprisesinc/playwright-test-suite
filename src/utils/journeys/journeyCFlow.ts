import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { makeCrewTableName } from '@data/generated';
import { JOURNEY_C_FIXTURE } from '@data/journey-c/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import type { CrewTableCase } from '@data/schemas/journeyCScenario';
import type { CrewTableRecord } from '@utils/api/crewTablesApi';

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
// crew clocked in on Input > Batch > Crew Time In (no table since WEBPET-3734), clocked out on Crew
// Time Out (the table), and the day's punches grouped by table.

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
    /** Fixture members clocked out with no table, in `capture.offTableCodes` order. */
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
    /** The crew's Time In cards (card type 1), one per member. */
    timeIns: OfficeTimeCard[];
    /** The Time Out cards (card type 0): on-table workers first, then off-table. */
    timeOuts: OfficeTimeCard[];
}

/**
 * Clock the whole crew in on Input > Batch > Crew Time In (no table), then the table's workers out
 * on Crew Time Out with the table and the off-table members out with none. The card ids are
 * recorded (plumbing poll) before the caller asserts anything, so cleanup knows them even when a
 * later step fails; the screens prove the capture.
 */
export async function captureByTable(
    run: JourneyCRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<CaptureResult> {
    const { sessionApi, pages } = opts;
    if (!run.table) throw new Error(`${run.scenario.label}: no table record to capture against`);
    if (!run.workers.length) throw new Error(`${run.scenario.label}: no capture.workerCodes, nothing to clock out`);
    const { timeIn, timeOut } = run.scenario;
    const crew = run.office.crew.name;
    const members = [...run.workers, ...run.offTable];
    const employeeIds = new Set(members.map((w) => w.id));

    // The crew is left out of the poll's filter so the screens, not the poll, prove the card's crew.
    const pollCards = async (cardType: number): Promise<OfficeTimeCard[]> => {
        let cards: OfficeTimeCard[] = [];
        await expect(async () => {
            cards = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter(
                (c) => Number(c.cardType) === cardType && c.transferred !== true && employeeIds.has(Number(c.employeeCounter)),
            );
            expect(cards).toHaveLength(members.length);
        }).toPass({ timeout: 60_000 });
        return cards;
    };

    await pages.crewTimeIn.punchIn({
        day: run.day,
        ...timeIn,
        crew,
        ranch: run.office.ranch.name,
        field: run.office.field.name,
        job: run.office.job.name,
        employees: members.map((w) => w.name),
    });
    const timeIns = await pollCards(CARD_TYPE.timeIn);
    run.ctx.cards = timeIns;

    await pages.crewTimeOut.punchOut({
        day: run.day,
        ...timeOut,
        crew,
        table: run.tableName,
        employees: run.workers.map((w) => w.name),
    });
    if (run.offTable.length) {
        await pages.crewTimeOut.punchOut({ day: run.day, ...timeOut, crew, employees: run.offTable.map((w) => w.name) });
    }
    const timeOuts = await pollCards(CARD_TYPE.timeOut);
    run.ctx.cards = [...timeIns, ...timeOuts];

    return { timeIns, timeOuts };
}

export interface CapturedPunch {
    reference: string;
    /** The Table picker's value on the saved time-out; '' when none was chosen. */
    table: string;
    crew: string;
    /** Run employee the saved punch belongs to, by name (one time card = one employee); [] if none matched. */
    employees: string[];
}

/** Reopens each Time Out on Crew Time Out for Table and Crew, then reads its employee from View > Time Cards. */
export async function readCapturedPunchesOnScreen(
    run: JourneyCRun,
    pages: PageObjects,
    timeOuts: OfficeTimeCard[],
): Promise<CapturedPunch[]> {
    const names = [...run.workers, ...run.offTable].map((w) => w.name);
    const page = pages.crewTimeOut;
    const punches: CapturedPunch[] = [];
    // `timeOuts` was recorded by captureByTable's poll (plumbing), before anything is asserted.
    for (const card of timeOuts) {
        const reference = String(card.reference ?? '');
        await page.gotoEdit({ day: run.day, reference });
        // The pickers fill after the form renders; Crew is always set, so it marks the Table picker as readable too.
        await expect.poll(() => page.readCrew(), { timeout: 15_000, message: `${reference}: the Crew Time Out form never filled its Crew` }).not.toBe('');
        punches.push({ reference, table: await page.readTable(), crew: await page.readCrew(), employees: [] });
    }

    // A saved punch is one time card: its edit page has no Employee field or roster, so the
    // employee comes from the View > Time Cards record sheet for the same reference.
    const view = pages.viewTimeCards;
    await view.openFromMenu();
    await view.scopeToDay(run.day);
    await view.applyFilter();
    for (const punch of punches) {
        await view.openRecord(punch.reference);
        const shown = (await view.readRecord()).employee;
        await view.closeRecord();
        punch.employees = names.filter((name) => shown.includes(name));
    }
    return punches;
}

/** View ▸ Time Cards for the fixture day, scoped to the C6 crew: how many rows the crew's day shows. The grid has no Table column. */
export async function countCrewRowsOnScreen(run: JourneyCRun, pages: PageObjects): Promise<number> {
    const view = pages.viewTimeCards;
    await view.openFromMenu();
    await view.scopeToDay(run.day);
    await view.applyFilter();
    // The employee pass left the last Reference in the column filter, and it survives the re-entry.
    await view.clearReferenceFilter();
    await view.filterByCrew(run.office.crew.name);
    return view.totalRows();
}
