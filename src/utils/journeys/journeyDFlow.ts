import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { JOURNEY_D_FIXTURE, journeyD3Fixture, journeyD5Fixture, journeyD9Fixture, journeyD10Fixture } from '@data/journey-d/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import type { JourneyD3CorrectionCase, JourneyD5ReverseCase, JourneyD9DistributionCase, JourneyD10SegmentCase, JourneyDRecalculateCase } from '@data/schemas/journeyDScenario';
import { analyzeTransfer, listTransferRuns, previewJobCards, readExecuteJob, type ExecuteResult, type TransferRunRecord } from '@utils/api/transferToJobCardsApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import { ensureCrew, ensureEmployee, ensureJob, getJob, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { deleteJobCard, getJobCard, listJobCards, listRecalcRuns, type JobCardRecord, type RecalcRun } from '@utils/api/jobCardsApi';
import { getPreferences, putPreferences } from '@utils/api/preferencesApi';
import { CARD_TYPE, deleteTimeCard, isoDay, listTimeCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { allowApiWrites } from '@utils/api/writeGuard';
import { currentScope } from '@utils/cleanup/cleanupScope';
import { runCleanup, type CleanupContext } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';
import {
    ensureCrewOnScreen,
    ensureEmployeeOnScreen,
    ensureFieldOnScreen,
    ensureJobOnScreen,
    ensureRanchOnScreen,
} from '@utils/fixtureRows/ensureOnScreen';
import { relayConfig } from '@config/relay.config';
import { journeyBTestTimeoutMs } from '@utils/api/connectivityImportApi';
import { deliverAndVerifyCards } from '@utils/api/officeVerification';
import { envelopeView, sendEnvelope } from '@utils/journeys/journeyBFlow';
import { buildEnvelope, exportFileName, lineagePrefix, punchMoment, type DeviceRecord } from '@utils/relay/exportEnvelope';

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

/** The slice of a run the transfer helpers read — D6, D9 and D10 runs all satisfy it. */
interface TransferRun {
    scenario: { label: string; expected: { jobCards: number } };
    crew: EnsuredRecord;
    day: string;
    jobCardIds: number[];
    ctx: CleanupContext;
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

/** D10's crew owns three jobs, so its sweep is by crew alone. */
async function sweepCrewJobCards(request: APIRequestContext, opts: { day: string; crewCounter: number }): Promise<void> {
    const cards = (await listJobCards(request, { from: opts.day, to: opts.day })).filter((c) => Number(c.crewCounter) === opts.crewCounter);
    for (const card of cards) await deleteJobCard(request, card.jobCardCounter, card.version);
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
    // `api` is the scope's own untraced context: after a timeout the test's `sessionApi` throws
    // ENOENT on its trace file before any call reaches the network. A killed process runs none of
    // this — that case is covered by the before-phase sweep at the top of prepareJourneyD, which
    // wipes this test's own scope on every start regardless of what a previous run left.
    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        for (const id of jobCardIds) {
            try {
                const card = await getJobCard(api, id);
                await deleteJobCard(api, id, card.version);
            } catch (error) {
                await testInfo.attach(`cleanup-warning-jobCard-${id}`, {
                    body: error instanceof Error ? error.message : String(error),
                    contentType: 'text/plain',
                });
            }
        }
        await runCleanup(substituted.cleanup, api, testInfo, ctx);
        // The declarative timeCards step filters by employee code, so it never sees the crew
        // piece-out (employeeCounter is null on it). Sweep the day by crew to finish the job.
        await sweepOwnTimeCards(api, { day: isoDay(punchDay(substituted.dayOffset)), crewCounter: JOURNEY_D_FIXTURE_CREW_ID.value }).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
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

    // The time-out form only offers employees with an OPEN time-in, so it must not open until the
    // time-in is actually readable. Saving the form is not the same instant as the row being
    // visible, and without this the form intermittently reports "No employees with open time in
    // found for this crew" and the day is seeded one punch short.
    await expect(async () => {
        const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
        const timeIns = cards.filter((c) => Number(c.crewCounter) === run.crew.id && Number(c.cardType) === CARD_TYPE.timeIn);
        expect(timeIns).toHaveLength(run.scenario.expected.jobCards);
    }).toPass({ timeout: 60_000 });

    await pages.crewTimeOut.punchOut({ day: run.day, hour: timeOut.hour, minute: timeOut.minute, crew: F.crew.name });

    const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
    const own = cards.filter((c) => Number(c.crewCounter) === run.crew.id);
    // Hands runCleanup the exact card ids this run created, rather than relying on an employee filter
    // that would never see the crew piece-out (employeeCounter: null).
    run.ctx.cards = own as OfficeTimeCard[];
    return { timeCardCounters: own.map((c) => c.timeCardCounter) };
}


/**
 * Scope the Transfer screen to the fixture day, analyze, optionally narrow to one Work Crew, and
 * guard the roster: the candidates on screen must be exactly this run's own rows before anything
 * can be ticked (day -11 and -12 carry other people's untransferred rows on dev, and the header
 * "Select all rows" is select-all-across-filter, not the visible rows). Returns the candidates.
 *
 * `crew` is off by default. When given, the Work Crew filter is applied after the analyze (its
 * options come from the loaded rows) and before the guard.
 */
export async function openScopedCandidates(
    run: TransferRun,
    opts: { pages: PageObjects; crew?: string },
    seed: SeedResult,
): Promise<string[]> {
    const transfer = opts.pages.transferToJobCards;
    const own = new Set((run.ctx.cards ?? []).map((c) => String(c.reference)));

    await transfer.goto();
    await transfer.scopeToDay(run.day);
    await transfer.analyzeCandidates({ expected: seed.timeCardCounters.length });

    if (opts.crew) {
        await transfer.filterByCrew(opts.crew);
        // The filter re-renders asynchronously; a miss falls through to the guard below, which names both sets.
        await expect.poll(async () => (await transfer.candidateReferences()).length, { timeout: 30_000 }).toBe(own.size).catch(() => undefined);
    }

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
    return candidates;
}

/** Tick each candidate by Reference, commit, then record every written job card id before asserting the count. */
export async function commitTransfer(
    run: TransferRun,
    opts: { sessionApi: APIRequestContext; pages: PageObjects },
    seed: SeedResult,
    candidates: string[],
): Promise<ExecuteResult> {
    const { sessionApi, pages } = opts;
    const transfer = pages.transferToJobCards;

    for (const reference of candidates) await transfer.selectCandidate(reference);
    const jobId = await transfer.runTransfer();
    if (!jobId) throw new Error('The Transfer click sent no POST transfer-to-job-cards/execute to the server, so nothing was ever queued.');

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
        if (written.length < run.scenario.expected.jobCards) {
            // A failed async execute writes nothing and is otherwise indistinguishable from a slow one.
            const job = await readExecuteJob(sessionApi, jobId);
            if (!/^(complete|running|pending|queued|)$/i.test(job.status)) {
                throw new Error(`transfer execute job ${jobId} ended ${job.status}: ${job.error ?? JSON.stringify(job.raw)}`);
            }
        }
        expect(written).toHaveLength(run.scenario.expected.jobCards);
    }).toPass({ timeout: 120_000 });

    const cards = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    const jobCardCounters = cards.map((c) => c.jobCardCounter);
    // The execute job is the only place the run id is reported; D5 needs it to guard the reverse.
    const finished = await readExecuteJob(sessionApi, jobId).catch(() => undefined);
    return {
        status: 'complete',
        jobCardsWritten: jobCardCounters.length,
        timeCardsTransferred: seed.timeCardCounters.length,
        transferRunCounter: finished?.transferRunCounter ?? 0,
        jobCardCounters,
        raw: cards,
    };
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
 *
 * Pass `crew` to also apply the Work Crew filter before the roster guard (default off).
 */
export async function guardedTransfer(
    run: TransferRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects; crew?: string },
    seed: SeedResult,
): Promise<ExecuteResult> {
    const candidates = await openScopedCandidates(run, { pages: opts.pages, crew: opts.crew }, seed);
    return commitTransfer(run, { sessionApi: opts.sessionApi, pages: opts.pages }, seed, candidates);
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

// ── D9 — Group piece-out distribution ────────────────────────────────────────────────────────

export interface JourneyD9Run {
    scenario: JourneyD9DistributionCase;
    office: OfficeFixture;
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    crew: EnsuredRecord;
    job: EnsuredRecord;
    /** Home-crewed members who punch in. */
    participants: EnsuredRecord[];
    /** Home-crewed members who do not — they must receive no job card. */
    nonParticipants: EnsuredRecord[];
    punchDate: Date;
    /** `YYYY-MM-DD` of the fixture day. */
    day: string;
    /** Filled by {@link commitTransfer}; cleanup deletes these first, one at a time, by id. */
    jobCardIds: number[];
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}

export interface D9Seed extends SeedResult {
    /** The crew piece-out's Reference — the one own card with no employee. */
    pieceOutReference: string;
}

/**
 * Builds D9's fixture rows on screen (existence is a GET; the create and any repair are UI), reads
 * and asserts the piece preferences, and runs the before-phase sweep: job cards first, because a
 * transferred time card cannot be deleted, then the crew's time cards.
 *
 * Does not call `seedOfficeFixture` (it API-creates the whole Journey B fixture) nor copy
 * `ensureFixtureUsable` (a raw PUT, which the write guard rejects as a UI-first violation).
 */
export async function prepareJourneyD9(
    scenario: JourneyD9DistributionCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<JourneyD9Run> {
    const { sessionApi, testInfo, pages } = opts;
    const F = journeyD9Fixture();
    const substituted = substituteTokens(scenario, {});
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

    const deps = { api: sessionApi, pages, testInfo };
    const ranch = await ensureRanchOnScreen({ code: JOURNEY_B_FIXTURE.ranch.code, name: JOURNEY_B_FIXTURE.ranch.name }, deps);
    const field = await ensureFieldOnScreen(
        { code: JOURNEY_B_FIXTURE.field.code, name: JOURNEY_B_FIXTURE.field.name, ranch: { id: ranch.id, name: ranch.name } },
        deps,
    );
    // The crew first: the New Employee form's Crew combobox arrives pre-filled with another crew.
    const crew = await ensureCrewOnScreen(F.crew, deps);
    const homeCrew = { id: crew.id, name: crew.name };
    const pickers = {
        pickerOne: await ensureEmployeeOnScreen({ ...F.pickerOne, homeCrew }, deps),
        pickerTwo: await ensureEmployeeOnScreen({ ...F.pickerTwo, homeCrew }, deps),
        pickerThree: await ensureEmployeeOnScreen({ ...F.pickerThree, homeCrew }, deps),
    };
    const job = await ensureJobOnScreen(
        { code: F.job.code, name: F.job.name, paymentType: F.job.paymentType, pieceRate: F.job.pieceRate },
        deps,
    );

    // D9's cleanup is the 'timeCards' step plus id-scoped job-card deletes, and the only field either
    // reads is `employees`. The rest of OfficeFixture (field2, job2, mealJob) is Journey B's and has no
    // D9 equivalent, so this is deliberately partial rather than invented.
    const office = {
        ranch,
        field,
        job,
        crew,
        employees: new Map(Object.values(pickers).map((p) => [p.code, p] as const)),
    } as unknown as OfficeFixture;

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };
    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);
    const jobCardIds: number[] = [];

    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        await allowApiWrites('cleanup', 'D9 teardown: own job cards by id', async () => {
            for (const id of jobCardIds) {
                try {
                    const card = await getJobCard(api, id);
                    await deleteJobCard(api, id, card.version);
                } catch (error) {
                    await testInfo.attach(`cleanup-warning-jobCard-${id}`, {
                        body: error instanceof Error ? error.message : String(error),
                        contentType: 'text/plain',
                    });
                }
            }
        });
        await runCleanup(substituted.cleanup, api, testInfo, ctx);
        await allowApiWrites('cleanup', 'D9 teardown: crew-scoped day sweep', () =>
            sweepOwnTimeCards(api, { day, crewCounter: crew.id }),
        ).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    // Read, never written: a moved ceiling must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    const { numOfPieces } = substituted.capture;
    if (!(Number(preferences.maximumNumberOfPieces) >= numOfPieces) || !(Number(preferences.minimumNumberOfPieces) <= numOfPieces)) {
        throw new Error(
            `${substituted.label}: capture.numOfPieces=${numOfPieces} is outside the environment's piece limits ` +
                `(minimumNumberOfPieces=${String(preferences.minimumNumberOfPieces)}, maximumNumberOfPieces=${String(preferences.maximumNumberOfPieces)}).`,
        );
    }

    await allowApiWrites('cleanup', 'D9 before-phase sweep: own job cards', () =>
        sweepOwnJobCards(sessionApi, { day, crewCounter: crew.id, jobCounter: job.id }),
    );
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', 'D9 before-phase sweep: crew time cards', () =>
        sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id }),
    );

    return {
        scenario: substituted,
        office,
        ranch,
        field,
        crew,
        job,
        participants: substituted.participants.map((key) => pickers[key]),
        nonParticipants: substituted.nonParticipants.map((key) => pickers[key]),
        punchDate,
        day,
        jobCardIds,
        cleanup,
        ctx,
    };
}

