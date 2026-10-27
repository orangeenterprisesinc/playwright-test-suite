import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import type { TransferToJobCardsPage } from '@pages/processing/TransferToJobCardsPage';
import { JOURNEY_D_FIXTURE, journeyD3Fixture, journeyD5Fixture, journeyD9Fixture, journeyD10Fixture } from '@data/journey-d/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import type { JourneyD3CorrectionCase, JourneyD5ReverseCase, JourneyD8RecycleCase, JourneyD9DistributionCase, JourneyD10SegmentCase, JourneyDRecalculateCase } from '@data/schemas/journeyDScenario';
import { listBulkDeleteHistory, listDeleted, type BulkHistoryRow } from '@utils/api/recycleBinApi';
import { uniqueName, RUN_TOKEN } from '@utils/cleanup/runToken';
import { listTransferRuns, readExecuteJob, type TransferRunRecord } from '@utils/api/transferToJobCardsApi';
import type { OfficeFixture } from '@utils/api/officeFixture';
import { getJob, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { deleteJobCard, getJobCard, listJobCards, listRecalcRuns, type JobCardRecord, type RecalcRun } from '@utils/api/jobCardsApi';
import { getPreferences, putPreferences } from '@utils/api/preferencesApi';
import { CARD_TYPE, deleteTimeCard, isoDay, listTimeCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { allowApiWrites } from '@utils/api/writeGuard';
import { currentScope, register } from '@utils/cleanup/cleanupScope';
import { runCleanup, type CleanupContext } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';
import { withPreferencesLock } from '@utils/sync/preferencesLock';
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
    /** Every `YYYY-MM-DD` of a multi-day scope, first to last; `day` stays the first. Absent for a one-day run. */
    days?: string[];
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

// Plumbing (d): no screen lists recalc runs, so the baseline is read here and the later runs are reported as evidence.
async function maxRecalcRunCounter(request: APIRequestContext): Promise<number> {
    const runs = await listRecalcRuns(request);
    return runs.reduce((max, run) => Math.max(max, Number(run.recalcRunCounter)), 0);
}

/**
 * Builds the office half of Journey D on screen (ranch, field, crew, two pickers, piece job —
 * existence is a GET, the create and any repair are UI), runs the before-phase recovery sweep
 * (job cards first, then time cards — a crashed previous run must not poison this one), asserts
 * the toolbar gate is already open, and captures the recalc-run baseline.
 */
export async function prepareJourneyD(
    scenario: JourneyDRecalculateCase,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
): Promise<JourneyDRun> {
    const { sessionApi, testInfo, pages } = opts;
    const F = JOURNEY_D_FIXTURE;
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
    const pickerOne = await ensureEmployeeOnScreen({ ...F.pickerOne, homeCrew }, deps);
    const pickerTwo = await ensureEmployeeOnScreen({ ...F.pickerTwo, homeCrew }, deps);
    const job = await ensureJobOnScreen(
        { code: F.job.code, name: F.job.name, paymentType: F.job.paymentType, pieceRate: substituted.rate.before },
        deps,
    );

    // runCleanup reads `employees` (timeCards step) and `job.id` (d6JobPieceRate restore); the rest of
    // OfficeFixture is Journey B's, so this is deliberately partial.
    const office = {
        ranch,
        field,
        job,
        crew,
        employees: new Map([pickerOne, pickerTwo].map((p) => [p.code, p] as const)),
    } as unknown as OfficeFixture;

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [], office };
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
        await allowApiWrites('cleanup', 'D6 teardown: own job cards by id', async () => {
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
        // The declarative timeCards step filters by employee code, so it never sees the crew
        // piece-out (employeeCounter is null on it). Sweep the day by crew to finish the job.
        await allowApiWrites('cleanup', 'D6 teardown: crew-scoped day sweep', () =>
            sweepOwnTimeCards(api, { day: isoDay(punchDay(substituted.dayOffset)), crewCounter: crew.id }),
        ).catch(() => undefined);
    };
    const registration = currentScope(testInfo)?.add(`${substituted.label} cleanup`, finishCleanup);
    const cleanup = async (): Promise<void> => {
        await finishCleanup(sessionApi);
        registration?.complete();
    };

    const preferences = await getPreferences(sessionApi);
    if (preferences.allowRecalculateFromJobCard !== true) {
        throw new Error(
            `${substituted.label}: allowRecalculateFromJobCard is not true on this environment — D6 asserts ` +
                'the toolbar gate is already open rather than flipping a shared preference.',
        );
    }
    // The first result is read where the transfer lands; with the preference off the app opens Input > Job Cards instead.
    if (preferences.viewJobCardsAfterTransfer !== true) {
        throw new Error(
            `${substituted.label}: viewJobCardsAfterTransfer is not true on this environment — D6 reads the transferred ` +
                'cards on the View ▸ Job Cards screen the transfer lands on.',
        );
    }

    const punchDate = punchDay(substituted.dayOffset);
    const day = isoDay(punchDate);

    await allowApiWrites('cleanup', 'D6 before-phase sweep: own job cards', () =>
        sweepOwnJobCards(sessionApi, { day, crewCounter: crew.id, jobCounter: job.id }),
    );
    await runCleanup(substituted.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots: ctx.snapshots });
    await allowApiWrites('cleanup', 'D6 before-phase sweep: crew time cards', () =>
        sweepOwnTimeCards(sessionApi, { day, crewCounter: crew.id }),
    );

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

    await transfer.openFromMenu();
    if (run.days?.length) await transfer.scopeToRange(run.days[0], run.days[run.days.length - 1]);
    else await transfer.scopeToDay(run.day);
    // The Work Crew filter below only narrows the display; Transfer commits what analyze loaded, so scope the analyze itself.
    if (opts.crew) await transfer.scopeToTimeCardCrew(opts.crew);
    const analyzed = await transfer.analyzeCandidates({ expected: seed.timeCardCounters.length });
    if (opts.crew) {
        expect(
            analyzed.crewIds.length,
            'transfer scope: analyze went out unscoped (crewIds []) — a concurrent run\'s time cards would be transferred',
        ).toBeGreaterThan(0);
    }

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

export interface TransferOutcome {
    transferRunCounter: number;
    jobCardCounters: number[];
}

/**
 * Tick each candidate by Reference and commit. The "Transfer complete" toast, armed before the click and
 * asserted last, is the proof of what was written; the GETs below only record ids for cleanup (and read
 * the run id the guards need).
 */
export async function commitTransfer(
    run: TransferRun,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
    _seed: SeedResult,
    candidates: string[],
    toast: { jobCards: number; timeCards: number },
): Promise<TransferOutcome> {
    const { sessionApi, testInfo, pages } = opts;
    const transfer = pages.transferToJobCards;

    for (const reference of candidates) await transfer.selectCandidate(reference);
    const toastSeen = transfer
        .transferCompleteToast(toast.jobCards, toast.timeCards)
        .waitFor({ state: 'visible', timeout: 150_000 })
        .then(() => true, () => false);
    const jobId = await transfer.runTransfer();
    if (!jobId) throw new Error('The Transfer click sent no POST transfer-to-job-cards/execute to the server, so nothing was ever queued.');

    // Plumbing (d): ids are recorded on every poll, before anything is asserted. Recording them afterwards
    // means a wrong outcome leaves cleanup unaware of the cards that WERE written — they survive the run,
    // their source time cards become undeletable, and the next run finds an employee already clocked in.
    testInfo.annotations.push({ type: 'plumbing-read', description: `${run.scenario.label}: job card ids recorded for cleanup, execute job read for the run id` });
    let jobCardCounters: number[] = [];
    await expect(async () => {
        const written: JobCardRecord[] = [];
        for (const day of run.days ?? [run.day]) {
            written.push(...(await listJobCards(sessionApi, { from: day, to: day })).filter((c) => Number(c.crewCounter) === run.crew.id));
        }
        for (const card of written) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
        jobCardCounters = written.map((c) => c.jobCardCounter);
        if (written.length < run.scenario.expected.jobCards) {
            // A failed async execute writes nothing and is otherwise indistinguishable from a slow one.
            const job = await readExecuteJob(sessionApi, jobId);
            if (!/^(complete|running|pending|queued|)$/i.test(job.status)) {
                throw new Error(`transfer execute job ${jobId} ended ${job.status}: ${job.error ?? JSON.stringify(job.raw)}`);
            }
            // A "complete" run can still have refused days (a duplicate Reference, 2026-10-26); name them.
            const days = ((job.raw as { days?: Array<{ date?: string; error?: string }> } | undefined)?.days ?? []).filter((d) => d.error);
            const refused = days.length ? ` — the execute refused ${days.length} day(s): ${days.map((d) => `${String(d.date).slice(0, 10)}: ${d.error}`).join(' | ')}` : '';
            throw new Error(`${written.length} of ${run.scenario.expected.jobCards} job card(s) written so far${refused}`);
        }
    }).toPass({ timeout: 120_000 });
    expect(
        await toastSeen,
        `${run.scenario.label}: the 'Transfer complete — ${toast.jobCards} job card(s) written, ${toast.timeCards} time cards transferred.' toast must be seen`,
    ).toBe(true);

    // The execute job is the only place the run id is reported; D5 needs it to guard the reverse.
    const finished = await readExecuteJob(sessionApi, jobId).catch(() => undefined);
    return { transferRunCounter: finished?.transferRunCounter ?? 0, jobCardCounters };
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
): Promise<TransferOutcome> {
    const candidates = await openScopedCandidates(run, { pages: opts.pages, crew: opts.crew }, seed);
    const toast = { jobCards: run.scenario.expected.jobCards, timeCards: seed.timeCardCounters.length };
    return commitTransfer(run, { sessionApi: opts.sessionApi, testInfo: opts.testInfo, pages: opts.pages }, seed, candidates, toast);
}


/**
 * Plumbing (d): no screen lists recalc runs, so every run newer than the baseline taken in
 * {@link prepareJourneyD} is returned for the spec to report as `recalc-run-evidence`, never asserted.
 */
export async function assertRecalcRuns(run: JourneyDRun, opts: { sessionApi: APIRequestContext }): Promise<RecalcRun[]> {
    const runs = await listRecalcRuns(opts.sessionApi);
    return runs.filter((r) => Number(r.recalcRunCounter) > run.recalcBaseline);
}

// getJob is re-exported so a later Journey D spec can read the fixture job without reaching past
// this flow layer (the ESLint import ban keeps @utils/api/* out of specs).
export { getJob };

// ── Shared screen-side helpers (D5/D6/D9/D10, re-exported by journeyEFlow) ───────────────────

/** The Transfer status keyword of a clean row. */
export const READY_STATUS = 'Ready';
/** The View ▸ Job Cards Exported cell of a card nobody has exported. */
export const FRESH_EXPORTED_CELL = 'No';

/** A 12-hour or 24-hour time cell ("3:00 PM" or "15:00") for a scenario time of day. */
export function clockCell(t: { hour: number; minute: number }): RegExp {
    const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12;
    const mm = String(t.minute).padStart(2, '0');
    return new RegExp(`^(0?${h12}:${mm}(:00)?\\s*${t.hour >= 12 ? 'PM' : 'AM'}|${String(t.hour).padStart(2, '0')}:${mm}(:00)?)$`, 'i');
}

/** View ▸ Job Cards for one day: menu, calendar, Apply. Rows are then read with the page's own readers. */
export async function openViewJobCardsForDay(pages: PageObjects, day: string): Promise<void> {
    const view = pages.viewJobCards;
    await view.openFromMenu();
    await view.scopeToDay(day);
    await view.applyFilter();
}

/** A View ▸ Job Cards row by Reference (the row's aria-label). */
export function viewJobCardRow(pages: PageObjects, reference: string): Locator {
    return pages.viewJobCards.grid.getByRole('row', { name: reference, exact: true });
}

/**
 * Plumbing (d): the ids of this run's job cards, recorded before anything is asserted so cleanup deletes
 * them whatever fails next. Never an assertion. Pass `isOwn` when the cards are not the crew's alone (D5).
 */
export async function recordOwnJobCardIds(
    run: { day: string; crew: EnsuredRecord; jobCardIds: number[] },
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
    isOwn: (card: JobCardRecord) => boolean = (card) => Number(card.crewCounter) === run.crew.id,
): Promise<number[]> {
    opts.testInfo.annotations.push({ type: 'plumbing-read', description: 'own job card ids recorded for cleanup' });
    const own = (await listJobCards(opts.sessionApi, { from: run.day, to: run.day })).filter(isOwn);
    for (const card of own) if (!run.jobCardIds.includes(card.jobCardCounter)) run.jobCardIds.push(card.jobCardCounter);
    return own.map((card) => card.jobCardCounter);
}

/**
 * View ▸ Time Cards with "Include transferred records" on: every Reference's Transferred cell reads
 * `expected`. The untransferred text was not measured ("No" or an empty cell), so 'No' accepts either and
 * the first run calibrates it.
 */
export async function assertTransferredOnScreen(
    pages: PageObjects,
    day: string,
    references: string[],
    expected: 'Yes' | 'No',
    label: string,
): Promise<void> {
    const view = pages.viewTimeCards;
    await view.openFromMenu();
    await view.scopeToDay(day);
    await view.setIncludeTransferred(true);
    await view.applyFilter();
    for (const reference of references) {
        const row = await view.rowByReference(reference);
        await expect
            .poll(() => view.readCell(row, 'Transferred'), {
                message: `${label}: ${reference} must read Transferred "${expected}" on View ▸ Time Cards`,
                timeout: 30_000,
            })
            .toMatch(expected === 'Yes' ? /^Yes$/ : /^(No)?$/);
    }
}

export interface PreviewClock {
    job: string;
    /** `HH:MM`, 24 h. */
    start: string;
    end: string;
    grossMinutes: number;
    netMinutes: number;
}

type PreviewSegments = Awaited<ReturnType<PageObjects['transferToJobCards']['previewSegments']>>;

/**
 * The Job Cards preview's segments as clock times and minutes, in chronological order. The Gross and Net
 * Time cells are decimal hours (minutes = hours x 60); an HH:MM cell throws by name.
 */
export function previewClock(segments: PreviewSegments): PreviewClock[] {
    const hhmm = (cell: string, what: string): string => {
        const match = /(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?/i.exec(cell);
        if (!match) throw new Error(`Job Cards preview '${what}' reads "${cell}", which carries no clock time`);
        const hour = match[3] ? (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0) : Number(match[1]);
        return `${String(hour).padStart(2, '0')}:${match[2]}`;
    };
    const minutes = (cell: string, what: string): number => {
        const hours = Number(cell.replace(/,/g, '').trim());
        if (!Number.isFinite(hours)) throw new Error(`Job Cards preview '${what}' reads "${cell}", which is not decimal hours`);
        return Math.round(hours * 60);
    };
    return segments
        .map((s) => ({
            job: s.job,
            start: hhmm(s.timeIn, 'Date Time In'),
            end: hhmm(s.timeOut, 'Date Time Out'),
            grossMinutes: minutes(s.grossTime, 'Gross Time'),
            netMinutes: minutes(s.netTime, 'Net Time'),
        }))
        .sort((a, b) => a.start.localeCompare(b.start));
}

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
                await allowApiWrites('cleanup', 'D10 teardown: clear paidBreakJob', () => putPreferences(api, { paidBreakJob: 0 }));
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
 * Designate the break job as the tenant's paid-break job on Preferences ▸ Job ▸ Job Assignments. It
 * is set as late as possible, and the flag is raised first so cleanup restores it even if the save
 * fails halfway. The select has no "None" option, so the restore stays an API cleanup.
 */
export async function designatePaidBreakJob(
    run: JourneyD10Run,
    opts: { sessionApi: APIRequestContext; pages: PageObjects },
): Promise<void> {
    const { sessionApi, pages } = opts;
    const breakJob = run.jobs.breakJob;
    run.preference.designated = true;
    await withPreferencesLock(async () => {
        const prefs = pages.preferences;
        await prefs.gotoPreferences();
        await prefs.gotoSection('Job');
        if ((await prefs.displayedValue('paidBreakJob').catch(() => '')) !== breakJob.name) {
            await prefs.choose('paidBreakJob', breakJob.name);
            await prefs.saveIfDirty();
        }
        const stored = await getPreferences(sessionApi);
        expect(
            Number(stored.paidBreakJob),
            `${run.scenario.label}: Preferences ▸ Job ▸ Paid Break Job must store ${breakJob.name} (id ${breakJob.id})`,
        ).toBe(breakJob.id);
    });
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
 * imports it on screen. That the Time In arrived with none of them is asserted by the spec on the Transfer grid.
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
            { employeeCode: run.picker.code, reference: timeInReference, typeText: 'Time In', officeIds: { employeeId: run.picker.id } },
            { employeeCode: run.picker.code, reference: timeOutReference, typeText: 'Time Out', officeIds: { employeeId: run.picker.id } },
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

export type TimeInPanelView = Awaited<ReturnType<TransferToJobCardsPage['readTimeInPanel']>>;

/** The Time In as the Transfer panel shows it after the correction (left through Cancel), and its row's Transferred cell. */
export async function readCorrectionOnScreen(pages: PageObjects, seed: D3Seed): Promise<{ panel: TimeInPanelView; transferred: string }> {
    const transfer = pages.transferToJobCards;
    await transfer.openRow(seed.timeInId);
    const panel = await transfer.readTimeInPanel();
    await transfer.cancelPanel();
    return { panel, transferred: await transfer.rowTransferred(String(seed.timeIn.reference)) };
}

// Cleanup verification, not a workflow outcome: confirms the teardown left nothing on the crew's fixture day.
export async function remainingOwnTimeCards(run: JourneyD3Run, opts: { sessionApi: APIRequestContext }): Promise<OfficeTimeCard[]> {
    const cards = await listTimeCards(opts.sessionApi, { from: run.day, to: run.day });
    return cards.filter((c) => Number(c.crewCounter) === run.crew.id);
}

// ── D5 — Reverse and redo ────────────────────────────────────────────────────────────────────

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
    /** Filled by {@link commitTransfer} and {@link recordOwnJobCardIds}; the teardown deletes these by id. */
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

export function isOwnD5JobCard(run: { crew: EnsuredRecord; picker: EnsuredRecord }, c: JobCardRecord): boolean {
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

    await transfer.openFromMenu();
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

/** The slice of a run `guardReversibleRun` reads: D5's run and Journey E's own-jobs run both satisfy it. */
export interface ReversibleRun {
    scenario: { label: string };
    crew: EnsuredRecord;
    picker: EnsuredRecord;
    day: string;
    startedAt: Date;
    sessionUserId: number;
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

/** Analyze, guard, tick the two own rows by Reference and commit; commitTransfer asserts the toast. */
export async function transferOwnDay(
    run: JourneyD5Run,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo; pages: PageObjects },
    seed: D5Seed,
    expectedJobCards: number,
): Promise<TransferOutcome> {
    const view = ownDayView(run, expectedJobCards);
    const candidates = await openScopedCandidates(view, { pages: opts.pages }, seed);
    return commitTransfer(view, opts, seed, candidates, { jobCards: expectedJobCards, timeCards: seed.timeCardCounters.length });
}

/**
 * Refuses (throws, clicks nothing) unless the run on screen is this test's own. The Job Cards Reverse
 * posts `runs/{transferRun}/reverse` for the URL's id, so that id is checked against the execute job,
 * the audit list and the day's job cards.
 */
export async function guardReversibleRun(
    run: ReversibleRun,
    opts: { sessionApi: APIRequestContext; pages: PageObjects; testInfo: TestInfo },
    transfer: TransferOutcome,
    expected: { jobCards: number; timeCards: number } = { jobCards: 1, timeCards: 2 },
): Promise<TransferRunRecord> {
    // Plumbing (d): refuses to reverse a run that is not this test's own; the reverse itself stays on screen.
    opts.testInfo.annotations.push({ type: 'plumbing-read', description: `${run.scenario.label}: transfer-run list read to refuse a foreign run` });
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
    if (record.jobCardCount !== expected.jobCards || record.timeCardCount !== expected.timeCards || record.jobCardsModified !== 0) {
        refuse(
            `run ${param} reads ${record.jobCardCount} job card(s), ${record.timeCardCount} time card(s), ${record.jobCardsModified} modified — expected ${expected.jobCards}, ${expected.timeCards}, 0.`,
        );
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

/** Plumbing (d): cleanup verification — what the picker still has on the fixture day (the Time Out carries no crew, so this is by employee). */
export async function remainingPickerTimeCards(run: JourneyD5Run, opts: { sessionApi: APIRequestContext }): Promise<OfficeTimeCard[]> {
    const cards = await listTimeCards(opts.sessionApi, { from: run.day, to: run.day });
    return cards.filter((c) => Number(c.employeeCounter) === run.picker.id);
}

// ── D8 — Delete to recycle and restore ───────────────────────────────────────────────────────
// No fixture day: four run-unique crops are created, deleted and restored on screen. Every call
// here is a read except the teardown, which soft-deletes whichever own crop is still live. The
// recycle bin is never emptied and no history row is ever undone from here.

export interface BulkDeleteBatch {
    id: number;
    createdOn: string;
    recordCount: number;
    authorName: string;
    undoneOn: string | null;
    undoable: boolean;
    /** The Performed cell text the Reverse Multi Delete screen shows for `createdOn`. */
    performedText: string;
}

export interface JourneyD8Run {
    scenario: JourneyD8RecycleCase;
    /** A is deleted from its form; B, C and D are the multi-deleted batch. */
    names: [string, string, string, string];
    /** `<prefix>_<RUN_TOKEN>_`: unique to this run, used to filter the Crop list. */
    stem: string;
    ids: Map<string, number>;
    cleanup(): Promise<void>;
}

export function prepareJourneyD8(scenario: JourneyD8RecycleCase, opts: { testInfo: TestInfo }): JourneyD8Run {
    const { testInfo } = opts;
    const { prefix } = scenario.crops;
    const names: [string, string, string, string] = [uniqueName(prefix), uniqueName(prefix), uniqueName(prefix), uniqueName(prefix)];
    const stem = `${prefix}_${RUN_TOKEN}_`;
    const substituted = substituteTokens(scenario, { cropA: names[0], cropB: names[1], cropC: names[2], cropD: names[3] });
    for (const annotation of substituted.annotations) testInfo.annotations.push(annotation);

    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>() };
    // The scope drains this on teardown even after a timeout; deleteByName is a no-op for a crop already in the bin.
    const cleanup = register(testInfo, `${substituted.label} cleanup`, (api) => runCleanup(substituted.cleanup, api, testInfo, ctx));
    return { scenario: substituted, names, stem, ids: new Map<string, number>(), cleanup };
}

/** Recorded straight after the save, before any assertion, so cleanup and the reads know the id. */
export function recordCropId(run: JourneyD8Run, name: string, id: number): void {
    run.ids.set(name, id);
}

export function cropIdOf(run: JourneyD8Run, name: string): number {
    const id = run.ids.get(name);
    if (id === undefined) throw new Error(`${run.scenario.label}: no id was recorded for crop '${name}'`);
    return id;
}

/** Plumbing (d): scroll hint only. Position in `GET crops/deleted`, which is also the Deleted Crops grid's row order. */
export async function deletedCropIndex(opts: { sessionApi: APIRequestContext }, id: number): Promise<number> {
    const index = (await listDeleted(opts.sessionApi, 'crops')).findIndex((r) => Number(r.cropCounter) === id);
    if (index < 0) throw new Error(`crop ${String(id)} is not in GET crops/deleted`);
    return index;
}

/** Highest bulk-delete history id before this run deletes anything. */
export async function bulkDeleteHead(opts: { sessionApi: APIRequestContext }): Promise<number> {
    const rows = await listBulkDeleteHistory(opts.sessionApi);
    return rows.reduce((max, r) => Math.max(max, r.id), 0);
}

/** `createdOn` is naive; the browser shows it verbatim as `M/D/YYYY, h:mm:ss AM|PM`. */
export function performedText(createdOn: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(createdOn);
    if (!m) throw new Error(`bulk-update-history createdOn is not a naive timestamp: ${JSON.stringify(createdOn)}`);
    const [, year, month, day, hh, mm, ss] = m;
    const hour = Number(hh);
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${Number(month)}/${Number(day)}/${year}, ${hour12}:${mm}:${ss} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function toBatch(row: BulkHistoryRow): BulkDeleteBatch {
    return {
        id: row.id,
        createdOn: row.createdOn,
        recordCount: row.recordCount,
        authorName: row.authorName,
        undoneOn: row.undoneOn,
        undoable: row.undoable,
        performedText: performedText(row.createdOn),
    };
}

/**
 * The one Crop batch created since `sinceId`. Refuses (throws) on zero after 15 s, on more than
 * one, or on a row that is not this run's: the id it returns is the only one ever undone.
 */
export async function findOwnBatch(run: JourneyD8Run, opts: { sessionApi: APIRequestContext }, sinceId: number): Promise<BulkDeleteBatch> {
    const { expected } = run.scenario;
    const deadline = Date.now() + 15_000;
    for (;;) {
        const fresh = (await listBulkDeleteHistory(opts.sessionApi)).filter((r) => r.id > sinceId && r.tableName === expected.recordType);
        if (fresh.length > 1) {
            throw new Error(`${run.scenario.label}: refusing to pick a batch — ${fresh.length} new ${expected.recordType} history rows since ${sinceId}: ${JSON.stringify(fresh.map((r) => r.id))}`);
        }
        if (fresh.length === 1) {
            const row = fresh[0];
            if (row.recordCount !== expected.batchSize || row.authorName !== expected.performedBy || row.undoneOn !== null || !row.undoable) {
                throw new Error(`${run.scenario.label}: refusing to pick a batch — row ${row.id} is not this run's: ${JSON.stringify(row)}`);
            }
            return toBatch(row);
        }
        if (Date.now() > deadline) {
            throw new Error(`${run.scenario.label}: no new ${expected.recordType} bulk-delete history row appeared after ${sinceId}.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
}
