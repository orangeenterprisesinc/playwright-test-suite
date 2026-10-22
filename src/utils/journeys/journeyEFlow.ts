import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import type { JourneyE8FinalizeCase } from '@data/schemas/journeyEScenario';
import { journeyE2Fixture } from '@data/journey-e/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import { deleteJobCard, getJobCard, listJobCards, type JobCardRecord } from '@utils/api/jobCardsApi';
import { analyzeTransfer, previewJobCards, type ExecuteResult } from '@utils/api/transferToJobCardsApi';
import { getPreferences } from '@utils/api/preferencesApi';
import { CARD_TYPE, deleteTimeCard, isoDay, listTimeCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import type { EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { allowApiWrites } from '@utils/api/writeGuard';
import { currentScope } from '@utils/cleanup/cleanupScope';
import type { CleanupContext } from '@utils/cleanup/runCleanup';
import type { SeedResult } from '@utils/journeys/journeyDFlow';
import {
    ensureCrewOnScreen,
    ensureEmployeeOnScreen,
    ensureFieldOnScreen,
    ensureJobOnScreen,
    ensureRanchOnScreen,
} from '@utils/fixtureRows/ensureOnScreen';

// One spec imports one flow module: the D-flow transfer helpers are re-exported rather than moved.
export { commitTransfer, openScopedCandidates } from '@utils/journeys/journeyDFlow';
export type { PreviewBoundary, SeedResult } from '@utils/journeys/journeyDFlow';
import { commitTransfer, openScopedCandidates, type PreviewBoundary } from '@utils/journeys/journeyDFlow';

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
): Promise<JourneyE2Run> {
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
    const job = await ensureJobOnScreen(
        { code: F.job.code, name: F.job.name, paymentType: F.job.paymentType, hourlyRate: F.job.hourlyRate },
        deps,
    );

    const day = isoDay(punchDay(scenario.dayOffset));
    const jobCardIds: number[] = [];
    const timeCardIds: number[] = [];
    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [] };

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

    const ruleCounter = await resolveRuleCounter(sessionApi, scenario.rule.name);

    // Both setters need a hydrated form and both leave it after saving, so the record is reopened between them.
    await pages.job.gotoEditById(job.id, job.name);
    await pages.job.setOvertimeRule(scenario.rule.name);
    await pages.job.gotoEditById(job.id, job.name);
    await pages.job.setHourlyRate(scenario.expected.hourlyRate);

    const storedJob = await getJson(sessionApi, `jobs/${job.id}`);
    expect(
        {
            overtimeRulesCounter: Number(storedJob.overtimeRulesCounter),
            hourlyRate: Number(storedJob.hourlyRate),
            active: storedJob.active !== false,
        },
        `${scenario.label}: the rule and rate must persist exactly as the Job form saved them`,
    ).toEqual({ overtimeRulesCounter: ruleCounter, hourlyRate: scenario.expected.hourlyRate, active: true });
    if (typeof storedJob.overtimeRulesName === 'string') {
        expect(storedJob.overtimeRulesName, `${scenario.label}: overtimeRulesName`).toBe(scenario.rule.name);
    }
    testInfo.annotations.push({ type: 'job-evidence', description: `considerEmployeeRate=${String(storedJob.considerEmployeeRate)}` });

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

    await allowApiWrites('cleanup', 'E2 before-phase sweep: crew job cards', () => sweepCrewJobCards(sessionApi, { day, crewCounter: crew.id }));
    await allowApiWrites('cleanup', 'E2 before-phase sweep: crew time cards', () => sweepCrewTimeCards(sessionApi, { day, crewCounter: crew.id }));

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

/** Non-committing analyze for the crew's day: how many time cards it plans, and any blocking exception codes. */
export async function analyzeCrewDay(
    run: JourneyE2Run,
    opts: { sessionApi: APIRequestContext },
): Promise<{ plannableTotal: number | undefined; blocking: string[] }> {
    const res = await analyzeTransfer(opts.sessionApi, { from: run.day, to: run.day, crewIds: [run.crew.id] });
    if (!res.ok) throw new Error(`POST transfer-to-job-cards/analyze failed with ${res.status}: ${JSON.stringify(res.raw).slice(0, 300)}`);
    return {
        plannableTotal: res.plannableTotal,
        blocking: res.exceptions.filter((e) => /block/i.test(String(e.severity))).map((e) => String(e.code)),
    };
}

/**
 * The previewed card's minute-exact boundaries from the non-committing `job-cards-preview`, independent
 * of how the grid formats a date cell. `grossMinutes - netMinutes` is the meal the engine actually took.
 */
export async function readPreviewBoundaries(run: JourneyE2Run, opts: { sessionApi: APIRequestContext }): Promise<PreviewBoundary[]> {
    const preview = await previewJobCards(opts.sessionApi, { from: run.day, to: run.day, crewIds: [run.crew.id] });
    const clock = (value: unknown) => {
        const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(value));
        if (!match) throw new Error(`job-cards-preview returned an unreadable date-time: ${JSON.stringify(value)}`);
        return { day: match[1], hour: Number(match[2]), minute: Number(match[3]) };
    };
    return preview.rows
        .map((row) => {
            const start = clock(row.dateTimeIn);
            const end = clock(row.dateTimeOut);
            return {
                day: start.day,
                start: { hour: start.hour, minute: start.minute },
                end: { hour: end.hour, minute: end.minute },
                grossMinutes: Number(row.grossMinutes),
                netMinutes: Number(row.netMinutes),
            };
        })
        .sort((a, b) => a.start.hour * 60 + a.start.minute - (b.start.hour * 60 + b.start.minute));
}

