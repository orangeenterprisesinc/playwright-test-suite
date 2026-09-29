import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { JOURNEY_D_FIXTURE } from '@data/journey-d/fixture';
import { punchDay } from '@data/journey-b/fixture';
import type { JourneyDRecalculateCase } from '@data/schemas/journeyDScenario';
import type { ExecuteResult } from '@utils/api/transferToJobCardsApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import { ensureCrew, ensureEmployee, ensureJob, getJob, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { deleteJobCard, getJobCard, listJobCards, listRecalcRuns, type JobCardRecord, type RecalcRun } from '@utils/api/jobCardsApi';
import { getPreferences } from '@utils/api/preferencesApi';
import { deleteTimeCard, isoDay, listTimeCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { currentScope } from '@utils/cleanup/cleanupScope';
import { runCleanup, type CleanupContext } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';

// Journey D's first workflow, and a real transfer: D6 cannot be arranged read-only, so this layer
// seeds a whole day of its own time cards, runs transfer-to-job-cards/execute scoped to its own
// crew+job, changes the job's piece rate, and recalculates exactly the two job card ids the
// execute envelope named. Every mutating call is id- or fixture-scoped.

export interface JourneyDRun {
    scenario: JourneyDRecalculateCase;
    office: OfficeFixture;
    crew: EnsuredRecord;
    job: EnsuredRecord;
    pickerOne: EnsuredRecord;
    pickerTwo: EnsuredRecord;
    punchDate: Date;
    /** `YYYY-MM-DD` of the fixture day. */
    day: string;
    /** Max `recalcRunCounter` before this run touches anything. */
    recalcBaseline: number;
    /** Populated by {@link guardedTransfer}; cleanup deletes these first, one at a time, by id. */
    jobCardIds: number[];
    /** The case's cleanup steps, 'after' phase; also registered with the test's cleanup scope. */
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}

async function sweepOwnJobCards(request: APIRequestContext, opts: { day: string; crewCounter: number; jobCounter: number }): Promise<void> {
    const res = await request.get('job-cards', { params: { from: opts.day, to: opts.day } });
    if (!res.ok()) return;
    const body = (await res.json()) as JobCardRecord[] | { items?: JobCardRecord[] };
    const cards = Array.isArray(body) ? body : (body.items ?? []);
    const own = cards.filter((c) => Number(c.crewCounter) === opts.crewCounter && Number(c.jobCounter) === opts.jobCounter);
    for (const card of own) {
        await deleteJobCard(request, card.jobCardCounter, card.version);
    }
}

/**
 * `sweepFixtureCards` (the generic employee-scoped sweep) never sees a crew piece-out row: it
 * carries `employeeCounter: null`. This additionally sweeps by crew+job on the fixture day, so a
 * crashed previous run's piece-out cannot poison this one.
 */
async function sweepOwnTimeCards(request: APIRequestContext, opts: { day: string; crewCounter: number }): Promise<void> {
    const cards = await listTimeCards(request, { from: opts.day, to: opts.day });
    // Scoped by crew only: the crew time-in and time-out carry no job, and the piece-out carries no
    // employee, so neither filter alone sees the whole day.
    const orphaned = cards.filter((c) => Number(c.crewCounter) === opts.crewCounter);
    for (const card of orphaned) {
        await deleteTimeCard(request, card.timeCardCounter);
    }
}

/**
 * Make the fixture rows usable by the OFFICE FORMS, not just by the API.
 *
 * The API takes an explicit `employeeIds` list and a `jobCounter`, so it happily punches inactive
 * employees who belong to no crew, against an inactive job — and the spec stayed green on a fixture
 * no human could have built in the product. The forms are stricter, and each rule below was a
 * separate red run: an inactive employee is not offered ("No employees found for this crew"), an
 * employee with no home crew is not either, and an inactive job is missing from the Phase picker.
 */
async function ensureFixtureUsable(request: APIRequestContext, opts: { crewId: number; employeeIds: number[]; jobId: number }): Promise<void> {
    for (const id of opts.employeeIds) {
        const employee = (await (await request.get(`employees/${id}`)).json()) as Record<string, unknown>;
        if (employee.active === true && Number(employee.crewCounter) === opts.crewId) continue;
        const { employeeCounter: _drop, ...body } = employee;
        await request.put(`employees/${id}`, { data: { ...body, active: true, crewCounter: opts.crewId } });
    }
    const job = (await (await request.get(`jobs/${opts.jobId}`)).json()) as Record<string, unknown>;
    if (job.active !== true) {
        const { jobCounter: _drop, ...body } = job;
        await request.put(`jobs/${opts.jobId}`, { data: { ...body, active: true } });
    }
}

async function maxRecalcRunCounter(request: APIRequestContext): Promise<number> {
    const runs = await listRecalcRuns(request);
    return runs.reduce((max, run) => Math.max(max, Number(run.recalcRunCounter)), 0);
}

/**
 * Seeds the office half of Journey D (crew, two pickers, piece job), runs the before-phase
 * recovery sweep (job cards first, then time cards — a crashed previous run must not poison this
 * one), asserts the toolbar gate is already open, and captures the recalc-run baseline.
 */
export async function prepareJourneyD(
    scenario: JourneyDRecalculateCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<JourneyDRun> {
    const { sessionApi, testInfo } = opts;
    const F = JOURNEY_D_FIXTURE;
    const substituted = substituteTokens(scenario, {});
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [] };
    const JOURNEY_D_FIXTURE_CREW_ID = { value: 0 };
    const jobCardIds: number[] = [];
    // Job cards must go first: a transferred time card cannot be deleted (409
    // record.transferred_delete) and the transfer reverse is blocked once a card has been
    // recalculated (409 reverse_blocked / job_card_edited). Deleting the card by id resets its
    // sources back to transferred:false, which is the only thing that makes the day removable.
    const finishCleanup = async (): Promise<void> => {
        for (const id of jobCardIds) {
            try {
                const card = await getJobCard(sessionApi, id);
                await deleteJobCard(sessionApi, id, card.version);
            } catch (error) {
                await testInfo.attach(`cleanup-warning-jobCard-${id}`, {
                    body: error instanceof Error ? error.message : String(error),
                    contentType: 'text/plain',
                });
            }
        }
        await runCleanup(substituted.cleanup, sessionApi, testInfo, ctx);
        // The declarative timeCards step filters by employee code, so it never sees the crew
        // piece-out (employeeCounter is null on it). Sweep the day by crew to finish the job.
        await sweepOwnTimeCards(sessionApi, { day: isoDay(punchDay(substituted.dayOffset)), crewCounter: JOURNEY_D_FIXTURE_CREW_ID.value }).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup();
        registration?.complete();
    };

    // Journey B's ranch/field give the punch its context; the crew, pickers and job are Journey D's own.
    const office = await seedOfficeFixture(sessionApi);
    const crew = await ensureCrew(sessionApi, F.crew);
    const pickerOne = await ensureEmployee(sessionApi, F.pickerOne);
    const pickerTwo = await ensureEmployee(sessionApi, F.pickerTwo);
    const job = await ensureJob(sessionApi, { code: F.job.code, name: F.job.name, paymentType: F.job.paymentType });
    JOURNEY_D_FIXTURE_CREW_ID.value = crew.id;
    office.crew = crew;
    office.job = job;
    office.employees.set(pickerOne.code, pickerOne);
    office.employees.set(pickerTwo.code, pickerTwo);
    ctx.office = office;

    await ensureFixtureUsable(sessionApi, { crewId: crew.id, employeeIds: [pickerOne.id, pickerTwo.id], jobId: job.id });

    const preferences = await getPreferences(sessionApi);
    if (preferences.allowRecalculateFromJobCard !== true) {
        throw new Error(
            `${substituted.label}: allowRecalculateFromJobCard is not true on this environment — D6 asserts ` +
                'the toolbar gate is already open rather than flipping a shared preference.',
        );
    }

    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);

    await sweepOwnJobCards(sessionApi, { day, crewCounter: crew.id, jobCounter: job.id });
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id });

    const recalcBaseline = await maxRecalcRunCounter(sessionApi);

    return { scenario: substituted, office, crew, job, pickerOne, pickerTwo, punchDate, day, recalcBaseline, jobCardIds, cleanup, ctx };
}