/**
 * Crew time-in restricted to the participants (the roster arrives pre-checked, so this deselects
 * the rest), then the piece-out for the whole crew, then the time-out — all on screen.
 */
export async function seedCrewPieceOutDay(
    run: JourneyD9Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<D9Seed> {
    const { sessionApi, pages } = opts;
    const { punch, pieceOut, timeOut, numOfPieces } = run.scenario.capture;
    const base = { day: run.day, crew: run.crew.name };

    await pages.crewTimeIn.punchIn({
        ...base,
        hour: punch.hour,
        minute: punch.minute,
        ranch: run.ranch.name,
        field: run.field.name,
        job: run.job.name,
        employees: run.participants.map((p) => p.name),
    });

    // The time-out form only offers employees with an OPEN time-in, so wait until the saved
    // time-ins are readable rather than trusting that Save and visibility are the same instant.
    await expect(async () => {
        const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
        const timeIns = cards.filter((c) => Number(c.crewCounter) === run.crew.id && Number(c.cardType) === CARD_TYPE.timeIn);
        expect(timeIns).toHaveLength(run.participants.length);
    }).toPass({ timeout: 60_000 });

    await pages.crewPieceOut.pieceOut({
        ...base,
        hour: pieceOut.hour,
        minute: pieceOut.minute,
        ranch: run.ranch.name,
        field: run.field.name,
        job: run.job.name,
        pieces: numOfPieces,
    });
    await pages.crewTimeOut.punchOut({ ...base, hour: timeOut.hour, minute: timeOut.minute });

    const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
    const own = cards.filter((c) => Number(c.crewCounter) === run.crew.id);
    // Recorded before any assertion, so teardown knows the cards even when one fails.
    run.ctx.cards = own as OfficeTimeCard[];

    const pieceOuts = own.filter((c) => c.employeeCounter === null || c.employeeCounter === undefined);
    if (pieceOuts.length !== 1) {
        throw new Error(`${run.scenario.label}: expected exactly one crew piece-out (no employee) among ${own.length} own time cards, found ${pieceOuts.length}.`);
    }
    return { timeCardCounters: own.map((c) => c.timeCardCounter), pieceOutReference: String(pieceOuts[0].reference) };
}

/**
 * Read-only GET read-back of what the transfer wrote: the crew's job cards on the fixture day and
 * the seeded time cards. Records each job card's `amount` as an annotation only — a known product
 * defect leaves it at 0 while `pieceAmount` is right (D6, 2026-09-29).
 */
export async function readDistribution(
    run: JourneyD9Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
    seed: SeedResult,
): Promise<{ cards: JobCardRecord[]; timeCards: OfficeTimeCard[] }> {
    const { sessionApi, testInfo } = opts;
    const listed = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    for (const card of listed) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
    const cards = await Promise.all(listed.map((c) => getJobCard(sessionApi, c.jobCardCounter)));
    for (const card of cards) {
        testInfo.annotations.push({ type: 'product-defect-amount', description: `job card ${card.jobCardCounter}: amount=${String(card.amount)}` });
    }

    const wanted = new Set(seed.timeCardCounters);
    const timeCards = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter((c) => wanted.has(c.timeCardCounter));
    return { cards, timeCards };
}

// ── D10 — Exercise and auto-break split ──────────────────────────────────────────────────────

type D10JobKey = JourneyD10SegmentCase['expected']['segments'][number]['job'];

export interface JourneyD10Run {
    scenario: JourneyD10SegmentCase;
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    crew: EnsuredRecord;
    picker: EnsuredRecord;
    jobs: Record<D10JobKey, EnsuredRecord>;
    /** `YYYY-MM-DD` of the fixture day. */
    day: string;
    /** Filled by {@link commitTransfer}; cleanup deletes these first, one at a time, by id. */
    jobCardIds: number[];
    /** `paidBreakJob` is shared tenant state: cleanup restores it whenever this is set. */
    preference: { designated: boolean };
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}

// Wire values behind the Crew form's three selects (measured live 2026-10-05).
const D10_CREW_ENUMS: Record<'createBreakCardFromTimeIn' | 'autoPaidBreakType' | 'autoReturnFromBreak', Record<string, number>> = {
    createBreakCardFromTimeIn: { No: 0, 'Time Only': 1, Everyone: 2 },
    autoPaidBreakType: { None: 0, All: 1, 'Time Employees Only': 2, 'Piece Employees Only': 3 },
    autoReturnFromBreak: { Never: 0, 'From Paid Break': 1, 'From Meal': 2, 'From Paid Break and Meal': 3 },
};

/**
 * Builds D10's fixture rows on screen, applies the crew's exercise and break rule on screen and
 * reads it back, asserts the day-window preference gate, and runs the before-phase sweep (job
 * cards first — a transferred time card cannot be deleted — then the crew's time cards).
 */
export async function prepareJourneyD10(
    scenario: JourneyD10SegmentCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<JourneyD10Run> {
    const { sessionApi, testInfo, pages } = opts;
    const F = journeyD10Fixture();
    const substituted = substituteTokens(scenario, {});
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

    const deps = { api: sessionApi, pages, testInfo };
    const ranch = await ensureRanchOnScreen({ code: JOURNEY_B_FIXTURE.ranch.code, name: JOURNEY_B_FIXTURE.ranch.name }, deps);
    const field = await ensureFieldOnScreen(
        { code: JOURNEY_B_FIXTURE.field.code, name: JOURNEY_B_FIXTURE.field.name, ranch: { id: ranch.id, name: ranch.name } },
        deps,
    );
    // The crew first: the New Employee form's Crew combobox arrives pre-filled with another crew.
    const crew = await ensureCrewOnScreen(F.crew, deps);
    const picker = await ensureEmployeeOnScreen({ ...F.picker, homeCrew: { id: crew.id, name: crew.name } }, deps);
    const jobSpec = (j: typeof F.workJob) => ({ code: j.code, name: j.name, paymentType: j.paymentType, hourlyRate: j.hourlyRate });
    const jobs: Record<D10JobKey, EnsuredRecord> = {
        workJob: await ensureJobOnScreen(jobSpec(F.workJob), deps),
        exerciseJob: await ensureJobOnScreen(jobSpec(F.exerciseJob), deps),
        breakJob: await ensureJobOnScreen(jobSpec(F.breakJob), deps),
    };

    const office = {
        ranch,
        field,
        job: jobs.workJob,
        crew,
        employees: new Map([[picker.code, picker]]),
    } as unknown as OfficeFixture;

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };
    const day = isoDay(punchDay(substituted.dayOffset));
    const jobCardIds: number[] = [];
    const preference = { designated: false };

    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        // First, because it is the only tenant-wide state this spec touches. 0 clears the FK back to
        // null; null would be ignored by the partial PUT.
        if (preference.designated) {
            try {
                await allowApiWrites('preference', 'D10 teardown: clear paidBreakJob', () => putPreferences(api, { paidBreakJob: 0 }));
                const after = await getPreferences(api);
                if (after.paidBreakJob !== null && after.paidBreakJob !== undefined) throw new Error(`paidBreakJob still reads ${String(after.paidBreakJob)}`);
                preference.designated = false;
            } catch (error) {
                await testInfo.attach('cleanup-warning-paidBreakJob', {
                    body: error instanceof Error ? error.message : String(error),
                    contentType: 'text/plain',
                });
            }
        }
        await allowApiWrites('cleanup', 'D10 teardown: own job cards by id', async () => {
            for (const id of jobCardIds) {
                try {
                    const card = await getJobCard(api, id);
                    await deleteJobCard(api, id, card.version);
                } catch (error) {
                    await testInfo.attach(`cleanup-warning-jobCard-${id}`, {
                        body: error instanceof Error ? error.message : String(error),
                        contentType: 'text/plain',
                    });
                }
            }
        });
        await runCleanup(substituted.cleanup, api, testInfo, ctx);
        await allowApiWrites('cleanup', 'D10 teardown: crew-scoped day sweep', () =>
            sweepOwnTimeCards(api, { day, crewCounter: crew.id }),
        ).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    // Catalog step 1's own setup, on screen: a PUT /crews/{id} would hide it from the run.
    const rule = substituted.crewRule;
    await pages.crew.gotoEditById(crew.id, crew.name);
    await pages.crew.setBreakAutomation({
        includeInTransfer: true,
        timeEmployeesIncluded: true,
        exerciseJob: jobs.exerciseJob.name,
        exerciseJobLengthMinutes: rule.exerciseJobLengthMinutes,
        createBreakCardFromTimeIn: rule.createBreakCardFromTimeIn,
        autoPaidBreakType: rule.autoPaidBreakType,
        autoReturnFromBreak: rule.autoReturnFromBreak,
        breakLengths: String(rule.breakLengthMinutes),
    });
    const stored = (await (await sessionApi.get(`crews/${crew.id}`)).json()) as Record<string, unknown>;
    expect(
        {
            exerciseJobCounter: Number(stored.exerciseJobCounter),
            exerciseJobLengthMinutes: Number(stored.exerciseJobLengthMinutes),
            createBreakCardFromTimeIn: Number(stored.createBreakCardFromTimeIn),
            autoPaidBreakType: Number(stored.autoPaidBreakType),
            autoReturnFromBreak: Number(stored.autoReturnFromBreak),
            breakLengthMinutesCommaSeparated: String(stored.breakLengthMinutesCommaSeparated).trim(),
        },
        `${substituted.label}: the crew rule must persist exactly as the screen saved it`,
    ).toEqual({
        exerciseJobCounter: jobs.exerciseJob.id,
        exerciseJobLengthMinutes: rule.exerciseJobLengthMinutes,
        createBreakCardFromTimeIn: D10_CREW_ENUMS.createBreakCardFromTimeIn[rule.createBreakCardFromTimeIn],
        autoPaidBreakType: D10_CREW_ENUMS.autoPaidBreakType[rule.autoPaidBreakType],
        autoReturnFromBreak: D10_CREW_ENUMS.autoReturnFromBreak[rule.autoReturnFromBreak],
        breakLengthMinutesCommaSeparated: String(rule.breakLengthMinutes),
    });

    // Read, never written: a moved window must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(substituted.dayOffset))) {
        throw new Error(
            `${substituted.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${substituted.dayOffset}.`,
        );
    }
    for (const key of ['paidBreakJob', 'lockTCsAfterTransferToJCs', 'singleJobCardOnBreakReturn']) {
        testInfo.annotations.push({ type: 'preference-evidence', description: `${key}=${String(preferences[key])}` });
    }

    await allowApiWrites('cleanup', 'D10 before-phase sweep: crew job cards', () =>
        sweepCrewJobCards(sessionApi, { day, crewCounter: crew.id }),
    );
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', 'D10 before-phase sweep: crew time cards', () =>
        sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id }),
    );

    return { scenario: substituted, ranch, field, crew, picker, jobs, day, jobCardIds, preference, cleanup, ctx };
}

