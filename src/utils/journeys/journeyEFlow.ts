import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import type { JourneyE13WageOrderSplitCase, JourneyE6RoundingCase, JourneyE8FinalizeCase } from '@data/schemas/journeyEScenario';
import { journeyE11Fixture, journeyE13Fixture, journeyE2Fixture } from '@data/journey-e/fixture';
import type { JourneyE11ReverseExportCase } from '@data/schemas/journeyEScenario';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import { deleteJobCard, getJobCard, listJobCards } from '@utils/api/jobCardsApi';
import { getPreferences, putPreferences } from '@utils/api/preferencesApi';
import { cleanupExportRuns, healExportResidue, listReversibleRuns, runIdOf } from '@utils/api/exportToAccountingApi';
import type { OfficeFixture } from '@utils/api/officeFixture';
import { CARD_TYPE, deleteTimeCard, isoDay, listTimeCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import type { EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { allowApiWrites } from '@utils/api/writeGuard';
import { currentScope } from '@utils/cleanup/cleanupScope';
import { withPreferencesLock } from '@utils/sync/preferencesLock';
import { runCleanup, type CleanupContext, type CleanupStep } from '@utils/cleanup/runCleanup';
import type { SeedResult } from '@utils/journeys/journeyDFlow';
import {
    ensureCrewOnScreen,
    ensureEmployeeOnScreen,
    ensureFieldOnScreen,
    ensureJobOnScreen,
    ensureOvertimeRuleOnScreen,
    ensureRanchOnScreen,
} from '@utils/fixtureRows/ensureOnScreen';

// One spec imports one flow module: the D-flow transfer helpers are re-exported rather than moved.
export {
    FRESH_EXPORTED_CELL,
    READY_STATUS,
    assertTransferredOnScreen,
    clock,
    commitTransfer,
    guardReversibleRun,
    openScopedCandidates,
    openViewJobCardsForDay,
    previewClock,
    recordOwnJobCardIds,
} from '@utils/journeys/journeyDFlow';
export type { SeedResult, TransferOutcome } from '@utils/journeys/journeyDFlow';
import {
    assertTransferredOnScreen,
    clock,
    commitTransfer,
    guardReversibleRun,
    openScopedCandidates,
    openViewJobCardsForDay,
    type TransferOutcome,
} from '@utils/journeys/journeyDFlow';

interface Clock {
    hour: number;
    minute: number;
}

/** The slice of the E2 scenario the flow reads; the scenario schema satisfies it structurally. */
export interface E2Setup {
    label: string;
    dayOffset: number;
    rule: { name: string };
    capture: { timeIn: Clock; timeOut: Clock };
    expected: { timeCards: number; jobCards: number; hourlyRate: number; mealMinutes: number };
    cleanup: CleanupStep[];
}

// TransferRun is not exported from journeyDFlow, so this only has to satisfy its shape.
export interface JourneyE2Run {
    scenario: E2Setup;
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    crew: EnsuredRecord;
    picker: EnsuredRecord;
    job: EnsuredRecord;
    /** Resolved from GET /overtime-rules by name at run time, never hard-coded. */
    ruleCounter: number;
    /** `YYYY-MM-DD` of the fixture day. */
    day: string;
    /** Filled by commitTransfer / readers; cleanup deletes these first, one at a time, by id. */
    jobCardIds: number[];
    /** Recorded as soon as the day is seeded, before any assertion. */
    timeCardIds: number[];
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}

type Json = Record<string, unknown>;

/** E11 runs prepareJourneyE2 on its own job and heals its export residue before the sweeps; E2/E8 pass nothing. */
export interface PrepareE2Overrides {
    job?: { code: string; name: string; paymentType: 'Time' | 'Piece'; hourlyRate: number; earningCodes?: string };
    beforeSweep?: (run: { crew: EnsuredRecord; day: string }) => Promise<void>;
}

async function getJson(api: APIRequestContext, path: string): Promise<Json> {
    const res = await api.get(path);
    if (!res.ok()) throw new Error(`GET ${path} failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as Json;
}

async function resolveRuleCounter(api: APIRequestContext, name: string): Promise<number> {
    const res = await api.get('overtime-rules');
    if (!res.ok()) throw new Error(`GET overtime-rules failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as Json[] | { items?: Json[] };
    const rules = Array.isArray(body) ? body : (body.items ?? []);
    const match = rules.find((r) => r.name === name && r.active !== false);
    if (!match) {
        throw new Error(
            `No active overtime rule named '${name}'. This environment offers: ${JSON.stringify(rules.map((r) => ({ name: r.name, active: r.active })))}`,
        );
    }
    return Number(match.jobTypeCounter);
}

async function sweepCrewJobCards(api: APIRequestContext, opts: { day: string; crewCounter: number }): Promise<void> {
    const cards = (await listJobCards(api, { from: opts.day, to: opts.day })).filter((c) => Number(c.crewCounter) === opts.crewCounter);
    for (const card of cards) await deleteJobCard(api, card.jobCardCounter, card.version);
}

async function sweepCrewTimeCards(api: APIRequestContext, opts: { day: string; crewCounter: number }): Promise<void> {
    const cards = (await listTimeCards(api, { from: opts.day, to: opts.day })).filter((c) => Number(c.crewCounter) === opts.crewCounter);
    for (const card of cards) await deleteTimeCard(api, card.timeCardCounter);
}

/**
 * Fixture rows on screen, then the overtime rule and hourly rate through the Job form on every run
 * (ensureOnScreen applies neither), the read-back gates, and the before-phase sweep — job cards
 * first, because a transferred time card cannot be deleted.
 */
export async function prepareJourneyE2(
    scenario: E2Setup,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
    overrides: PrepareE2Overrides = {},
): Promise<JourneyE2Run> {
    const { sessionApi, testInfo, pages } = opts;
    const F = journeyE2Fixture();
    const J = overrides.job ?? F.job;
    const deps = { api: sessionApi, pages, testInfo };

    const ranch = await ensureRanchOnScreen({ code: JOURNEY_B_FIXTURE.ranch.code, name: JOURNEY_B_FIXTURE.ranch.name }, deps);
    const field = await ensureFieldOnScreen(
        { code: JOURNEY_B_FIXTURE.field.code, name: JOURNEY_B_FIXTURE.field.name, ranch: { id: ranch.id, name: ranch.name } },
        deps,
    );
    // The crew first: the New Employee form's Crew combobox arrives pre-filled with another crew.
    const crew = await ensureCrewOnScreen(F.crew, deps);
    const picker = await ensureEmployeeOnScreen({ ...F.picker, homeCrew: { id: crew.id, name: crew.name } }, deps);
    const job = await ensureJobOnScreen(
        { code: J.code, name: J.name, paymentType: J.paymentType, hourlyRate: J.hourlyRate },
        deps,
    );

    const day = isoDay(punchDay(scenario.dayOffset));
    const jobCardIds: number[] = [];
    const timeCardIds: number[] = [];
    // runCleanup reads `employees` (timeCards step) and `job.id` (e2JobRuleAndRate restore); the rest of OfficeFixture is Journey B's.
    const office = { ranch, field, job, crew, employees: new Map([[picker.code, picker]]) } as unknown as OfficeFixture;
    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };

    const warn = (name: string, error: unknown) =>
        testInfo.attach(name, { body: error instanceof Error ? error.message : String(error), contentType: 'text/plain' });

    // `api` is the scope's own untraced context: after a timeout the test's sessionApi throws ENOENT
    // on its trace file before any call reaches the network.
    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        await allowApiWrites('cleanup', 'E2 teardown: own job cards by id', async () => {
            for (const id of jobCardIds) {
                try {
                    const card = await getJobCard(api, id);
                    await deleteJobCard(api, id, card.version);
                } catch (error) {
                    await warn(`cleanup-warning-jobCard-${id}`, error);
                }
            }
        });
        // The declared steps (timeCards sweep, e2JobRuleAndRate restore). 'after' never throws.
        await runCleanup(scenario.cleanup, api, testInfo, ctx);
        await allowApiWrites('cleanup', 'E2 teardown: own time cards by id', async () => {
            for (const id of timeCardIds) {
                try {
                    await deleteTimeCard(api, id);
                } catch (error) {
                    await warn(`cleanup-warning-timeCard-${id}`, error);
                }
            }
        });
        await allowApiWrites('cleanup', 'E2 teardown: crew-scoped day sweep', () => sweepCrewTimeCards(api, { day, crewCounter: crew.id })).catch(
            () => undefined,
        );
    };
    const registration = currentScope(testInfo)?.add(`${scenario.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    // Fixture gate: resolves the rule id the field gate below compares against; it throws, it is not proof.
    const ruleCounter = await resolveRuleCounter(sessionApi, scenario.rule.name);

    await overrides.beforeSweep?.({ crew, day });

    // Before phase, ahead of the Job form: job cards first (a transferred time card cannot be deleted), then the
    // declared steps — the timeCards sweep and the e2JobRuleAndRate snapshot, which must capture the pre-change job.
    await allowApiWrites('cleanup', 'E2 before-phase: crew job cards', () => sweepCrewJobCards(sessionApi, { day, crewCounter: crew.id }));
    await runCleanup(scenario.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', 'E2 before-phase: crew time cards', () => sweepCrewTimeCards(sessionApi, { day, crewCounter: crew.id }));

    // Both setters need a hydrated form and both leave it after saving, so the record is reopened between them.
    // Each returns what the form shows after a fresh load, which is the proof that the Job form saved it.
    await pages.job.gotoEditById(job.id, job.name);
    const shownRule = await pages.job.setOvertimeRule(scenario.rule.name);
    await pages.job.gotoEditById(job.id, job.name);
    const shownRate = await pages.job.setHourlyRate(scenario.expected.hourlyRate);
    expect(shownRule, `${scenario.label}: the Job form must show the overtime rule after saving`).toContain(scenario.rule.name);
    expect(Number(shownRate), `${scenario.label}: the Job form must show the hourly rate after saving`).toBe(scenario.expected.hourlyRate);
    if (overrides.job?.earningCodes !== undefined) {
        await pages.job.gotoEditById(job.id, job.name);
        const shownCodes = await pages.job.setEarningCodes(overrides.job.earningCodes);
        expect(shownCodes, `${scenario.label}: the Job form must show the earning codes after saving`).toBe(overrides.job.earningCodes);
    }

    // fixture-gate: the crew/employee/field reads below throw on a fixture the day's arithmetic cannot tolerate; they are not proof.
    const storedCrew = await getJson(sessionApi, `crews/${crew.id}`);
    expect(
        {
            exerciseJobCounter: Number(storedCrew.exerciseJobCounter ?? 0),
            createBreakCardFromTimeIn: Number(storedCrew.createBreakCardFromTimeIn ?? 0),
            autoPaidBreakType: Number(storedCrew.autoPaidBreakType ?? 0),
            autoReturnFromBreak: Number(storedCrew.autoReturnFromBreak ?? 0),
            lunchLengthMinutes: Number(storedCrew.lunchLengthMinutes ?? 0),
        },
        `${scenario.label}: E2 CREW must carry no exercise job, break automation or lunch other than the scenario's meal`,
    ).toEqual({
        exerciseJobCounter: 0,
        createBreakCardFromTimeIn: 0,
        autoPaidBreakType: 0,
        autoReturnFromBreak: 0,
        lunchLengthMinutes: scenario.expected.mealMinutes,
    });

    const storedEmployee = await getJson(sessionApi, `employees/${picker.id}`);
    const rateKeys = Object.keys(storedEmployee).filter((k) => /rate/i.test(k));
    testInfo.annotations.push({
        type: 'employee-evidence',
        description: rateKeys.map((k) => `${k}=${String(storedEmployee[k])}`).join(' ') || 'no rate-like keys',
    });
    for (const key of ['hourlyRate', 'payRate', 'rate']) {
        if (Number(storedEmployee[key] ?? 0) > 0) {
            throw new Error(`${scenario.label}: ${picker.name} carries ${key}=${String(storedEmployee[key])}, which could displace the job's rate.`);
        }
    }

    const storedField = await getJson(sessionApi, `fields/${field.id}`);
    testInfo.annotations.push({
        type: 'field-evidence',
        description: `overTimeRulesCounter=${String(storedField.overTimeRulesCounter)} stateCounter=${String(storedField.stateCounter)}`,
    });
    if (storedField.overTimeRulesCounter != null && Number(storedField.overTimeRulesCounter) !== ruleCounter) {
        throw new Error(
            `${scenario.label}: field ${field.name} carries overtime rule ${String(storedField.overTimeRulesCounter)} but the job carries ${ruleCounter}; precedence is unverified.`,
        );
    }

    // Read, never written: a moved window must fail loudly rather than skip. The employeeMeal* keys are
    // recorded only — PR #103 measured no meal from them on a crew day; the crew's lunch is checked above.
    const preferences = await getPreferences(sessionApi);
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(scenario.dayOffset))) {
        throw new Error(
            `${scenario.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${scenario.dayOffset}.`,
        );
    }
    for (const key of ['employeeMealStart', 'employeeMealTime', 'employeeMinNetForMeal', 'timeDecimalRounding']) {
        testInfo.annotations.push({ type: 'preference-evidence', description: `${key}=${String(preferences[key])}` });
    }

    return { scenario, ranch, field, crew, picker, job, ruleCounter, day, jobCardIds, timeCardIds, cleanup, ctx };
}