/**
 * Change the job's piece rate **on screen**, through Setup > Job.
 *
 * This is catalog D6's own step 1, so it is a workflow action, not setup: driving it through
 * `PUT /jobs/{id}` would hide the step from the run and from any recording made of it. The API is
 * reserved here for the preference read and the after-run cleanup.
 */
export async function setRateOnScreen(
    run: JourneyDRun,
    opts: { pages: PageObjects; testInfo: TestInfo },
    pieceRate: number,
    note: string,
): Promise<{ pieceRate: number }> {
    opts.testInfo.annotations.push({ type: 'workflow-step', description: `${note}: Setup > Job -> Piece Rate ${pieceRate}` });
    await opts.pages.job.gotoEditById(run.job.id, run.job.name);
    const shown = await opts.pages.job.setPieceRate(pieceRate);
    return { pieceRate: Number(shown) };
}

export interface SeedResult {
    /** The five time-card ids the day's punches created (2 time-in + 2 time-out + 1 crew piece-out). */
    timeCardCounters: number[];
}

/**
 * The minimum transferable day (measured live): crew time-in -> crew piece-out -> crew time-out,
 * all on the fixture crew and job. This is a substitute for the device transport, not for the
 * assertions — the device itself is out of scope for D6.
 */
export async function seedFixtureDay(
    run: JourneyDRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<SeedResult> {
    const { sessionApi, pages } = opts;
    const { punch, pieceOut, timeOut, numOfPieces } = run.scenario.capture;
    const F = JOURNEY_D_FIXTURE;
    const ranch = run.office.ranch.name;
    const field = run.office.field.name;

    // Driven on Input > Batch rather than through POST time-cards/*: the API takes an explicit
    // employeeIds list, so it will punch employees who are not in the crew at all, while the form
    // only offers that crew's active members. That difference hides real fixture problems.
    await pages.crewTimeIn.punchIn({ day: run.day, hour: punch.hour, minute: punch.minute, crew: F.crew.name, ranch, field, job: F.job.name });
    await pages.crewPieceOut.pieceOut({ day: run.day, hour: pieceOut.hour, minute: pieceOut.minute, crew: F.crew.name, ranch, field, job: F.job.name, pieces: numOfPieces });
    await pages.crewTimeOut.punchOut({ day: run.day, hour: timeOut.hour, minute: timeOut.minute, crew: F.crew.name });

    const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
    const own = cards.filter((c) => Number(c.crewCounter) === run.crew.id);
    // Hands runCleanup the exact card ids this run created, rather than relying on an employee filter
    // that would never see the crew piece-out (employeeCounter: null).
    run.ctx.cards = own as OfficeTimeCard[];
    return { timeCardCounters: own.map((c) => c.timeCardCounter) };
}


/**
 * Analyze scoped to this run's own crew+job, guarded so the roster `job-cards-preview` would write
 * from is a subset of the seeded time cards (never empty) before anything executes (day -11 already
 * carries other people's rows on dev — see the plan's binding safety note), then execute and poll to
 * completion.
 *
 * `analyze`'s response carries no candidate roster (`{plannableTotal, eligibleTotal, totalPieces,
 * exceptions:[…]}`, verified live 2026-09-29) — only `job-cards-preview` names the source time-card
 * ids a transfer would actually write, via each row's `sourceRecordIds`. That preview is also
 * non-committing, so it is safe to call before `execute`.
 */
export async function guardedTransfer(
    run: JourneyDRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
    seed: SeedResult,
): Promise<ExecuteResult> {
    const { sessionApi, pages } = opts;
    const transfer = pages.transferToJobCards;

    await transfer.goto();
    await transfer.scopeToDay(run.day);
    await transfer.analyzeCandidates({ expected: seed.timeCardCounters.length });

    // The roster guard, on screen. The candidates the analyze loaded must be exactly this run's own
    // rows before anything commits: the fixture day carries other people's cards on dev, and the
    // header "Select all rows" is select-all-across-filter, not the visible rows.
    const own = new Set((run.ctx.cards ?? []).map((c) => String(c.reference)));
    const candidates = await transfer.candidateReferences();
    const outsiders = candidates.filter((r) => !own.has(r));
    if (candidates.length !== own.size || outsiders.length) {
        throw new Error(
            `${run.scenario.label}: refusing to transfer — the screen offered ${candidates.length} candidate(s) ` +
                `${JSON.stringify(candidates)}` +
                (outsiders.length ? `, of which ${JSON.stringify(outsiders)} are not this run's` : '') +
                `. This run seeded ${JSON.stringify([...own])}.`,
        );
    }

    for (const reference of candidates) await transfer.selectCandidate(reference);
    await transfer.runTransfer();

    // Read the committed result back over the API: the screen reports progress, the cards are the
    // record. This is verification of a UI action, not a substitute for it.
    //
    // Ids are recorded on every poll, before the count is asserted. Recording them afterwards means
    // a wrong count leaves cleanup unaware of the cards that WERE written — they survive the run,
    // their source time cards become undeletable, and the next run finds an employee already
    // clocked in and silently punches one fewer.
    await expect(async () => {
        const written = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
        for (const card of written) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
        expect(written).toHaveLength(run.scenario.expected.jobCards);
    }).toPass({ timeout: 120_000 });

    const cards = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    const jobCardCounters = cards.map((c) => c.jobCardCounter);
    return {
        status: 'complete',
        jobCardsWritten: jobCardCounters.length,
        timeCardsTransferred: seed.timeCardCounters.length,
        transferRunCounter: 0,
        jobCardCounters,
        raw: cards,
    };
}


export async function readJobCards(opts: { sessionApi: APIRequestContext }, ids: number[]): Promise<JobCardRecord[]> {
    return Promise.all(ids.map((id) => getJobCard(opts.sessionApi, id)));
}

/** Every recalc run newer than the baseline captured in {@link prepareJourneyD}. */
export async function assertRecalcRuns(run: JourneyDRun, opts: { sessionApi: APIRequestContext }): Promise<RecalcRun[]> {
    const runs = await listRecalcRuns(opts.sessionApi);
    return runs.filter((r) => Number(r.recalcRunCounter) > run.recalcBaseline);
}

/** The day's seeded time cards, read back after the recalculate — proves a reverse (D5) did not run. */
export async function assertTimeCardsStillTransferred(
    run: JourneyDRun,
    opts: { sessionApi: APIRequestContext },
    ids: number[],
): Promise<OfficeTimeCard[]> {
    const cards = await listTimeCards(opts.sessionApi, { from: run.day, to: run.day });
    const wanted = new Set(ids);
    return cards.filter((c) => wanted.has(c.timeCardCounter));
}

// getJob is re-exported so a later Journey D spec can read the fixture job without reaching past
// this flow layer (the ESLint import ban keeps @utils/api/* out of specs).
export { getJob };
