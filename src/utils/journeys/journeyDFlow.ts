import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { JOURNEY_D_FIXTURE, journeyD9Fixture, journeyD10Fixture } from '@data/journey-d/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import type { JourneyD9DistributionCase, JourneyD10SegmentCase, JourneyDRecalculateCase } from '@data/schemas/journeyDScenario';
import { analyzeTransfer, previewJobCards, type ExecuteResult } from '@utils/api/transferToJobCardsApi';
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