/** One crew time-in and one crew time-out on screen, ids recorded before anything is asserted. */
export async function seedLongWorkday(
    run: JourneyE2Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<SeedResult> {
    const { sessionApi, pages } = opts;
    const { timeIn, timeOut } = run.scenario.capture;

    await pages.crewTimeIn.punchIn({
        day: run.day,
        crew: run.crew.name,
        ranch: run.ranch.name,
        field: run.field.name,
        employees: [run.picker.name],
        job: run.job.name,
        ...timeIn,
    });

    // The time-out form only offers employees with an open time-in, so wait until it is readable.
    await expect(async () => {
        const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
        const timeIns = cards.filter((c) => Number(c.crewCounter) === run.crew.id && Number(c.cardType) === CARD_TYPE.timeIn);
        expect(timeIns).toHaveLength(1);
    }).toPass({ timeout: 60_000 });

    await pages.crewTimeOut.punchOut({ day: run.day, crew: run.crew.name, ...timeOut });

    const own = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    run.ctx.cards = own as OfficeTimeCard[];
    for (const card of own) if (!run.timeCardIds.includes(card.timeCardCounter)) run.timeCardIds.push(card.timeCardCounter);
    if (own.length !== run.scenario.expected.timeCards) {
        throw new Error(`${run.scenario.label}: expected ${run.scenario.expected.timeCards} own time cards after seeding, found ${own.length}.`);
    }
    return { timeCardCounters: own.map((c) => c.timeCardCounter) };
}

// ── E11 — reverse export ──

type E11Deps = { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects };

export interface JourneyE11Run extends JourneyE2Run {
    /** Every draft id the browser's POST …/runs returned, recorded at capture time; teardown reverses or drops them. */
    exportRunIds: number[];
    startedAt: Date;
}

const fieldName = (scenario: JourneyE11ReverseExportCase, which: 'fromField' | 'toField'): string => JOURNEY_B_FIXTURE[scenario.correction[which]].name;

/** E2's setup on E11's own job (earning codes typed on its Job form), B2 FIELD EAST ensured, own export runs registered for teardown. */
export async function prepareJourneyE11(scenario: JourneyE11ReverseExportCase, deps: E11Deps): Promise<JourneyE11Run> {
    const { sessionApi, testInfo, pages } = deps;
    const startedAt = new Date();
    const warn = (name: string, error: unknown) =>
        testInfo.attach(name, { body: error instanceof Error ? error.message : String(error), contentType: 'text/plain' });

    const e2 = await prepareJourneyE2(scenario, deps, {
        job: { ...journeyE11Fixture().job, earningCodes: scenario.job.earningCodes },
        beforeSweep: ({ crew, day }) => healExportResidue(sessionApi, { crewId: crew.id, day, label: scenario.label }),
    });
    const field2 = JOURNEY_B_FIXTURE.field2;
    await ensureFieldOnScreen({ code: field2.code, name: field2.name, ranch: { id: e2.ranch.id, name: e2.ranch.name } }, { api: sessionApi, pages, testInfo });

    // Registered after E2's own entry, so the scope's newest-first drain reverses the runs before the cards are deleted.
    const exportRunIds: number[] = [];
    const registration = currentScope(testInfo)?.add(`${scenario.label} export runs`, (api) => cleanupExportRuns(api, exportRunIds, warn));
    const cleanup = async (): Promise<void> => {
        await cleanupExportRuns(sessionApi, exportRunIds, warn);
        registration?.complete();
        await e2.cleanup();
    };
    return { ...e2, exportRunIds, startedAt, cleanup };
}

/** Commit the two own rows and land on View > Job Cards with this run's id. */
export async function transferE11Day(run: JourneyE11Run, deps: E11Deps, scenario: JourneyE11ReverseExportCase, seed: SeedResult): Promise<void> {
    const { pages } = deps;
    const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
    const result = await commitTransfer(run, deps, seed, candidates, scenario.expected.transferToast);
    await pages.viewJobCards.waitForTransferLanding();
    expect(pages.viewJobCards.transferRunParam(), `${scenario.label}: the app lands with this transfer's run id`).toBe(result.transferRunCounter);
}

/** View > Job Cards for the day and crew: the one card's hours, amount and Exported cell (and Field, when asked). Returns its Reference. */
export async function assertCardState(
    run: JourneyE11Run,
    deps: E11Deps,
    scenario: JourneyE11ReverseExportCase,
    opts: { exported: boolean; field?: 'fromField' | 'toField' },
): Promise<{ reference: string }> {
    const view = deps.pages.viewJobCards;
    const { expected } = scenario;
    const label = `${scenario.label} (${opts.exported ? 'exported' : 'not exported'})`;

    await view.openFromMenu();
    await view.scopeToDay(run.day);
    await view.setIncludeExported(opts.exported);
    await view.applyFilter();
    await view.filterByCrew(run.crew.name);
    const rows = view.rowsForCrew(run.crew.name);
    await expect(rows, `${label}: exactly the crew's ${expected.jobCards} job card`).toHaveCount(expected.jobCards);
    const row = rows.first();
    const reference = await view.referenceOf(row);

    await expect(await view.cellByHeader(row, 'Exported'), `${label}: Exported`).toHaveText(opts.exported ? expected.exportedYes : expected.exportedNo);
    expect.soft(await view.readNumber(row, 'Regular Hours'), `${label}: Regular Hours`).toBe(expected.regularHours);
    expect.soft(await view.readNumber(row, 'Overtime'), `${label}: Overtime`).toBe(expected.overtimeHours);
    expect.soft(await view.readNumber(row, 'Amount'), `${label}: Amount`).toBe(expected.totalAmount);
    if (opts.field) {
        await expect.soft(await view.cellByHeader(row, 'Field'), `${label}: Field`).toContainText(fieldName(scenario, opts.field));
    }
    if (opts.exported) {
        for (const header of ['Export Identifier', 'Run Number']) {
            const cell = await view.readCell(row, header).catch(() => undefined);
            deps.testInfo.annotations.push({ type: 'export-evidence', description: `${label}: ${header}=${cell ?? 'no such column'}` });
        }
    }
    return { reference };
}

/**
 * Export to Accounting for the crew's day: Refresh (draft id recorded at once), the roster and Flags guards, Export and Confirm.
 * Fails by name on the known defect (no export request / "Nothing to export").
 */
export async function exportCrewDay(
    run: JourneyE11Run,
    deps: E11Deps,
    scenario: JourneyE11ReverseExportCase,
    pass: 'first' | 'second',
): Promise<{ runId: number }> {
    const { testInfo, pages } = deps;
    const exp = pages.exportToAccounting;
    const { expected } = scenario;
    const label = `${scenario.label} (${pass} export)`;
    const record = (body: Record<string, unknown>): void => {
        run.exportRunIds.push(runIdOf(body));
    };

    await exp.openFromMenu();
    await exp.selectType(scenario.export.type);
    await exp.scopeToDay(run.day);
    await exp.scopeToCrew(run.crew.name);
    const refreshed = await exp.refresh(record);
    const runId = run.exportRunIds[run.exportRunIds.length - 1];
    expect(refreshed.runStatus, `${label}: POST …/runs`).toBeLessThan(300);
    expect(refreshed.candidatesStatus, `${label}: POST …/candidates`).toBeLessThan(300);
    await expect(exp.toastText(scenario.export.runCreatedToast), `${label}: the draft run toast`).toBeVisible({ timeout: 15_000 });

    const rows = await exp.candidates();
    expect(rows, `${label}: scoped to ${run.crew.name}, the Candidates grid must hold exactly the crew's ${expected.jobCards} row(s) on ${run.day}`).toHaveLength(expected.jobCards);
    for (const row of rows) {
        expect(row.crew, `${label}: Crew`).toBe(run.crew.name);
        expect(row.employee, `${label}: Employee`).toContain(run.picker.name);
        expect(row.status, `${label}: Status`).toBe(scenario.export.candidateStatus);
        expect(row.flags, `${label}: Flags "${row.flags}" — the card cannot be exported (check the E11 JOB earning codes); never healed`).toBe('');
    }
    await expect(exp.destinationText, `${label}: the destination`).toContainText(scenario.export.destination);
    expect(await exp.exportCount(), `${label}: the Export button's count`).toBe(expected.jobCards);
    const readyBefore = await exp.readyCount();
    expect(readyBefore, `${label}: Ready before the export`).toBeGreaterThanOrEqual(expected.jobCards);
    // Evidence only: Test File names the earning-code source a failed export would not.
    testInfo.annotations.push({ type: 'test-file-evidence', description: `${pass}: ${JSON.stringify(await exp.readTestFile())}` });

    const outcome = await exp.exportOwn({
        expectedCount: expected.jobCards,
        crew: run.crew.name,
        own: run.exportRunIds,
        saveDownloadTo: testInfo.outputPath(`export-${pass}.out`),
    });
    testInfo.annotations.push({ type: 'export-requests', description: `${pass}: ${JSON.stringify(outcome.requests)} confirm="${outcome.confirmText}" toasts=${JSON.stringify(outcome.toasts)}` });
    testInfo.annotations.push({ type: 'export-download', description: `${pass}: ${outcome.download ? `${outcome.download.bytes} bytes` : 'no-download'}` });
    if (outcome.download) await testInfo.attach(`export-${pass}-file`, { path: outcome.download.path, contentType: 'application/octet-stream' });

    const runBody = JSON.stringify(outcome.runBody ?? null);
    testInfo.annotations.push({ type: 'export-run-response', description: `${pass}: ${runBody}` });
    const sent = outcome.requests.filter((r) => !/\/export-to-accounting\/(candidates|runs)$/.test(r.path));
    expect(sent.length, `${label}: Confirm sent no export request; saw ${JSON.stringify(outcome.requests)}`).toBeGreaterThan(0);
    // The page shows only "Nothing to export — no JobCards matched…" even when a card matched and failed; the run's
    // body carries the real reason, so the failure names it.
    expect(outcome.nothingToExport, `${label}: the export wrote nothing — "${scenario.export.nothingToExport}" on screen, server said ${runBody}`).toBe(false);
    expect(sent.filter((r) => r.status < 200 || r.status >= 300), `${label}: every export request answers 2xx`).toEqual([]);
    expect(outcome.toasts.filter((t) => !/nothing|fail|error/i.test(t)), `${label}: a success toast (toasts: ${JSON.stringify(outcome.toasts)})`).not.toHaveLength(0);

    // Ready drops, with or without a Refresh; a Refresh upserts another draft, which teardown drops.
    const dropped = await expect
        .poll(() => exp.readyCount(), { timeout: 10_000 })
        .toBeLessThan(readyBefore)
        .then(() => true, () => false);
    if (!dropped) {
        await exp.refresh(record);
        await expect.poll(() => exp.readyCount(), { message: `${label}: Ready must drop below ${readyBefore} after the export`, timeout: 30_000 }).toBeLessThan(readyBefore);
    }
    return { runId };
}

/** Reverse page: the own run's row (newest matching type, user and count since the test began), reversed, and gone from the list. */
export async function reverseOwnExport(run: JourneyE11Run, deps: E11Deps, scenario: JourneyE11ReverseExportCase, runId: number): Promise<void> {
    const { sessionApi, testInfo, pages } = deps;
    const rev = pages.reverseExport;
    const { expected, reverse } = scenario;
    const label = `${scenario.label} (reverse)`;

    testInfo.annotations.push({ type: 'plumbing-read', description: `${label}: reversible-runs read to confirm run ${runId} is listed` });
    const listed = (await listReversibleRuns(sessionApi)).map((r) => {
        try {
            return runIdOf(r);
        } catch {
            return NaN;
        }
    });
    expect(listed, `${label}: export run ${runId} must be reversible`).toContain(runId);

    const menuPath = await rev.openFromMenu();
    testInfo.annotations.push({ type: 'reverse-menu-path', description: menuPath.join(' > ') });
    const entries = await rev.listRuns();
    const since = run.startedAt.getTime() - 5 * 60_000;
    const mine = entries.filter((e) => e.type === reverse.type && e.performedBy === reverse.performedBy && e.jobCards === expected.jobCards && e.at.getTime() >= since);
    expect(mine, `${label}: a ${reverse.type} run by ${reverse.performedBy} with ${expected.jobCards} job card(s) since ${run.startedAt.toISOString()}; the list shows ${JSON.stringify(entries.map((e) => [e.runDate, e.type, e.performedBy, e.jobCards]))}`).not.toHaveLength(0);
    if (mine.length > 1) testInfo.annotations.push({ type: 'reverse-newer-rows', description: `${mine.length} matching rows; the newest is taken` });
    const entry = mine[0];

    const result = await rev.reverseRun({ id: runId, entry });
    expect(result.prompt, `${label}: the confirm prompt`).toContain(reverse.prompt.replace('{n}', String(expected.jobCards)));
    expect(result.status, `${label}: POST …/runs/${runId}/reverse`).toBe(200);
    if (result.jobCardsReversed !== undefined) expect(result.jobCardsReversed, `${label}: jobCardsReversed`).toBe(expected.jobCards);
    await expect(rev.toast, `${label}: a toast after Reverse run`).toBeVisible({ timeout: 15_000 });
    await expect(rev.rowsOf(entry), `${label}: the reversed run leaves the list`).toHaveCount(0);
}

/** Input > Job Card: change the card's Field, save (PUT 2xx), reopen and read it back. */
export async function correctCardField(run: JourneyE11Run, deps: E11Deps, scenario: JourneyE11ReverseExportCase, reference: string): Promise<void> {
    const card = deps.pages.jobCards;
    const label = `${scenario.label} (correction)`;
    const from = fieldName(scenario, 'fromField');
    const to = fieldName(scenario, 'toField');

    const open = async (): Promise<void> => {
        await card.goto();
        await card.applyDateRange(run.day);
        await card.openCardByReference(reference);
    };
    await open();
    expect(await card.readField(), `${label}: the card starts on ${from}`).toContain(from);
    await card.changeFieldAndSave(to);
    await open();
    expect(await card.readField(), `${label}: the saved card reads ${to} after a fresh open`).toContain(to);
}

/** The Reverse page lists a run for the re-export (a new row of the same card count). */
export async function assertRunListed(run: JourneyE11Run, deps: E11Deps, scenario: JourneyE11ReverseExportCase): Promise<void> {
    const rev = deps.pages.reverseExport;
    const { expected, reverse } = scenario;
    await rev.openFromMenu();
    const entries = await rev.listRuns();
    const since = run.startedAt.getTime() - 5 * 60_000;
    const mine = entries.filter((e) => e.type === reverse.type && e.performedBy === reverse.performedBy && e.jobCards === expected.jobCards && e.at.getTime() >= since);
    expect(mine, `${scenario.label}: the re-export is listed for reversal; the list shows ${JSON.stringify(entries.map((e) => [e.runDate, e.type, e.performedBy, e.jobCards]))}`).not.toHaveLength(0);
}

// ── E8 — finalize gross pay ──

type E8Deps = { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects };

/** The preview's Job Cards rows summed, in the Totals bar's terms. */
export interface PreviewSums {
    gross: number;
    meals: number;
    net: number;
    regular: number;
    overtime: number;
    double: number;
    amount: number;
}

const sumOf = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** Read, never written: the transfer-landing assertion depends on it, so a different value fails by name. */
export async function assertTransferLandingGate(run: JourneyE2Run, opts: { sessionApi: APIRequestContext }): Promise<void> {
    const preferences = await getPreferences(opts.sessionApi);
    if (preferences.viewJobCardsAfterTransfer !== true) {
        throw new Error(
            `${run.scenario.label}: viewJobCardsAfterTransfer is ${String(preferences.viewJobCardsAfterTransfer)}, not true — the transfer would not land on View ▸ Job Cards.`,
        );
    }
}

/**
 * Catalog step 1, before anything commits: the crew's own rows are Ready and nothing blocks, then the
 * preview's buckets are summed for the Totals comparison. Ends on the Time Cards tab, where rows are ticked.
 * The pills count the whole date scope; day -18 is E8's own, so they are the crew's numbers.
 */
export async function confirmCrewDayClean(
    run: JourneyE2Run,
    opts: E8Deps,
    scenario: JourneyE8FinalizeCase,
    seed: SeedResult,
): Promise<{ candidates: string[]; previewSums: PreviewSums }> {
    const { pages } = opts;
    const transfer = pages.transferToJobCards;
    const { expected } = scenario;

    const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
    await expect(transfer.selectAllRowsCheckbox, 'the header select-all-across-filter must never be used').not.toBeChecked();
    for (const id of seed.timeCardCounters) {
        expect.soft(await transfer.rowStatusText(id), `${scenario.label}: time card ${id} must read ${expected.status} before the commit`).toBe(expected.status);
    }
    await expect.poll(() => transfer.blockingCount(), { message: `${scenario.label}: nothing may block the day` }).toBe(0);
    expect.soft(await transfer.readyCount(), `${scenario.label}: the day's Ready pill is the crew's ${expected.timeCards} time cards`).toBe(expected.timeCards);

    await transfer.openJobCardsTab();
    const buckets = await transfer.previewOvertimeBuckets();
    expect(buckets, `${scenario.label}: the preview must show exactly ${expected.jobCards} job card`).toHaveLength(expected.jobCards);
    expect.soft(buckets[0].job, `${scenario.label}: the previewed card must be ${run.job.name}`).toContain(run.job.name);
    const previewSums: PreviewSums = {
        gross: sumOf(buckets.map((b) => b.grossTime)),
        meals: sumOf(buckets.map((b) => b.meal)),
        net: sumOf(buckets.map((b) => b.netTime)),
        regular: sumOf(buckets.map((b) => b.regularHours)),
        overtime: sumOf(buckets.map((b) => b.overtime)),
        double: sumOf(buckets.map((b) => b.doubleTime)),
        amount: sumOf(buckets.map((b) => b.amount)),
    };
    expect.soft(previewSums, `${scenario.label}: the preview, summed over its rows`).toEqual({
        gross: expected.grossHours,
        meals: expected.mealHours,
        net: expected.netHours,
        regular: expected.regularHours,
        overtime: expected.overtimeHours,
        double: expected.doubleTimeHours,
        amount: expected.totalAmount,
    });
    expect.soft(await transfer.previewTotals(), `${scenario.label}: preview totals bar`).toEqual({
        pieces: expected.pieces,
        jobCards: expected.jobCards,
        employees: expected.employees,
    });
    await transfer.openTimeCardsTab();
    return { candidates, previewSums };
}

/** Commit the two own rows; commitTransfer arms and asserts the "Transfer complete" toast before anything else. */
export async function transferCrewDay(
    run: JourneyE2Run,
    opts: E8Deps,
    scenario: JourneyE8FinalizeCase,
    seed: SeedResult,
    candidates: string[],
): Promise<TransferOutcome> {
    const { pages } = opts;
    const { expected } = scenario;
    const result = await commitTransfer(run, opts, seed, candidates, expected.transferToast);

    await pages.viewJobCards.waitForTransferLanding();
    expect(pages.viewJobCards.transferRunParam(), `${scenario.label}: the app lands with this transfer's run id`).toBe(result.transferRunCounter);
    return result;
}

/** Catalog step 1, after the commit: none of the crew's References is offered again and the day's pills read 0 Ready, 0 Blocking. */
export async function confirmNothingLeft(run: JourneyE2Run, opts: E8Deps, scenario: JourneyE8FinalizeCase): Promise<void> {
    const { pages } = opts;
    const transfer = pages.transferToJobCards;

    await transfer.openFromMenu();
    await transfer.scopeToDay(run.day);
    await transfer.reanalyze();
    const offered = await transfer.candidateReferences();
    for (const reference of (run.ctx.cards ?? []).map((c) => String(c.reference))) {
        expect.soft(offered, `${scenario.label}: ${reference} must not be offered as a transfer candidate again`).not.toContain(reference);
    }
    await expect.poll(() => transfer.readyCount(), { message: `${scenario.label}: nothing of the day is Ready after the transfer` }).toBe(0);
    expect.soft(await transfer.blockingCount(), `${scenario.label}: nothing blocks after the transfer`).toBe(0);
    // The time cards themselves read transferred on View ▸ Time Cards.
    await assertTransferredOnScreen(pages, run.day, (run.ctx.cards ?? []).map((c) => String(c.reference)), 'Yes', scenario.label);
}

/**
 * Catalog step 2: View ▸ Job Cards for the day and the crew. The Totals bar reconciles with itself, with the
 * pre-commit preview, with the crew's row and with the scenario.
 */
export async function reviewPayrollTotals(
    run: JourneyE2Run,
    opts: E8Deps,
    scenario: JourneyE8FinalizeCase,
    previewSums: PreviewSums,
): Promise<{ reference: string }> {
    const { pages } = opts;
    const view = pages.viewJobCards;
    const { expected } = scenario;
    const label = scenario.label;

    await view.openFromMenu();
    await view.scopeToDay(run.day);
    await expect(view.includeExportedSwitch, `${label}: Include Exported must be off`).not.toBeChecked();
    await view.applyFilter();
    await expect(view.employeeChips, `${label}: the Employees filter`).toContainText(expected.employeesChip);
    await view.filterByCrew(run.crew.name);
    await expect(view.crewChips, `${label}: the Crews filter must read exactly the crew`).toHaveText(run.crew.name);

    const rows = view.rowsForCrew(run.crew.name);
    await expect(rows, `${label}: one crew-scoped row`).toHaveCount(expected.jobCards);
    const row = rows.first();
    // The one card the crew filter leaves is the one just written; referenceOf throws if the row carries no Reference.
    const reference = await view.referenceOf(row);
    await expect.soft(await view.cellByHeader(row, 'Employee'), `${label}: Employee`).toContainText(run.picker.name);
    await expect.soft(await view.cellByHeader(row, 'Job'), `${label}: Job`).toContainText(run.job.name);
    await expect.soft(await view.cellByHeader(row, 'Exported'), `${label}: the fresh card is not exported`).toHaveText(expected.exportedCell);

    // The crew filter re-totals client-side; wait for the bar to settle on the crew before reading it whole.
    let totals = await view.readTotals();
    await expect(async () => {
        totals = await view.readTotals();
        expect(totals.gross).toBe(expected.grossHours);
    }).toPass({ timeout: 15_000 });

    const counts = await view.readCounts();
    expect.soft(counts.records.shown, `${label}: records shown`).toBe(expected.jobCards);
    expect.soft(counts.employees.shown, `${label}: employees shown`).toBe(expected.employees);
    expect.soft(counts.pieces.shown, `${label}: pieces shown`).toBe(expected.pieces);

    const [year, month, date] = run.day.split('-');
    expect.soft(
        {
            gross: totals.gross,
            net: totals.net,
            meals: totals.meals,
            amount: totals.amount,
            regular: totals.regular,
            overtime: totals.overtime,
            double: totals.double,
            firstDate: totals.firstDate,
        },
        `${label}: the Totals bar`,
    ).toEqual({
        gross: expected.grossHours,
        net: expected.netHours,
        meals: expected.mealHours,
        amount: expected.totalAmount,
        regular: expected.regularHours,
        overtime: expected.overtimeHours,
        double: expected.doubleTimeHours,
        firstDate: `${Number(month)}/${Number(date)}/${year.slice(2)}`,
    });
    expect.soft(totals.net, `${label}: Net = Gross − Meals`).toBeCloseTo(totals.gross - totals.meals, 4);
    expect.soft(totals.regular + totals.overtime + totals.double, `${label}: Regular + Overtime + Double = Net`).toBeCloseTo(totals.net, 4);
    expect.soft(
        { gross: totals.gross, meals: totals.meals, net: totals.net, regular: totals.regular, overtime: totals.overtime, double: totals.double, amount: totals.amount },
        `${label}: the Totals bar reconciles with the pre-commit preview`,
    ).toEqual(previewSums);

    expect.soft(await view.readNumber(row, 'Regular Hours'), `${label}: row Regular Hours`).toBe(totals.regular);
    expect.soft(await view.readNumber(row, 'Overtime'), `${label}: row Overtime`).toBe(totals.overtime);
    expect.soft(await view.readNumber(row, 'Double Time'), `${label}: row Double Time`).toBe(totals.double);
    expect.soft(await view.readNumber(row, 'Amount'), `${label}: row Amount`).toBe(totals.amount);
    expect.soft(await view.readNumber(row, 'Pieces'), `${label}: row Pieces`).toBe(expected.pieces);
    expect.soft(await view.readNumber(row, 'Paid Pieces'), `${label}: row Paid Pieces`).toBe(expected.pieces);
    return { reference };
}

function assertReportFilters(
    filters: Array<Record<string, unknown>>,
    run: JourneyE2Run,
    label: string,
    format: string,
): void {
    const named = (name: string) => filters.find((f) => f.label === name);
    const dayOf = (filter: Record<string, unknown> | undefined) => String(((filter?.values as unknown[] | undefined) ?? [])[0] ?? '').slice(0, 10);
    expect.soft(dayOf(named('From')), `${label} ${format}: filter From`).toBe(run.day);
    expect.soft(dayOf(named('To')), `${label} ${format}: filter To`).toBe(run.day);
    expect.soft(filters.find((f) => f.field === 'JobCard.Exported')?.values, `${label} ${format}: filter Exported`).toEqual([false]);
    // Which field carries the Crews chip is unverified (plan open question 2), so the entry is found by what it names.
    const crewEntry = filters.find(
        (f) =>
            f.field !== 'JobCard.EmployeeCounter' &&
            (String(f.displayValue ?? '').includes(run.crew.name) || ((f.values as unknown[] | undefined) ?? []).map(String).includes(String(run.crew.id))),
    );
    expect.soft(crewEntry, `${label} ${format}: a filter entry must scope the report to ${run.crew.name}; got ${JSON.stringify(filters)}`).toBeDefined();
}

/** Catalog step 2: the Payroll Summary for the crew and day. Contents are not parsed (no PDF/xlsx parser). */
export async function runPayrollSummary(run: JourneyE2Run, opts: E8Deps, scenario: JourneyE8FinalizeCase): Promise<void> {
    const { testInfo, pages } = opts;
    const { report } = scenario;
    const label = scenario.label;

    for (const format of report.formats) {
        const saveTo = testInfo.outputPath(`payroll-summary.${format === 'excel' ? 'xlsx' : 'pdf'}`);
        const out = await pages.viewJobCards.runReport(report.name, format, saveTo);
        testInfo.annotations.push({ type: 'report-filters', description: `${format}: ${JSON.stringify(out.filters)}` });

        expect.soft(out.status, `${label} ${format}: the report request must succeed`).toBe(200);
        expect.soft(out.savedBytes, `${label} ${format}: the saved file is not empty`).toBeGreaterThan(0);
        assertReportFilters(out.filters, run, label, format);
        if (out.savedBytes > 0) {
            await testInfo.attach(`payroll-summary-${format}`, {
                path: out.savedPath,
                contentType: format === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
            });
        }

        if (format === 'excel') {
            expect.soft(out.reportName, `${label}: excel reportName`).toBe(report.reportName);
            expect.soft(out.contentType, `${label}: excel content type`).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            expect.soft(out.contentDisposition, `${label}: excel is delivered as an attachment`).toMatch(/^attachment/i);
            expect.soft(out.suggestedFilename, `${label}: excel filename`).toMatch(new RegExp(report.excelFilename));
        } else {
            expect.soft(out.contentType, `${label}: pdf content type`).toContain('application/pdf');
            expect.soft(out.contentDisposition, `${label}: pdf is delivered inline`).toMatch(/^inline/i);
            expect.soft(out.viewerSrc ?? '', `${label}: the PDF viewer's iframe`).toMatch(/^blob:/);
            expect.soft(out.suggestedFilename, `${label}: pdf download filename`).toMatch(/\.pdf$/i);
        }
    }
}

/** Catalog step 3: Test File only reads. The split, the file state and the failure text are evidence for E9 / A4, never asserted. */
export async function testFileIsReadOnly(run: JourneyE2Run, opts: E8Deps, scenario: JourneyE8FinalizeCase): Promise<void> {
    const { testInfo, pages } = opts;
    const view = pages.viewJobCards;
    const sheet = view.testFile;
    const { expected } = scenario;
    const label = scenario.label;

    const carried = await sheet.open();
    await expect(sheet.heading, `${label}: the sheet is titled Test File`).toBeVisible();
    await expect(sheet.sheet, `${label}: the sheet says it changes nothing`).toContainText(expected.testFileDescription);
    expect.soft(await sheet.activeType(), `${label}: the export type`).toBe(scenario.testFile.exportType);
    expect.soft(carried.candidatesCrewIds, `${label}: candidates is scoped to the crew`).toContain(run.crew.id);
    expect.soft(carried.testFileCrewIds, `${label}: test-file is scoped to the crew`).toContain(run.crew.id);

    const summary = await sheet.readSummary();
    expect.soft(summary.ready + summary.cannotExport, `${label}: ready + cannot export covers the crew's cards`).toBe(expected.jobCards);
    const results = await sheet.resultsCounts();
    expect.soft(results.correct + results.incorrect, `${label}: Correct + Incorrect job-cards`).toBe(expected.jobCards);
    testInfo.annotations.push({
        type: 'test-file-evidence',
        description: `ready=${summary.ready} cannotExport=${summary.cannotExport} file=${await sheet.fileState()} failures=${JSON.stringify(await sheet.failureTexts())}`,
    });

    await sheet.dismissResults();
    await sheet.close();
    await view.refresh();
    await view.expandFilter();
    await expect(view.includeExportedSwitch, `${label}: Include Exported is still off`).not.toBeChecked();
    const rows = view.rowsForCrew(run.crew.name);
    await expect(rows, `${label}: the crew row is still listed after Test File`).toHaveCount(expected.jobCards);
    await expect.soft(await view.cellByHeader(rows.first(), 'Exported'), `${label}: Test File exports nothing`).toHaveText(expected.exportedCell);
}

// ── E13 — department and multi-state overtime split ──

type E13Run = Awaited<ReturnType<typeof prepareJourneyEOwnJobs>>;
type E13JobKey = 'jobA' | 'jobB';
const E13_JOB_KEYS: E13JobKey[] = ['jobA', 'jobB'];

const clockMinutes = (c: Clock): number => c.hour * 60 + c.minute;

/**
 * Rules on screen (missing created, drifted repaired) before the jobs can offer them, after checking the
 * scenario against the fixture's thresholds: each job alone stays under overtime, pooled they would not.
 */
export async function ensureE13Rules(scenario: JourneyE13WageOrderSplitCase, opts: E8Deps): Promise<Record<'ruleA' | 'ruleB', { id: number }>> {
    const F = journeyE13Fixture();
    const { ruleA, ruleB } = F.rules;
    const label = scenario.label;
    expect(ruleA.wageOrder, `${label}: the two fixture rules need distinct wage orders`).not.toBe(ruleB.wageOrder);
    expect(
        [ruleA.overtimeDailyHours, ruleA.doubleTimeDailyHours],
        `${label}: both rules share thresholds, so one pooled bucket is the contrast`,
    ).toEqual([ruleB.overtimeDailyHours, ruleB.doubleTimeDailyHours]);

    let pooledHours = 0;
    scenario.segments.forEach((seg, i) => {
        const hours = (clockMinutes(scenario.segments[i + 1]?.start ?? scenario.timeOut) - clockMinutes(seg.start)) / 60;
        pooledHours += hours;
        const rule = F.rules[F.jobs[seg.job].rule];
        expect(hours, `${label}: ${seg.job} alone must stay within ${rule.name}'s ${rule.overtimeDailyHours} h`).toBeLessThanOrEqual(rule.overtimeDailyHours);
    });
    expect(pooledHours, `${label}: pooled hours must exceed the overtime threshold or the split proves nothing`).toBeGreaterThan(ruleA.overtimeDailyHours);
    expect(
        {
            regular: Math.min(pooledHours, ruleA.overtimeDailyHours),
            overtime: Math.min(pooledHours, ruleA.doubleTimeDailyHours) - ruleA.overtimeDailyHours,
            double: Math.max(pooledHours - ruleA.doubleTimeDailyHours, 0),
        },
        `${label}: pooledContrast`,
    ).toEqual({ regular: scenario.expected.pooledContrast.regular, overtime: scenario.expected.pooledContrast.overtime, double: scenario.expected.pooledContrast.double });

    const deps = { api: opts.sessionApi, pages: opts.pages, testInfo: opts.testInfo };
    return {
        ruleA: await ensureOvertimeRuleOnScreen(ruleA, deps),
        ruleB: await ensureOvertimeRuleOnScreen(ruleB, deps),
    };
}

/** E6's own-jobs preparation with E13's two jobs; the rules must already exist so the Job form offers them. */
export async function prepareJourneyE13(scenario: JourneyE13WageOrderSplitCase, opts: E8Deps): Promise<E13Run> {
    const F = journeyE13Fixture();
    const jobs = Object.fromEntries(
        E13_JOB_KEYS.map((key) => [
            key,
            { code: F.jobs[key].code, name: F.jobs[key].name, paymentType: F.jobs[key].paymentType, hourlyRate: F.jobs[key].hourlyRate, rule: F.rules[F.jobs[key].rule].name },
        ]),
    );
    return prepareJourneyEOwnJobs(
        {
            label: scenario.label,
            dayOffset: scenario.dayOffset,
            rule: { name: F.rules.ruleA.name },
            expected: { timeCards: scenario.expected.timeCards, jobCards: scenario.expected.jobCards },
            cleanup: scenario.cleanup,
        },
        opts,
        jobs,
    );
}

/**
 * Gates, read and never written: the transfer landing, weekly averaging off, and Group Overtime by Wage
 * Order = Yes on its own screen. The field and employee must carry no rule of their own (two different job
 * rules would make any field rule a precedence conflict); departments are recorded as evidence.
 */
export async function assertWageOrderGates(run: E13Run, opts: E8Deps, scenario: JourneyE13WageOrderSplitCase): Promise<void> {
    const { sessionApi, testInfo, pages } = opts;
    const label = scenario.label;
    // prepareJourneyEOwnJobs has already run the transfer-landing gate.

    const preferences = await getPreferences(sessionApi);
    for (const [key, value] of Object.entries(preferences)) {
        if (/wageorder|weeklyavg/i.test(key)) testInfo.annotations.push({ type: 'environment-gate', description: `${key}=${String(value)}` });
    }
    // The wire form of "None" is unmeasured; the first run calibrates this list.
    const none: unknown[] = [null, undefined, 0, '0', false, 'None'];
    if (!none.includes(preferences.payOvertimeBasedOnWeeklyAvg)) {
        throw new Error(
            `${label}: payOvertimeBasedOnWeeklyAvg=${String(preferences.payOvertimeBasedOnWeeklyAvg)}, not ${scenario.gates.payOvertimeBasedOnWeeklyAvg} — weekly averaging would change the daily expectation.`,
        );
    }

    await pages.jobCardPreferences.openFromMenu();
    const shown = (await pages.jobCardPreferences.readCombobox(scenario.preferenceLabels.groupByWageOrder)).trim();
    expect(
        shown,
        `${label}: ${scenario.preferenceLabels.groupByWageOrder} must read ${scenario.gates.groupOvertimeByWageOrder} on Job Card Preferences (environment gate, never written)`,
    ).toBe(scenario.gates.groupOvertimeByWageOrder);

    testInfo.annotations.push({ type: 'plumbing-read', description: `${label}: rule-chain and department reads on field, employee, crew and jobs` });
    const field = await getJson(sessionApi, `fields/${run.field.id}`);
    expect(field.overTimeRulesCounter ?? null, `${label}: field ${run.field.name} must carry no overtime rule of its own`).toBeNull();
    const employee = await getJson(sessionApi, `employees/${run.picker.id}`);
    const ruled = Object.entries(employee).filter(([key, value]) => /overtime|wage/i.test(key) && value != null);
    expect(ruled, `${label}: ${run.picker.name} must carry no overtime or wage-order setting of its own`).toEqual([]);

    const crew = await getJson(sessionApi, `crews/${run.crew.id}`);
    const evidence = [`crew=${String(crew.departmentCounter)}`, `field=${String(field.departmentCounter)}`];
    for (const key of E13_JOB_KEYS) evidence.push(`${key}=${String((await getJson(sessionApi, `jobs/${run.jobs[key].id}`)).departmentCounter)}`);
    testInfo.annotations.push({ type: 'department-evidence', description: `departmentCounter ${evidence.join(' ')}` });
}

/** Before the commit: the three own rows Ready, nothing blocking, and the preview already split 6 + 4 with no overtime. */
export async function confirmSplitPreview(
    run: E13Run,
    opts: E8Deps,
    scenario: JourneyE13WageOrderSplitCase,
    seed: SeedResult,
): Promise<string[]> {
    const transfer = opts.pages.transferToJobCards;
    const { expected } = scenario;
    const label = scenario.label;

    const candidates = await openScopedCandidates(run, { pages: opts.pages, crew: run.crew.name }, seed);
    await expect(transfer.selectAllRowsCheckbox, 'the header select-all-across-filter must never be used').not.toBeChecked();
    for (const id of seed.timeCardCounters) {
        expect.soft(await transfer.rowStatusText(id), `${label}: time card ${id} must read ${expected.status} before the commit`).toBe(expected.status);
    }
    await expect.poll(() => transfer.blockingCount(), { message: `${label}: nothing may block the day` }).toBe(0);

    await transfer.openJobCardsTab();
    const buckets = await transfer.previewOvertimeBuckets();
    expect(buckets, `${label}: the preview must show exactly ${expected.jobCards} job cards`).toHaveLength(expected.jobCards);
    for (const key of E13_JOB_KEYS) {
        const name = run.jobs[key].name;
        const row = buckets.find((b) => b.job.includes(name));
        if (!row) throw new Error(`${label}: the preview has no row for ${name}; it shows ${JSON.stringify(buckets.map((b) => b.job))}`);
        const want = expected.perJob[key];
        expect.soft(
            { gross: row.grossTime, regular: row.regularHours, overtime: row.overtime, double: row.doubleTime, amount: row.amount },
            `${label}: preview row ${name}`,
        ).toEqual({ gross: want.hours, regular: want.regular, overtime: want.overtime, double: want.double, amount: want.amount });
    }
    await transfer.openTimeCardsTab();
    return candidates;
}

/** Commit, land on View ▸ Job Cards with this run's id, and read each job's row and the Totals bar against the split. */
export async function transferAndReadSplit(
    run: E13Run,
    opts: E8Deps,
    scenario: JourneyE13WageOrderSplitCase,
    seed: SeedResult,
    candidates: string[],
): Promise<void> {
    const { pages, testInfo } = opts;
    const view = pages.viewJobCards;
    const { expected } = scenario;
    const label = scenario.label;
    const F = journeyE13Fixture();

    const result = await commitTransfer(run, opts, seed, candidates, expected.transferToast);
    await view.waitForTransferLanding();
    expect(view.transferRunParam(), `${label}: the app lands with this transfer's run id`).toBe(result.transferRunCounter);

    await view.openFromMenu();
    await view.scopeToDay(run.day);
    await view.applyFilter();
    await view.filterByCrew(run.crew.name);
    await expect(view.crewChips, `${label}: the Crews filter must read exactly the crew`).toHaveText(run.crew.name);

    const pooledMessage = `wage orders ${F.rules.ruleA.wageOrder}/${F.rules.ruleB.wageOrder} pooled into one daily bucket despite Group Overtime by Wage Order = Yes`;
    let totals = await view.readTotals();
    await expect(async () => {
        totals = await view.readTotals();
        expect(totals.gross).toBe(expected.totals.gross);
    }).toPass({ timeout: 15_000 });
    expect(totals.overtime, `${label}: ${pooledMessage}`).toBe(0);

    for (const key of E13_JOB_KEYS) {
        const name = run.jobs[key].name;
        const rows = view.rowsForCrewAndJob(run.crew.name, name);
        await expect(rows, `${label}: one landing row for ${name}`).toHaveCount(1);
        const row = rows.first();
        const want = expected.perJob[key];
        expect.soft(
            {
                regular: await view.readNumber(row, 'Regular Hours'),
                overtime: await view.readNumber(row, 'Overtime'),
                double: await view.readNumber(row, 'Double Time'),
                amount: await view.readNumber(row, 'Amount'),
            },
            `${label}: landing row ${name}`,
        ).toEqual({ regular: want.regular, overtime: want.overtime, double: want.double, amount: want.amount });
        // Not every layout carries a Department column; recorded when it does.
        const department = await view.readCell(row, 'Department').catch(() => 'no Department column');
        testInfo.annotations.push({ type: 'department-evidence', description: `${name}: Department cell = ${department}` });
    }

    expect.soft(
        { gross: totals.gross, regular: totals.regular, overtime: totals.overtime, double: totals.double, amount: totals.amount },
        `${label}: the Totals bar`,
    ).toEqual(expected.totals);
}

/** What no screen shows, recorded and not asserted: each card's calculation description, plus the out-of-scope reasons. */
export async function recordWageOrderEvidence(run: E13Run, opts: E8Deps, scenario: JourneyE13WageOrderSplitCase): Promise<void> {
    const { sessionApi, testInfo } = opts;
    for (const annotation of scenario.annotations) testInfo.annotations.push(annotation);
    testInfo.annotations.push({ type: 'plumbing-read', description: `${scenario.label}: calculationDesc of the own job cards` });
    for (const id of run.jobCardIds) {
        const card = await getJobCard(sessionApi, id);
        testInfo.annotations.push({
            type: 'api-only-evidence',
            description: `${scenario.label}: job card ${id} (job ${String(card.jobCounter)}) calculationDesc=${String(card.calculationDesc ?? 'absent')}`,
        });
    }
}

// ── Shared by E6 and E13: a crew day on the crew's own jobs ──

type OwnJobsDeps = { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects };

export interface EOwnJobSpec {
    code: string;
    name: string;
    paymentType: 'Time' | 'Piece';
    hourlyRate: number;
    /** Overtime rule for this job; the scenario's rule when absent. */
    rule?: string;
}

/** The slice of an own-jobs scenario the shared setup reads; the E6 and E13 schemas satisfy it structurally. */
export interface EOwnJobsSetup {
    label: string;
    dayOffset: number;
    rule: { name: string };
    expected: { timeCards: number; jobCards: number };
    /** Only for scenarios that restore `timeDecimalRounding`: a precision a killed run left behind is healed back to it. */
    baselinePrecision?: number;
    cleanup: CleanupStep[];
}

export interface JourneyEOwnJobsRun<K extends string = string> extends Omit<JourneyE2Run, 'scenario' | 'job'> {
    scenario: EOwnJobsSetup;
    jobs: Record<K, EnsuredRecord>;
    /** `GET session/me`'s user id — the author a run of this test must carry (guardReversibleRun). */
    sessionUserId: number;
    startedAt: Date;
}

/**
 * E2's crew, picker, ranch and field plus the given own jobs, all on screen. Each job gets its overtime rule and
 * rate on the Job form (read back after a fresh load) and is never restored: the jobs belong to the scenario.
 * Same gates and before-phase sweeps as prepareJourneyE2, plus the transfer-landing gate and the session user.
 * The scenario's `restore` steps run first at teardown — tenant-wide state must not wait behind card deletes.
 */
export async function prepareJourneyEOwnJobs<K extends string>(
    scenario: EOwnJobsSetup,
    opts: OwnJobsDeps,
    jobsSpec: Record<K, EOwnJobSpec>,
): Promise<JourneyEOwnJobsRun<K>> {
    const { sessionApi, testInfo, pages } = opts;
    const F = journeyE2Fixture();
    const deps = { api: sessionApi, pages, testInfo };

    const ranch = await ensureRanchOnScreen({ code: JOURNEY_B_FIXTURE.ranch.code, name: JOURNEY_B_FIXTURE.ranch.name }, deps);
    const field = await ensureFieldOnScreen(
        { code: JOURNEY_B_FIXTURE.field.code, name: JOURNEY_B_FIXTURE.field.name, ranch: { id: ranch.id, name: ranch.name } },
        deps,
    );
    // The crew first: the New Employee form's Crew combobox arrives pre-filled with another crew.
    const crew = await ensureCrewOnScreen(F.crew, deps);
    const picker = await ensureEmployeeOnScreen({ ...F.picker, homeCrew: { id: crew.id, name: crew.name } }, deps);
    const keys = Object.keys(jobsSpec) as K[];
    const jobs = {} as Record<K, EnsuredRecord>;
    for (const key of keys) {
        const { code, name, paymentType, hourlyRate } = jobsSpec[key];
        jobs[key] = await ensureJobOnScreen({ code, name, paymentType, hourlyRate }, deps);
    }

    const day = isoDay(punchDay(scenario.dayOffset));
    const jobCardIds: number[] = [];
    const timeCardIds: number[] = [];
    // runCleanup's timeCards step reads only `employees`; no job restore is declared, so no `job`.
    const office = { ranch, field, crew, employees: new Map([[picker.code, picker]]) } as unknown as OfficeFixture;
    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };

    const warn = (name: string, error: unknown) =>
        testInfo.attach(name, { body: error instanceof Error ? error.message : String(error), contentType: 'text/plain' });
    const restoreSteps = scenario.cleanup.filter((step) => step.kind === 'restore');
    const otherSteps = scenario.cleanup.filter((step) => step.kind !== 'restore');

    // `api` is the scope's own untraced context: after a timeout the test's sessionApi throws ENOENT on its trace file.
    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        await runCleanup(restoreSteps, api, testInfo, ctx);
        await allowApiWrites('cleanup', `${scenario.label} teardown: own job cards by id`, async () => {
            for (const id of jobCardIds) {
                try {
                    const card = await getJobCard(api, id);
                    await deleteJobCard(api, id, card.version);
                } catch (error) {
                    await warn(`cleanup-warning-jobCard-${id}`, error);
                }
            }
        });
        await runCleanup(otherSteps, api, testInfo, ctx);
        await allowApiWrites('cleanup', `${scenario.label} teardown: own time cards by id`, async () => {
            for (const id of timeCardIds) {
                try {
                    await deleteTimeCard(api, id);
                } catch (error) {
                    await warn(`cleanup-warning-timeCard-${id}`, error);
                }
            }
        });
        await allowApiWrites('cleanup', `${scenario.label} teardown: crew-scoped day sweep`, () => sweepCrewTimeCards(api, { day, crewCounter: crew.id })).catch(
            () => undefined,
        );
    };
    const registration = currentScope(testInfo)?.add(`${scenario.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    // Fixture gate: resolves the rule id the field gate below compares against; it throws, it is not proof.
    const ruleCounter = await resolveRuleCounter(sessionApi, scenario.rule.name);

    // Before phase: job cards first (a transferred time card cannot be deleted), then the declared steps, then time cards.
    await allowApiWrites('cleanup', `${scenario.label} before-phase: crew job cards`, () => sweepCrewJobCards(sessionApi, { day, crewCounter: crew.id }));
    await runCleanup(scenario.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', `${scenario.label} before-phase: crew time cards`, () => sweepCrewTimeCards(sessionApi, { day, crewCounter: crew.id }));

    // A killed run can leave the precision on one of its own passes; heal that, fail by name on anything else.
    const baseline = scenario.baselinePrecision;
    if (baseline !== undefined && ctx.snapshots?.has('timeDecimalRounding')) {
        const held = Number((ctx.snapshots.get('timeDecimalRounding') as Record<string, unknown>).timeDecimalRounding);
        if (held !== baseline) {
            if (![2, 3, 4].includes(held)) {
                throw new Error(`${scenario.label}: timeDecimalRounding reads ${held}, neither the baseline ${baseline} nor a precision this test leaves behind — someone else changed the tenant.`);
            }
            await allowApiWrites('cleanup', `${scenario.label} before-phase: heal a precision left by a killed run`, () =>
                putPreferences(sessionApi, { timeDecimalRounding: baseline }),
            );
            ctx.snapshots.set('timeDecimalRounding', { timeDecimalRounding: baseline });
            testInfo.annotations.push({ type: 'residue-healed', description: `timeDecimalRounding ${held} -> ${baseline}` });
        }
    }

    // Both setters need a hydrated form and both leave it after saving, so the record is reopened between them.
    for (const key of keys) {
        const spec = jobsSpec[key];
        const job = jobs[key];
        const ruleName = spec.rule ?? scenario.rule.name;
        await pages.job.gotoEditById(job.id, job.name);
        const shownRule = await pages.job.setOvertimeRule(ruleName);
        await pages.job.gotoEditById(job.id, job.name);
        const shownRate = await pages.job.setHourlyRate(spec.hourlyRate);
        expect(shownRule, `${scenario.label}: the Job form for ${job.name} must show the overtime rule after saving`).toContain(ruleName);
        expect(Number(shownRate), `${scenario.label}: the Job form for ${job.name} must show the hourly rate after saving`).toBe(spec.hourlyRate);
    }

    // fixture-gate: the reads below throw on a fixture the day's arithmetic cannot tolerate; they are not proof.
    const storedCrew = await getJson(sessionApi, `crews/${crew.id}`);
    expect(
        {
            exerciseJobCounter: Number(storedCrew.exerciseJobCounter ?? 0),
            createBreakCardFromTimeIn: Number(storedCrew.createBreakCardFromTimeIn ?? 0),
            autoPaidBreakType: Number(storedCrew.autoPaidBreakType ?? 0),
            autoReturnFromBreak: Number(storedCrew.autoReturnFromBreak ?? 0),
            lunchLengthMinutes: Number(storedCrew.lunchLengthMinutes ?? 0),
        },
        `${scenario.label}: E2 CREW must carry no exercise job, break automation or lunch`,
    ).toEqual({ exerciseJobCounter: 0, createBreakCardFromTimeIn: 0, autoPaidBreakType: 0, autoReturnFromBreak: 0, lunchLengthMinutes: 0 });

    const storedEmployee = await getJson(sessionApi, `employees/${picker.id}`);
    for (const key of ['hourlyRate', 'payRate', 'rate']) {
        if (Number(storedEmployee[key] ?? 0) > 0) {
            throw new Error(`${scenario.label}: ${picker.name} carries ${key}=${String(storedEmployee[key])}, which could displace the job's rate.`);
        }
    }

    const storedField = await getJson(sessionApi, `fields/${field.id}`);
    testInfo.annotations.push({ type: 'field-evidence', description: `overTimeRulesCounter=${String(storedField.overTimeRulesCounter)}` });
    if (storedField.overTimeRulesCounter != null && Number(storedField.overTimeRulesCounter) !== ruleCounter) {
        throw new Error(
            `${scenario.label}: field ${field.name} carries overtime rule ${String(storedField.overTimeRulesCounter)} but the jobs carry ${ruleCounter}; precedence is unverified.`,
        );
    }

    // Read, never written: a moved window or gate must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(scenario.dayOffset))) {
        throw new Error(
            `${scenario.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${scenario.dayOffset}.`,
        );
    }
    if (preferences.viewJobCardsAfterTransfer !== true) {
        throw new Error(`${scenario.label}: viewJobCardsAfterTransfer is ${String(preferences.viewJobCardsAfterTransfer)}, not true — the transfer would not land on View ▸ Job Cards.`);
    }
    testInfo.annotations.push({ type: 'preference-evidence', description: `timeDecimalRounding=${String(preferences.timeDecimalRounding)}` });

    const meRes = await sessionApi.get('session/me');
    if (!meRes.ok()) throw new Error(`GET session/me failed with ${meRes.status()}`);
    const me = (await meRes.json()) as Record<string, unknown>;
    const user = (me.user ?? {}) as Record<string, unknown>;
    const sessionUserId = Number(user.userId ?? me.userCounter ?? me.userId ?? user.userCounter ?? user.id ?? me.id);
    if (!Number.isFinite(sessionUserId)) throw new Error(`${scenario.label}: GET session/me names no user id (keys: ${Object.keys(me).join(', ')}).`);
    const startedAt = new Date();

    return { scenario, ranch, field, crew, picker, jobs, ruleCounter, day, jobCardIds, timeCardIds, cleanup, ctx, sessionUserId, startedAt };
}