/**
 * Read-only GET read-back of the written card(s). Records id, time, amount and the calculation fields as
 * annotations only: their unit is unverified and the on-screen Amount column already carries the proof.
 */
export async function readDailyOvertime(
    run: JourneyE2Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<{ cards: JobCardRecord[]; timeCards: OfficeTimeCard[] }> {
    const { sessionApi, testInfo } = opts;
    const listed = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    for (const card of listed) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
    const cards = await Promise.all(listed.map((c) => getJobCard(sessionApi, c.jobCardCounter)));
    for (const card of cards) {
        const record = card as unknown as Record<string, unknown>;
        const buckets = Object.keys(record)
            .filter((k) => /overtime|double|regular|meal|calculationDesc/i.test(k))
            .map((k) => `${k}=${String(record[k])}`)
            .join(' ');
        testInfo.annotations.push({
            type: 'job-card-fields',
            description: `job card ${card.jobCardCounter} (job ${String(card.jobCounter)}): netTime=${String(card.netTime)} grossTime=${String(card.grossTime)} amount=${String(card.amount)} ${buckets}`,
        });
    }

    const wanted = new Set((run.ctx.cards ?? []).map((c) => c.timeCardCounter));
    const timeCards = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter((c) => wanted.has(c.timeCardCounter));
    return { cards, timeCards };
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

/** Commit the two own rows; the toast is armed first because it is gone by the time the poll returns. */
export async function transferCrewDay(
    run: JourneyE2Run,
    opts: E8Deps,
    scenario: JourneyE8FinalizeCase,
    seed: SeedResult,
    candidates: string[],
): Promise<ExecuteResult> {
    const { sessionApi, pages } = opts;
    const { expected } = scenario;
    const toast = pages.transferToJobCards
        .transferCompleteToast(expected.transferToast.jobCards, expected.transferToast.timeCards)
        .waitFor({ state: 'visible', timeout: 150_000 })
        .then(() => true, () => false);
    // commitTransfer's GET is only the id capture for cleanup; the toast is the proof of what was written.
    const result = await commitTransfer(run, { sessionApi, pages }, seed, candidates);
    expect(await toast, `${scenario.label}: the 'Transfer complete' toast must be seen`).toBe(true);

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
}

async function cellNumber(view: PageObjects['viewJobCards'], row: ReturnType<PageObjects['viewJobCards']['rowsForCrew']>, header: string): Promise<number> {
    const text = ((await (await view.cellByHeader(row, header)).innerText()) ?? '').replace(/,/g, '').trim();
    return text === '' ? 0 : Number(text);
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
    // The row's aria-label is its Reference: the one card the crew filter leaves is the one just written.
    const reference = (await row.getAttribute('aria-label')) ?? '';
    expect(reference, `${label}: the row carries the written card's Reference`).toMatch(/\S/);
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

    expect.soft(await cellNumber(view, row, 'Regular Hours'), `${label}: row Regular Hours`).toBe(totals.regular);
    expect.soft(await cellNumber(view, row, 'Overtime'), `${label}: row Overtime`).toBe(totals.overtime);
    expect.soft(await cellNumber(view, row, 'Double Time'), `${label}: row Double Time`).toBe(totals.double);
    expect.soft(await cellNumber(view, row, 'Amount'), `${label}: row Amount`).toBe(totals.amount);
    expect.soft(await cellNumber(view, row, 'Pieces'), `${label}: row Pieces`).toBe(expected.pieces);
    expect.soft(await cellNumber(view, row, 'Paid Pieces'), `${label}: row Paid Pieces`).toBe(expected.pieces);
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