/**
 * Time-in, a break start with no return punch, and the time-out — all on screen. The break start is
 * a Crew Time In onto the paid-break job: both Break Card forms require an end time.
 */
export async function seedExerciseAndBreakDay(
    run: JourneyD10Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<SeedResult> {
    const { sessionApi, pages } = opts;
    const { timeIn, breakStart, timeOut } = run.scenario.capture;
    const where = { day: run.day, crew: run.crew.name, ranch: run.ranch.name, field: run.field.name, employees: [run.picker.name] };

    // The next form only offers employees with an open time-in, so wait until the saved punch is
    // readable rather than trusting that Save and visibility are the same instant.
    const timeInsReadable = (count: number) =>
        expect(async () => {
            const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
            const timeIns = cards.filter((c) => Number(c.crewCounter) === run.crew.id && Number(c.cardType) === CARD_TYPE.timeIn);
            expect(timeIns).toHaveLength(count);
        }).toPass({ timeout: 60_000 });

    await pages.crewTimeIn.punchIn({ ...where, ...timeIn, job: run.jobs.workJob.name });
    await timeInsReadable(1);
    await pages.crewTimeIn.punchIn({ ...where, ...breakStart, job: run.jobs.breakJob.name });
    await timeInsReadable(2);
    await pages.crewTimeOut.punchOut({ day: run.day, crew: run.crew.name, ...timeOut });

    const cards = await listTimeCards(sessionApi, { from: run.day, to: run.day });
    const own = cards.filter((c) => Number(c.crewCounter) === run.crew.id);
    // Recorded before any assertion, so teardown knows the cards even when one fails.
    run.ctx.cards = own as OfficeTimeCard[];
    if (own.length !== run.scenario.expected.timeCards) {
        throw new Error(`${run.scenario.label}: expected ${run.scenario.expected.timeCards} own time cards after seeding, found ${own.length}.`);
    }
    return { timeCardCounters: own.map((c) => c.timeCardCounter) };
}

/**
 * Designate the break job as the tenant's paid-break job. `paidBreakJob` is the only place that
 * designation lives, so this is configuration; it is written as late as possible, and the flag is
 * raised first so cleanup restores it even if the PUT itself fails halfway.
 */
export async function designatePaidBreakJob(run: JourneyD10Run, opts: { sessionApi: APIRequestContext }): Promise<void> {
    run.preference.designated = true;
    await allowApiWrites('preference', `D10: designate ${run.jobs.breakJob.name} as the paid-break job`, () =>
        putPreferences(opts.sessionApi, { paidBreakJob: run.jobs.breakJob.id }),
    );
}

/** Non-committing analyze for the crew's day: how many time cards it plans, and any blocking exception codes. */
export async function analyzeCrewDay(
    run: JourneyD10Run,
    opts: { sessionApi: APIRequestContext },
): Promise<{ plannableTotal: number | undefined; blocking: string[] }> {
    const res = await analyzeTransfer(opts.sessionApi, { from: run.day, to: run.day, crewIds: [run.crew.id] });
    if (!res.ok) throw new Error(`POST transfer-to-job-cards/analyze failed with ${res.status}: ${JSON.stringify(res.raw).slice(0, 300)}`);
    return {
        plannableTotal: res.plannableTotal,
        blocking: res.exceptions.filter((e) => /block/i.test(String(e.severity))).map((e) => String(e.code)),
    };
}

export interface PreviewBoundary {
    day: string;
    start: { hour: number; minute: number };
    end: { hour: number; minute: number };
    grossMinutes: number;
    netMinutes: number;
}

/**
 * The split's minute-exact boundaries from the non-committing `job-cards-preview`, in chronological
 * order — independent of how the grid formats a date cell.
 */
export async function readPreviewBoundaries(run: JourneyD10Run, opts: { sessionApi: APIRequestContext }): Promise<PreviewBoundary[]> {
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
 * Read-only GET read-back of what the transfer wrote. Records each card's time and amount fields as
 * annotations only: their unit is unverified and the on-screen Amount column already carries the proof.
 */
export async function readSplit(
    run: JourneyD10Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<{ cards: JobCardRecord[]; timeCards: OfficeTimeCard[] }> {
    const { sessionApi, testInfo } = opts;
    const listed = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    for (const card of listed) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
    const cards = await Promise.all(listed.map((c) => getJobCard(sessionApi, c.jobCardCounter)));
    for (const card of cards) {
        testInfo.annotations.push({
            type: 'job-card-fields',
            description: `job card ${card.jobCardCounter} (job ${String(card.jobCounter)}): netTime=${String(card.netTime)} grossTime=${String(card.grossTime)} amount=${String(card.amount)}`,
        });
    }

    const wanted = new Set((run.ctx.cards ?? []).map((c) => c.timeCardCounter));
    const timeCards = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter((c) => wanted.has(c.timeCardCounter));
    return { cards, timeCards };
}

// ── D3 — Add missing time-in and correct time card ───────────────────────────────────────────

export interface JourneyD3Run {
    scenario: JourneyD3CorrectionCase;
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    crew: EnsuredRecord;
    picker: EnsuredRecord;
    job: EnsuredRecord;
    punchDate: Date;
    day: string;
    /** Stays empty (D3 writes no job card); satisfies TransferRun for openScopedCandidates. */
    jobCardIds: number[];
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}

export interface D3Seed extends SeedResult {
    /** The imported Time In as stored before the correction. */
    timeIn: OfficeTimeCard;
    timeInId: number;
    timeOutId: number;
}

/** Three Setup forms may run on a cold fixture and the relay pull shares one import deadline. */
export function journeyD3TimeoutMs(testInfo: TestInfo): number {
    return Math.max(360_000, journeyBTestTimeoutMs(testInfo) + 240_000);
}

/**
 * Builds D3's fixture rows on screen and runs the before-phase sweep. The job-card sweep is
 * defensive: D3 writes none, but a hand-made transfer would block the time-card delete.
 */
export async function prepareJourneyD3(
    scenario: JourneyD3CorrectionCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<JourneyD3Run> {
    const { sessionApi, testInfo, pages } = opts;
    const F = journeyD3Fixture();
    const substituted = substituteTokens(scenario, {});
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

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

    // runCleanup's 'timeCards' step reads only `employees`.
    const office = { ranch, field, job, crew, employees: new Map([[picker.code, picker]]) } as unknown as OfficeFixture;
    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };
    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);

    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        await runCleanup(substituted.cleanup, api, testInfo, ctx);
        await allowApiWrites('cleanup', 'D3 teardown: crew-scoped day sweep', () =>
            sweepOwnTimeCards(api, { day, crewCounter: crew.id }),
        ).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    await allowApiWrites('cleanup', 'D3 before-phase sweep: crew job cards', () =>
        sweepCrewJobCards(sessionApi, { day, crewCounter: crew.id }),
    );
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', 'D3 before-phase sweep: crew time cards', () =>
        sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id }),
    );

    return { scenario: substituted, ranch, field, crew, picker, job, punchDate, day, jobCardIds: [], cleanup, ctx };
}