/**
 * Crew time-in on screen per segment (each on its own job: a job change is a repeated punch, as in D10), then one
 * crew time-out. Ids are recorded before anything is asserted; the count must match the scenario.
 */
export async function seedJobChangeDay<K extends string>(
    run: JourneyEOwnJobsRun<K>,
    opts: OwnJobsDeps,
    segments: Array<{ job: K; start: Clock }>,
    out: Clock,
): Promise<SeedResult> {
    const { sessionApi, pages } = opts;
    const where = { day: run.day, crew: run.crew.name, ranch: run.ranch.name, field: run.field.name, employees: [run.picker.name] };

    // The next form only offers employees with an open time-in, so wait until the saved punch is readable.
    const timeInsReadable = (count: number) =>
        expect(async () => {
            const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
            const timeIns = cards.filter((c) => Number(c.crewCounter) === run.crew.id && Number(c.cardType) === CARD_TYPE.timeIn);
            expect(timeIns).toHaveLength(count);
        }).toPass({ timeout: 60_000 });

    for (const [index, segment] of segments.entries()) {
        await pages.crewTimeIn.punchIn({ ...where, ...segment.start, job: run.jobs[segment.job].name });
        await timeInsReadable(index + 1);
    }
    await pages.crewTimeOut.punchOut({ day: run.day, crew: run.crew.name, ...out });

    const own = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    run.ctx.cards = own as OfficeTimeCard[];
    for (const card of own) if (!run.timeCardIds.includes(card.timeCardCounter)) run.timeCardIds.push(card.timeCardCounter);
    if (own.length !== run.scenario.expected.timeCards) {
        throw new Error(`${run.scenario.label}: expected ${run.scenario.expected.timeCards} own time cards after seeding, found ${own.length}.`);
    }
    return { timeCardCounters: own.map((c) => c.timeCardCounter) };
}

