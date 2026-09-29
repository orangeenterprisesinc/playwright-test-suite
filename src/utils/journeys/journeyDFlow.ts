import type { APIRequestContext, TestInfo } from '@playwright/test';
import { JOURNEY_D_FIXTURE } from '@data/journey-d/fixture';
import { punchDay } from '@data/journey-b/fixture';
import type { JourneyDRecalculateCase } from '@data/schemas/journeyDScenario';
import { createCrewPieceOut, createCrewTimeIn, createCrewTimeOut, punchTime } from '@utils/api/crewTimeInApi';
import { analyzeTransfer, executeTransfer, previewJobCards, type ExecuteResult } from '@utils/api/transferToJobCardsApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import { ensureCrew, ensureEmployee, ensureJob, getJob, setJobRate, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { deleteJobCard, getJobCard, listRecalcRuns, type JobCardRecord, type RecalcRun } from '@utils/api/jobCardsApi';
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
async function sweepOwnTimeCards(request: APIRequestContext, opts: { day: string; crewCounter: number; jobCounter: number }): Promise<void> {
    const cards = await listTimeCards(request, { from: opts.day, to: opts.day });
    const orphaned = cards.filter((c) => Number(c.crewCounter) === opts.crewCounter && Number(c.jobCounter) === opts.jobCounter);
    for (const card of orphaned) {
        await deleteTimeCard(request, card.timeCardCounter);
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
    office.crew = crew;
    office.job = job;
    office.employees.set(pickerOne.code, pickerOne);
    office.employees.set(pickerTwo.code, pickerTwo);
    ctx.office = office;

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
    await sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id, jobCounter: job.id });

    const recalcBaseline = await maxRecalcRunCounter(sessionApi);

    return { scenario: substituted, office, crew, job, pickerOne, pickerTwo, punchDate, day, recalcBaseline, jobCardIds, cleanup, ctx };
}

/** GET -> merge -> PUT the job's piece rate, annotate why, and read it back. */
export async function setRate(
    run: JourneyDRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
    pieceRate: number,
    note: string,
): Promise<{ pieceRate: number }> {
    opts.testInfo.annotations.push({ type: 'precondition', description: `${note}: job pieceRate -> ${pieceRate}` });
    const job = await setJobRate(opts.sessionApi, run.job.id, pieceRate);
    return { pieceRate: Number(job.pieceRate) };
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
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<SeedResult> {
    const { sessionApi, testInfo } = opts;
    testInfo.annotations.push({
        type: 'transport-substitute',
        description:
            'The crew day is written through POST time-cards/crew-time-in|crew-piece-out|crew-time-out — the ' +
            'same writes a device sync performs; the device itself is out of automated scope for D6.',
    });
    const context = {
        crewCounter: run.crew.id,
        ranchCounter: run.office.ranch.id,
        fieldCounter: run.office.field.id,
        jobCounter: run.job.id,
    };
    const employeeIds = [run.pickerOne.id, run.pickerTwo.id];
    const { punch, pieceOut, timeOut, numOfPieces } = run.scenario.capture;

    await createCrewTimeIn(sessionApi, { ...context, employeeIds, dateTime: punchTime(punch.hour, punch.minute, run.punchDate), crewTableCounter: null });
    await createCrewPieceOut(sessionApi, { ...context, dateTime: punchTime(pieceOut.hour, pieceOut.minute, run.punchDate), crewTableCounter: null, numOfPieces, memo: null });
    await createCrewTimeOut(sessionApi, { ...context, employeeIds, dateTime: punchTime(timeOut.hour, timeOut.minute, run.punchDate), crewTableCounter: null });

    const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
    const own = cards.filter((c) => Number(c.crewCounter) === run.crew.id && Number(c.jobCounter) === run.job.id);
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
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
    seed: SeedResult,
): Promise<ExecuteResult> {
    const { sessionApi } = opts;
    // No `loadAll`: it flips analyze and job-cards-preview to a 202 + jobId async job. The helpers
    // settle that now, but the day is a handful of cards, so the synchronous path is simpler.
    const filter = { from: run.day, to: run.day, crewIds: [run.crew.id], jobIds: [run.job.id] };
    const analysis = await analyzeTransfer(sessionApi, filter);
    if (!analysis.ok) {
        throw new Error(`${run.scenario.label}: analyze failed (${analysis.status}): ${JSON.stringify(analysis.raw).slice(0, 400)}`);
    }
    const blocking = analysis.exceptions.filter((e) => e.severity === 'block');
    if (blocking.length) {
        throw new Error(`${run.scenario.label}: analyze reported a blocking exception: ${JSON.stringify(blocking)}`);
    }

    // The roster guard. `job-cards-preview` names the source time cards a transfer would consume,
    // so it is the only honest way to prove the scope is this run's own rows before committing —
    // the fixture day already carries other people's cards on dev.
    const preview = await previewJobCards(sessionApi, filter);
    const previewIds = new Set(preview.rows.flatMap((row) => (row.sourceRecordIds ?? []).map(String)));
    const ownIds = new Set(seed.timeCardCounters.map(String));
    const outsiders = [...previewIds].filter((id) => !ownIds.has(id));
    if (preview.rows.length !== run.scenario.expected.jobCards || previewIds.size === 0 || outsiders.length) {
        throw new Error(
            `${run.scenario.label}: refusing to execute — job-cards-preview returned ${preview.rows.length} row(s) ` +
                `(expected ${run.scenario.expected.jobCards}) drawing on time cards ${JSON.stringify([...previewIds])}` +
                (outsiders.length ? `, of which ${JSON.stringify(outsiders)} are not this run's` : '') +
                `. This run seeded ${JSON.stringify([...ownIds])}. Raw preview: ${JSON.stringify(preview.raw).slice(0, 600)}`,
        );
    }

    const execution = await executeTransfer(sessionApi, filter);
    run.jobCardIds.push(...execution.jobCardCounters);
    return execution;
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