/**
 * Pushes a device envelope holding a Time In with no Ranch, Field or Job plus its Time Out, and
 * imports it on screen. `deliverAndVerifyCards` asserts the Time In arrived with null ranch/field/job.
 */
export async function seedBlockingTimeInDay(
    run: JourneyD3Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<D3Seed> {
    const { sessionApi, testInfo, pages } = opts;
    const device = relayConfig();
    const prefix = lineagePrefix(run.scenario.workflow, testInfo.retry);
    const records: DeviceRecord[] = run.scenario.records.map((r) => {
        const [hour, minute] = r.time.split(':').map(Number);
        return {
            node: r.node,
            part: r.part,
            employeeSource: r.employeeSource,
            employeeCode: run.picker.code,
            crewCode: run.crew.code,
            at: punchMoment(hour, minute, run.punchDate),
        };
    });
    const built = buildEnvelope({ deviceAddress: device.from, prefix, at: records[0].at, records });
    const fileName = exportFileName(prefix);
    const envelope = envelopeView(built.xml, built.references, fileName, prefix);
    const [timeInReference, timeOutReference] = envelope.references;

    const send = await allowApiWrites('device', 'D3: PET Pocket envelope with a context-less Time In', () =>
        sendEnvelope({ deviceAddress: device.from }, envelope, device.office, testInfo),
    );
    expect(send.success, `the relay must accept the D3 envelope: ${send.body}`).toBe(true);

    const result = await deliverAndVerifyCards({
        sessionApi,
        pages,
        testInfo,
        xml: envelope.xml,
        crewId: run.crew.id,
        ranchId: run.ranch.id,
        expected: [
            { employeeCode: run.picker.code, employeeId: run.picker.id, reference: timeInReference, fieldId: null, jobId: null, ranchId: null },
            { employeeCode: run.picker.code, employeeId: run.picker.id, reference: timeOutReference },
        ],
        label: run.scenario.label,
        fileName,
        lineagePrefixes: Array.from({ length: testInfo.retry + 1 }, (_, attempt) => lineagePrefix(run.scenario.workflow, attempt)),
        punchDate: run.punchDate,
        cardType: null,
        sweep: false,
    });
    // Recorded before any assertion, so teardown knows the cards even when one fails.
    run.ctx.cards = result.cards;

    const timeIn = result.cards.find((c) => String(c.reference) === timeInReference);
    const timeOut = result.cards.find((c) => String(c.reference) === timeOutReference);
    if (!timeIn || !timeOut) throw new Error(`${run.scenario.label}: the import did not return both own time cards.`);
    return {
        timeCardCounters: [timeIn.timeCardCounter, timeOut.timeCardCounter],
        timeIn,
        timeInId: timeIn.timeCardCounter,
        timeOutId: timeOut.timeCardCounter,
    };
}

/** Each own row's status, recorded as an annotation; the Issues panel is attached before the fix. */
export async function captureOwnRows(
    run: JourneyD3Run,
    opts: { testInfo: TestInfo; pages: PageObjects },
    seed: D3Seed,
    phase: 'before' | 'after',
): Promise<Record<number, string>> {
    const transfer = opts.pages.transferToJobCards;
    const statuses: Record<number, string> = {};
    for (const id of seed.timeCardCounters) statuses[id] = await transfer.rowStatusText(id);
    opts.testInfo.annotations.push({
        type: `own-row-status-${phase}`,
        description: `${run.scenario.label}: Time In ${seed.timeInId}=${statuses[seed.timeInId]}, Time Out ${seed.timeOutId}=${statuses[seed.timeOutId]}`,
    });
    if (phase === 'before') {
        await opts.testInfo.attach('issue-groups-before.json', {
            body: JSON.stringify(await transfer.issueGroupTexts(), null, 2),
            contentType: 'application/json',
        });
    }
    return statuses;
}

/** Read-only: the Time In as stored after the correction, and the crew's job cards on the day. */
export async function readCorrection(
    run: JourneyD3Run,
    opts: { sessionApi: APIRequestContext },
    seed: D3Seed,
): Promise<{ timeIn: OfficeTimeCard; jobCards: JobCardRecord[] }> {
    const timeIn = (await listTimeCards(opts.sessionApi, { from: run.day, to: run.day })).find((c) => c.timeCardCounter === seed.timeInId);
    if (!timeIn) throw new Error(`${run.scenario.label}: time card ${seed.timeInId} is gone from ${run.day}.`);
    const jobCards = (await listJobCards(opts.sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    for (const card of jobCards) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
    return { timeIn, jobCards };
}

export async function remainingOwnTimeCards(run: JourneyD3Run, opts: { sessionApi: APIRequestContext }): Promise<OfficeTimeCard[]> {
    const cards = await listTimeCards(opts.sessionApi, { from: run.day, to: run.day });
    return cards.filter((c) => Number(c.crewCounter) === run.crew.id);
}

// ── D5 — Reverse and redo ────────────────────────────────────────────────────────────────────

/** `jobPaymentType` of a Non-Labor job (WEBPET job payment types: 8 = Non-Labor). */
const NON_LABOR_PAYMENT_TYPE = 8;

export interface JourneyD5Run {
    scenario: JourneyD5ReverseCase;
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    crew: EnsuredRecord;
    picker: EnsuredRecord;
    job: EnsuredRecord;
    punchDate: Date;
    day: string;
    startedAt: Date;
    /** `GET session/me`'s user id — the `authorCounter` a run of this test must carry. */
    sessionUserId: number;
    /** Filled by {@link commitTransfer} and {@link readRedo}; the teardown deletes these by id. */
    jobCardIds: number[];
    cleanup(): Promise<void>;
    readonly ctx: CleanupContext;
}

export interface D5Seed extends SeedResult {
    timeInId: number;
    timeOutId: number;
    timeInReference: string;
    timeOutReference: string;
}

/** Three Setup forms on a cold fixture, two transfers and one reverse. */
export function journeyD5TimeoutMs(_testInfo: TestInfo): number {
    return 420_000;
}

/** `HH:MM` of a scenario time of day. */
export function clock(t: { hour: number; minute: number }): string {
    return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

function isOwnD5JobCard(run: { crew: EnsuredRecord; picker: EnsuredRecord }, c: JobCardRecord): boolean {
    return Number(c.crewCounter) === run.crew.id || Number(c.employeeCounter) === run.picker.id;
}

async function sweepPickerJobCards(request: APIRequestContext, opts: { day: string; crewCounter: number; employeeCounter: number }): Promise<void> {
    const cards = (await listJobCards(request, { from: opts.day, to: opts.day })).filter(
        (c) => Number(c.crewCounter) === opts.crewCounter || Number(c.employeeCounter) === opts.employeeCounter,
    );
    for (const card of cards) await deleteJobCard(request, card.jobCardCounter, card.version);
}

/**
 * Builds D5's fixture rows on screen, gates on the preferences the reverse path depends on, reads the
 * session user (the author a run of this test must carry) and runs the before-phase sweep: job cards
 * first, because a transferred time card cannot be deleted.
 */
export async function prepareJourneyD5(
    scenario: JourneyD5ReverseCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<JourneyD5Run> {
    const { sessionApi, testInfo, pages } = opts;
    const F = journeyD5Fixture();
    const substituted = substituteTokens(scenario, {});
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

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

    // runCleanup's 'timeCards' step reads only `employees`.
    const office = { ranch, field, job, crew, employees: new Map([[picker.code, picker]]) } as unknown as OfficeFixture;
    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };
    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);
    const jobCardIds: number[] = [];

    const finishCleanup = async (api: APIRequestContext = sessionApi): Promise<void> => {
        await allowApiWrites('cleanup', 'D5 teardown: own job cards by id', async () => {
            for (const id of jobCardIds) {
                try {
                    const card = await getJobCard(api, id);
                    await deleteJobCard(api, id, card.version);
                } catch (error) {
                    await testInfo.attach(`cleanup-warning-jobCard-${id}`, {
                        body: error instanceof Error ? error.message : String(error),
                        contentType: 'text/plain',
                    });
                }
            }
        });
        await runCleanup(substituted.cleanup, api, testInfo, ctx);
        await allowApiWrites('cleanup', 'D5 teardown: crew-scoped day sweep', () =>
            sweepOwnTimeCards(api, { day, crewCounter: crew.id }),
        ).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    // Read, never written: a moved gate must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    if (preferences.viewJobCardsAfterTransfer !== true) {
        throw new Error(
            `${substituted.label}: viewJobCardsAfterTransfer is not true on this environment — the reverse path starts from the Job Cards screen the transfer navigates to.`,
        );
    }
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(substituted.dayOffset))) {
        throw new Error(
            `${substituted.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${substituted.dayOffset}.`,
        );
    }
    for (const key of ['mealPenaltyRule', 'paidBreakPenaltyRule']) {
        testInfo.annotations.push({ type: 'preference-evidence', description: `${key}=${String(preferences[key])}` });
    }

    const meRes = await sessionApi.get('session/me');
    if (!meRes.ok()) throw new Error(`GET session/me failed with ${meRes.status()}`);
    const me = (await meRes.json()) as Record<string, unknown>;
    const user = (me.user ?? {}) as Record<string, unknown>;
    const sessionUserId = Number(user.userId ?? me.userCounter ?? me.userId ?? user.userCounter ?? user.id ?? me.id);
    if (!Number.isFinite(sessionUserId)) {
        throw new Error(`${substituted.label}: GET session/me names no user id (keys: ${Object.keys(me).join(', ')}).`);
    }
    const startedAt = new Date();

    await allowApiWrites('cleanup', 'D5 before-phase sweep: own job cards', () =>
        sweepPickerJobCards(sessionApi, { day, crewCounter: crew.id, employeeCounter: picker.id }),
    );
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', 'D5 before-phase sweep: crew time cards', () =>
        sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id }),
    );

    return { scenario: substituted, ranch, field, crew, picker, job, punchDate, day, startedAt, sessionUserId, jobCardIds, cleanup, ctx };
}