// ── E6 — decimal-rounding reconciliation ──

type E6Run = JourneyEOwnJobsRun<JourneyE6RoundingCase['segments'][number]['job']>;

const roundTo = (n: number, places: number): number => Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;

/** Read, never written: both preferences decide what the day's arithmetic means, so a different value fails by name. */
export async function assertRoundingGates(run: E6Run, opts: OwnJobsDeps, scenario: JourneyE6RoundingCase): Promise<void> {
    const { pages, testInfo } = opts;
    const prefs = pages.jobCardPreferences;
    const labels = scenario.preferenceLabels;
    const { expected, label } = scenario;

    await prefs.openFromMenu();
    await prefs.gotoSection(labels.roundingSection);
    const roundJobChange = await prefs.readSwitch(labels.roundJobChange);
    const minutes = await prefs.readNumber(labels.roundingMinutes).catch(() => 'unreadable');
    const type = await prefs.readCombobox(labels.roundingType).catch(() => 'unreadable');
    testInfo.annotations.push({ type: 'preference-evidence', description: `${labels.roundingMinutes}=${String(minutes)}; ${labels.roundingType}=${type}` });
    if (roundJobChange !== expected.roundJobChange) {
        throw new Error(
            `${label}: environment-gate: ${labels.roundJobChange} reads ${roundJobChange ? 'ON' : 'OFF'} on Job Card Preferences; E6 needs it ${expected.roundJobChange ? 'ON' : 'OFF'} ` +
                'so the 08:40 and 11:20 job changes stay off the rounding grid, and it never writes it.',
        );
    }

    await prefs.gotoSection(labels.section);
    const accuracy = await prefs.readNumber(labels.timeDecimalAccuracy);
    if (accuracy !== scenario.baselinePrecision) {
        throw new Error(`${label}: environment-gate: ${labels.timeDecimalAccuracy} reads ${accuracy}, not the baseline ${scenario.baselinePrecision} (${run.scenario.label}).`);
    }
}

/**
 * Catalog step 3 on screen: set Time Decimal Accuracy under the cross-process preferences lock, Save, wait until the
 * stored value follows (the transfer must not race a late save), then re-open the screen and read it back.
 */
export async function setTimeDecimalAccuracy(run: E6Run, opts: OwnJobsDeps, scenario: JourneyE6RoundingCase, precision: number): Promise<void> {
    const { sessionApi, testInfo, pages } = opts;
    const prefs = pages.jobCardPreferences;
    const { section, timeDecimalAccuracy: field } = scenario.preferenceLabels;

    await withPreferencesLock(async () => {
        await prefs.openFromMenu();
        await prefs.gotoSection(section);
        await prefs.setNumber(field, precision);
        await prefs.saveIfDirty();

        testInfo.annotations.push({ type: 'plumbing-read', description: `${run.scenario.label}: GET preferences polled until the save lands` });
        await expect
            .poll(async () => Number((await getPreferences(sessionApi)).timeDecimalRounding), {
                message: `${run.scenario.label}: the saved ${field} ${precision} must reach the server`,
                timeout: 30_000,
            })
            .toBe(precision);

        await prefs.openFromMenu();
        await prefs.gotoSection(section);
        expect(await prefs.readNumber(field), `${run.scenario.label}: ${field} must read ${precision} after a fresh load`).toBe(precision);
    });
}