/**
 * Creates the day's two time cards on screen — Add Time-In (07:00) and the deliberately wrong Add
 * Time-Out (11:00) — then reads them back and records both before anything is asserted. The picker
 * is the filter: the Time Out carries no Work Crew, so a crew filter would miss it.
 */
export async function seedOnScreenDay(
    run: JourneyD5Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<D5Seed> {
    const { sessionApi, pages } = opts;
    const { timeIn, wrongTimeOut, context, expected } = run.scenario;
    const transfer = pages.transferToJobCards;
    const names = { ranch: run[context.ranch].name, field: run[context.field].name, phase: run[context.phase].name };

    await transfer.goto();
    await transfer.scopeToDay(run.day);
    await transfer.openAddRecord('timeIn');
    await transfer.addTimeIn({ day: run.day, time: clock(timeIn), employee: run.picker.name, crew: run.crew.name, ...names });
    await expect(transfer.recordToast(expected.toasts.timeInCreated), `${run.scenario.label}: the Time In must save`).toBeVisible();

    await transfer.openAddRecord('timeOut');
    await transfer.addTimeOut({ day: run.day, time: clock(wrongTimeOut), employee: run.picker.name });
    await expect(transfer.recordToast(expected.toasts.timeOutCreated), `${run.scenario.label}: the Time Out must save`).toBeVisible();

    let own: OfficeTimeCard[] = [];
    await expect(async () => {
        own = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter((c) => Number(c.employeeCounter) === run.picker.id);
        // Recorded on every poll, so teardown knows the cards even when the count is wrong.
        run.ctx.cards = own;
        expect(own).toHaveLength(expected.timeCards);
    }).toPass({ timeout: 30_000 });

    const timeInCard = own.find((c) => Number(c.cardType) === CARD_TYPE.timeIn);
    const timeOutCard = own.find((c) => Number(c.cardType) === CARD_TYPE.timeOut);
    if (!timeInCard || !timeOutCard) {
        throw new Error(`${run.scenario.label}: expected one Time In and one Time Out for ${run.picker.name} on ${run.day}, found card types ${JSON.stringify(own.map((c) => c.cardType))}.`);
    }
    if (own.some((c) => c.transferred)) throw new Error(`${run.scenario.label}: a freshly created time card already reads transferred.`);
    return {
        timeCardCounters: own.map((c) => c.timeCardCounter),
        timeInId: timeInCard.timeCardCounter,
        timeOutId: timeOutCard.timeCardCounter,
        timeInReference: String(timeInCard.reference),
        timeOutReference: String(timeOutCard.reference),
    };
}

/** The slice of a D5 run the shared transfer helpers read. Crew-scoped, never filtered by crew on screen. */
function ownDayView(run: JourneyD5Run, expectedJobCards: number) {
    return {
        scenario: { label: run.scenario.label, expected: { jobCards: expectedJobCards } },
        crew: run.crew,
        day: run.day,
        jobCardIds: run.jobCardIds,
        ctx: run.ctx,
    };
}

/**
 * Re-load the day on the Transfer screen and guard the roster. Runs WITHOUT a crew filter: the execute
 * re-plans the whole day, so the screen must offer exactly this run's two References and nothing else.
 */
export async function reanalyzeOwnDay(
    run: JourneyD5Run,
    opts: { pages: PageObjects },
    seed: D5Seed,
    expectedJobCards: number,
): Promise<string[]> {
    return openScopedCandidates(ownDayView(run, expectedJobCards), { pages: opts.pages }, seed);
}

/**
 * Analyze, guard, tick the two own rows by Reference and commit. `toastSeen` is armed before the click:
 * the "Transfer complete" toast is gone by the time the poll in commitTransfer returns.
 */
export async function transferOwnDay(
    run: JourneyD5Run,
    opts: { sessionApi: APIRequestContext; pages: PageObjects },
    seed: D5Seed,
    expectedJobCards: number,
): Promise<ExecuteResult & { toastSeen: boolean }> {
    const view = ownDayView(run, expectedJobCards);
    const candidates = await openScopedCandidates(view, { pages: opts.pages }, seed);
    const toast = opts.pages.transferToJobCards
        .transferCompleteToast(expectedJobCards, seed.timeCardCounters.length)
        .waitFor({ state: 'visible', timeout: 150_000 })
        .then(() => true, () => false);
    const result = await commitTransfer(view, opts, seed, candidates);
    return { ...result, toastSeen: await toast };
}

/**
 * Refuses (throws, clicks nothing) unless the run on screen is this test's own. The Job Cards Reverse
 * posts `runs/{transferRun}/reverse` for the URL's id, so that id is checked against the execute job,
 * the audit list and the day's job cards.
 */
export async function guardReversibleRun(
    run: JourneyD5Run,
    opts: { sessionApi: APIRequestContext; pages: PageObjects; testInfo: TestInfo },
    transfer: ExecuteResult,
): Promise<TransferRunRecord> {
    const refuse = (why: string): never => {
        throw new Error(`${run.scenario.label}: refusing to reverse — ${why}`);
    };
    const param = opts.pages.viewJobCards.transferRunParam();
    if (!(param > 0)) refuse(`the Job Cards URL carries no transferRun (${String(param)}).`);
    if (param !== transfer.transferRunCounter) refuse(`the URL's transferRun ${param} is not this test's execute run ${transfer.transferRunCounter}.`);

    const runs = await listTransferRuns(opts.sessionApi);
    const record = runs.find((r) => r.transferRunCounter === param);
    if (!record) return refuse(`run ${param} is not in the transfer-run list.`);
    if (record.status !== 'active') refuse(`run ${param} is ${record.status}, not active.`);
    if (record.authorCounter !== run.sessionUserId) refuse(`run ${param} was written by user ${record.authorCounter}, not session user ${run.sessionUserId}.`);
    const stamp = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(record.runAtUtc) ? record.runAtUtc : `${record.runAtUtc}Z`;
    if (!(Date.parse(stamp) >= run.startedAt.getTime() - 60_000)) refuse(`run ${param} (${record.runAtUtc}) predates this test's start.`);
    if (record.jobCardCount !== 1 || record.timeCardCount !== 2 || record.jobCardsModified !== 0) {
        refuse(`run ${param} reads ${record.jobCardCount} job card(s), ${record.timeCardCount} time card(s), ${record.jobCardsModified} modified — expected 1, 2, 0.`);
    }

    const dayIds = (await listJobCards(opts.sessionApi, { from: run.day, to: run.day })).filter((c) => isOwnD5JobCard(run, c)).map((c) => c.jobCardCounter);
    if (JSON.stringify([...dayIds].sort()) !== JSON.stringify([...transfer.jobCardCounters].sort())) {
        refuse(`the day's own job cards ${JSON.stringify(dayIds)} are not exactly this transfer's ${JSON.stringify(transfer.jobCardCounters)}.`);
    }
    // An annotation, not a refusal: the reverse targets an explicit id, so a newer run by another worker is harmless.
    if (runs[0] && runs[0].transferRunCounter !== param) {
        opts.testInfo.annotations.push({ type: 'newer-transfer-run', description: `run ${runs[0].transferRunCounter} is newer than this test's run ${param}` });
    }
    return record;
}

/**
 * The state after the reverse: the day's own job cards, the seeded time cards and whether the run is
 * still listed as active. Polls up to 30 s for the unwind to settle and returns the last read either
 * way; the caller asserts.
 */
export async function readAfterReverse(
    run: JourneyD5Run,
    opts: { sessionApi: APIRequestContext },
    seed: D5Seed,
    reversed: { runId: number; jobCardIds: number[] },
): Promise<{ timeCards: OfficeTimeCard[]; dayJobCardIds: number[]; runStillActive: boolean }> {
    const wanted = new Set(seed.timeCardCounters);
    const read = async () => ({
        dayJobCardIds: (await listJobCards(opts.sessionApi, { from: run.day, to: run.day })).filter((c) => isOwnD5JobCard(run, c)).map((c) => c.jobCardCounter),
        timeCards: (await listTimeCards(opts.sessionApi, { from: run.day, to: run.day })).filter((c) => wanted.has(c.timeCardCounter)),
        runStillActive: (await listTransferRuns(opts.sessionApi)).some((r) => r.transferRunCounter === reversed.runId && r.status === 'active'),
    });
    const settled = (s: Awaited<ReturnType<typeof read>>) =>
        !s.dayJobCardIds.some((id) => reversed.jobCardIds.includes(id)) && s.timeCards.every((c) => c.transferred === false) && !s.runStillActive;
    const deadline = Date.now() + 30_000;
    let last = await read();
    while (!settled(last) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        last = await read();
    }
    return last;
}

/** Read-only: the seeded time cards as they stand now. */
export async function readSeedTimeCards(run: JourneyD5Run, opts: { sessionApi: APIRequestContext }, seed: D5Seed): Promise<OfficeTimeCard[]> {
    const wanted = new Set(seed.timeCardCounters);
    return (await listTimeCards(opts.sessionApi, { from: run.day, to: run.day })).filter((c) => wanted.has(c.timeCardCounter));
}

/**
 * Every own job card after the re-transfer, split into the work card(s), a tolerated meal-penalty
 * card (non-labor, or "meal penalty" in the job name) and anything else. Ids are recorded into
 * `run.jobCardIds` before the caller asserts.
 */
export async function readRedo(
    run: JourneyD5Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
    seed: D5Seed,
): Promise<{ work: JobCardRecord[]; penalty: JobCardRecord[]; other: JobCardRecord[]; timeCards: OfficeTimeCard[] }> {
    const { sessionApi } = opts;
    const listed = (await listJobCards(sessionApi, { from: run.day, to: run.day })).filter((c) => isOwnD5JobCard(run, c));
    for (const card of listed) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
    const cards = await Promise.all(listed.map((c) => getJobCard(sessionApi, c.jobCardCounter)));

    const isPenalty = (c: JobCardRecord): boolean =>
        Number(c.jobPaymentType) === NON_LABOR_PAYMENT_TYPE || /meal penalty/i.test(String(c.jobName ?? c.job ?? ''));
    const work = cards.filter((c) => Number(c.jobCounter) === run.job.id);
    const rest = cards.filter((c) => !work.includes(c));
    const penalty = rest.filter(isPenalty);
    const other = rest.filter((c) => !isPenalty(c));
    return { work, penalty, other, timeCards: await readSeedTimeCards(run, { sessionApi }, seed) };
}

/** What the picker still has on the fixture day — the Time Out carries no crew, so this is by employee. */
export async function remainingPickerTimeCards(run: JourneyD5Run, opts: { sessionApi: APIRequestContext }): Promise<OfficeTimeCard[]> {
    const cards = await listTimeCards(opts.sessionApi, { from: run.day, to: run.day });
    return cards.filter((c) => Number(c.employeeCounter) === run.picker.id);
}