/**
 * Catalog steps 1 + 2 at one precision: the crew's own rows are Ready, the preview has one row per job, the transfer
 * commits and lands on View ▸ Job Cards, and the crew's cards (in Time In order) and the Totals bar carry the rounded
 * hours with the correction on the last card.
 */
export async function transferAndReadPass(
    run: E6Run,
    opts: OwnJobsDeps,
    scenario: JourneyE6RoundingCase,
    pass: JourneyE6RoundingCase['passes'][number],
    seed: SeedResult,
): Promise<TransferOutcome> {
    const { testInfo, pages } = opts;
    const transfer = pages.transferToJobCards;
    const view = pages.viewJobCards;
    const { expected } = scenario;
    const places = pass.precision;
    const where = `${scenario.label} P=${places}`;

    const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
    for (const id of seed.timeCardCounters) {
        expect.soft(await transfer.rowStatusText(id), `${where}: time card ${id} must read ${expected.status} before the commit`).toBe(expected.status);
    }
    // Only the row count is asserted: the preview is stale across a precision change (WEBPET-3823).
    await transfer.openJobCardsTab();
    const preview = await transfer.previewOvertimeBuckets();
    expect(preview, `${where}: the preview must show one row per job`).toHaveLength(expected.jobCards);
    testInfo.annotations.push({ type: 'preview-evidence', description: `P=${places}: ${JSON.stringify(preview.map((r) => [r.job, r.grossTime, r.netTime, r.regularHours]))}` });
    await transfer.openTimeCardsTab();

    const outcome = await commitTransfer(run, opts, seed, candidates, expected.transferToast);
    await view.waitForTransferLanding();
    expect(view.transferRunParam(), `${where}: the app lands with this transfer's run id`).toBe(outcome.transferRunCounter);

    const rows = view.rowsForCrew(run.crew.name);
    await expect(rows, `${where}: one landing row per job`).toHaveCount(expected.jobCards);
    const cards: Array<{ timeIn: string; job: string; gross: number; net: number; regular: number; overtime: number; double: number; amount: number }> = [];
    for (let i = 0; i < expected.jobCards; i += 1) {
        const row = rows.nth(i);
        cards.push({
            timeIn: await view.readClock(row, 'Time In'),
            job: await view.readCell(row, 'Job'),
            gross: await view.readNumber(row, 'Gross Time'),
            net: await view.readNumber(row, 'Net Time'),
            regular: await view.readNumber(row, 'Regular Hours'),
            overtime: await view.readNumber(row, 'Overtime'),
            double: await view.readNumber(row, 'Double Time'),
            amount: await view.readNumber(row, 'Amount'),
        });
    }
    cards.sort((a, b) => a.timeIn.localeCompare(b.timeIn));

    // The landing's Totals bar covers the whole day (another crew's 8 h read as 16, 2026-10-26): crew chip first, as E8 does.
    await view.filterByCrew(run.crew.name);
    await expect(view.crewChips, `${where}: the Crews filter must read exactly the crew`).toHaveText(run.crew.name);
    // Wait for the bar to settle on the run's cards before reading it whole.
    await expect.poll(async () => (await view.readTotals()).gross, { message: `${where}: the Totals bar must fill`, timeout: 20_000 }).toBeGreaterThan(0);
    const totals = await view.readTotals();

    expect(cards.map((c) => c.timeIn), `${where}: cards in Time In order`).toEqual(scenario.segments.map((s) => clock(s.start)));
    scenario.segments.forEach((segment, i) => {
        expect(cards[i].job, `${where}: card ${i + 1} is ${segment.job}`).toContain(run.jobs[segment.job].name);
    });

    const hours = pass.cardHours;
    const zeros = hours.map(() => 0);
    expect(
        {
            gross: cards.map((c) => c.gross),
            net: cards.map((c) => c.net),
            regular: cards.map((c) => c.regular),
            overtime: cards.map((c) => c.overtime),
            double: cards.map((c) => c.double),
            totals: { gross: totals.gross, net: totals.net, regular: totals.regular, overtime: totals.overtime, double: totals.double },
        },
        `${where}: cards 1-2 round half-up at ${places} dp and the last card carries the correction so the day reads ${expected.dayHours} (WEBPET-2987/2988)`,
    ).toEqual({
        gross: hours,
        net: hours,
        regular: hours,
        overtime: zeros,
        double: zeros,
        totals: { gross: expected.dayHours, net: expected.dayHours, regular: expected.dayHours, overtime: expected.overtimeHours, double: expected.doubleTimeHours },
    });
    const others = cards.slice(0, -1).reduce((total, c) => total + c.gross, 0);
    expect(cards[cards.length - 1].gross, `${where}: the last card must be ${expected.dayHours} − (the others) (WEBPET-2987/2988)`).toBe(roundTo(expected.dayHours - others, places));

    testInfo.annotations.push({ type: 'amount-evidence', description: `P=${places}: rows ${JSON.stringify(cards.map((c) => c.amount))}, Totals Amount ${totals.amount}` });
    return outcome;
}

/** Reverse one pass on screen, only after guardReversibleRun has proven the run on screen is this test's own. */
export async function reverseOwnPass(run: E6Run, opts: OwnJobsDeps, scenario: JourneyE6RoundingCase, outcome: TransferOutcome): Promise<void> {
    const { pages } = opts;
    const view = pages.viewJobCards;
    const { expected } = scenario;
    const where = `${scenario.label} run ${outcome.transferRunCounter}`;

    await guardReversibleRun(run, opts, outcome, { jobCards: expected.jobCards, timeCards: expected.timeCards });
    await view.openReverse();
    await expect(view.reverseDialog, `${where}: reverse confirm title`).toContainText(expected.reverseDialog.title);
    await expect(view.reverseDialog, `${where}: reverse confirm text`).toContainText(expected.reverseDialog.text);

    const reversedRun = await view.confirmReverse();
    expect(reversedRun, `${where}: the reverse targeted this pass's own run`).toBe(outcome.transferRunCounter);
    await expect(pages.transferToJobCards.pageRoot, `${where}: the app returns to Transfer to Job Cards`).toBeVisible();
    await expect(pages.transferToJobCards.reversedToast, `${where}: reverse confirmed`).toBeVisible();

    await openViewJobCardsForDay(pages, run.day);
    await expect(view.rowsForCrew(run.crew.name), `${where}: the reversed job cards are gone from View ▸ Job Cards`).toHaveCount(0);
    // Dropped only now, so a failed absence assertion leaves the ids for the teardown.
    run.jobCardIds.splice(0, run.jobCardIds.length, ...run.jobCardIds.filter((id) => !outcome.jobCardCounters.includes(id)));
}
