import { expect } from '@playwright/test';
import type { APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { createPageObjects, type PageObjects } from '@fixtures/pages.fixture';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import { CF_FIXTURE, cfCrew } from '@data/client-feedback/fixture';
import type { CfCrewKey } from '@data/schemas/clientFeedbackFixture';
import type { CfSeedSpec } from '@data/schemas/clientFeedbackScenario';
import { punchDay } from '@data/journey-b/fixture';
import { deleteJobCard, getJobCard, listJobCards } from '@utils/api/jobCardsApi';
import { getPreferences } from '@utils/api/preferencesApi';
import { cleanupExportRuns, healExportResidue } from '@utils/api/exportToAccountingApi';
import type { EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { CARD_TYPE, deleteTimeCard, isoDay, listTimeCards, sweepFixtureCards, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { allowApiWrites } from '@utils/api/writeGuard';
import { register } from '@utils/cleanup/cleanupScope';
import { ownerForTicket, readableName } from '@utils/cleanup/runToken';
import type { CleanupContext } from '@utils/cleanup/runCleanup';
import {
    ensureCrewOnScreen,
    ensureEmployeeOnScreen,
    ensureFieldOnScreen,
    ensureJobOnScreen,
    ensureRanchOnScreen,
} from '@utils/fixtureRows/ensureOnScreen';
import { commitTransfer, guardReversibleRun, openScopedCandidates, type SeedResult, type TransferOutcome } from '@utils/journeys/journeyDFlow';
import { exportCrewDay as exportE, reverseOwnExport } from '@utils/journeys/journeyEFlow';

export interface CfDeps {
    sessionApi: APIRequestContext;
    testInfo: TestInfo;
    pages: PageObjects;
}

export interface CfRun {
    label: string;
    crew: EnsuredRecord;
    employees: EnsuredRecord[];
    /** employees[0]: the export screens expect every row's employee to contain this name. */
    picker: EnsuredRecord;
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    jobs: { hourly: EnsuredRecord; piece: EnsuredRecord };
    /** `YYYY-MM-DD` of the fixture day. */
    day: string;
    startedAt: Date;
    timeCardIds: number[];
    jobCardIds: number[];
    exportRunIds: number[];
    ctx: CleanupContext;
    cleanup(): Promise<void>;
}

interface CfScenario {
    ticket: string;
    fixtureCrew: CfCrewKey;
    dayOffset: number;
}

const WHICH = { one: 0, two: 1 } as const;

/** Only the one crew the scenario owns is ensured; the crew first, because the New Employee form's Crew combobox arrives pre-filled with another crew. */
export async function ensureCfFixtures(deps: CfDeps, crewKey: CfCrewKey) {
    const ensureDeps = { api: deps.sessionApi, pages: deps.pages, testInfo: deps.testInfo };
    const ranch = await ensureRanchOnScreen(CF_FIXTURE.ranch, ensureDeps);
    const field = await ensureFieldOnScreen({ ...CF_FIXTURE.field, ranch: { id: ranch.id, name: ranch.name } }, ensureDeps);
    const block = cfCrew(crewKey);
    const crew = await ensureCrewOnScreen(block.crew, ensureDeps);
    const homeCrew = { id: crew.id, name: crew.name };
    const one = await ensureEmployeeOnScreen({ ...block.employees.one, homeCrew }, ensureDeps);
    const two = await ensureEmployeeOnScreen({ ...block.employees.two, homeCrew }, ensureDeps);
    const hourly = await ensureJobOnScreen(CF_FIXTURE.jobs.hourly, ensureDeps);
    const piece = await ensureJobOnScreen(CF_FIXTURE.jobs.piece, ensureDeps);
    return { ranch, field, crew, employees: [one, two], jobs: { hourly, piece } };
}

const sweepScope = (run: CfRun) => ({ employeeIds: run.employees.map((e) => e.id), day: run.day, crewIds: [run.crew.id] });

async function deleteCrewJobCards(api: APIRequestContext, run: CfRun): Promise<void> {
    const cards = (await listJobCards(api, { from: run.day, to: run.day })).filter((c) => Number(c.crewCounter) === run.crew.id);
    for (const card of cards) await deleteJobCard(api, card.jobCardCounter, card.version);
}

/** Export runs first (they lock the job cards), then job cards, then time cards, all by id; the crew-day sweep catches what ids missed. */
function registerCfCleanup(run: CfRun, deps: CfDeps): () => Promise<void> {
    const { testInfo } = deps;
    const warn = (name: string, error: unknown) =>
        testInfo.attach(name, { body: error instanceof Error ? error.message : String(error), contentType: 'text/plain' });
    return register(testInfo, `${run.label} cleanup`, async (api) => {
        await cleanupExportRuns(api, run.exportRunIds, warn);
        await allowApiWrites('cleanup', `${run.label} teardown: own job cards by id`, async () => {
            for (const id of run.jobCardIds) {
                try {
                    const card = await getJobCard(api, id);
                    await deleteJobCard(api, id, card.version);
                } catch (error) {
                    await warn(`cleanup-warning-jobCard-${id}`, error);
                }
            }
        });
        await allowApiWrites('cleanup', `${run.label} teardown: own time cards by id`, async () => {
            for (const id of run.timeCardIds) {
                try {
                    await deleteTimeCard(api, id);
                } catch (error) {
                    await warn(`cleanup-warning-timeCard-${id}`, error);
                }
            }
        });
        await allowApiWrites('cleanup', `${run.label} teardown: crew-day sweep`, () => sweepFixtureCards(api, sweepScope(run))).catch(() => undefined);
    });
}

/** Fixture rows on screen, the 21-day gate, teardown registered, then the before-phase sweep of the crew's day. */
export async function prepareCfRun(scenario: CfScenario, deps: CfDeps): Promise<CfRun> {
    const { sessionApi } = deps;
    const f = await ensureCfFixtures(deps, scenario.fixtureCrew);
    const day = isoDay(punchDay(scenario.dayOffset));
    const run: CfRun = {
        label: scenario.ticket,
        crew: f.crew,
        employees: f.employees,
        picker: f.employees[0],
        ranch: f.ranch,
        field: f.field,
        jobs: f.jobs,
        day,
        startedAt: new Date(),
        timeCardIds: [],
        jobCardIds: [],
        exportRunIds: [],
        ctx: { phase: 'after', cards: [] },
        cleanup: async () => undefined,
    };

    // Read, never written: a moved window must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(scenario.dayOffset))) {
        throw new Error(`${run.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${scenario.dayOffset}.`);
    }

    run.cleanup = registerCfCleanup(run, deps);

    // Export residue first, then job cards (a transferred time card cannot be deleted), then time cards.
    await healExportResidue(sessionApi, { crewId: run.crew.id, day, label: run.label });
    await allowApiWrites('cleanup', `${run.label} before-phase: crew job cards and time cards`, async () => {
        await deleteCrewJobCards(sessionApi, run);
        await sweepFixtureCards(sessionApi, sweepScope(run));
    });
    return run;
}

/** Time In (and optionally crew Piece Out and Time Out) on screen; own card ids are recorded on every poll, before anything is asserted. */
export async function seedCrewDay(run: CfRun, deps: CfDeps, seed: CfSeedSpec): Promise<SeedResult> {
    const { sessionApi, pages } = deps;
    const names = seed.employees.map((k) => run.employees[WHICH[k]].name);
    const job = run.jobs[seed.job].name;
    const where = { day: run.day, crew: run.crew.name, ranch: run.ranch.name, field: run.field.name, job };

    const recordOwn = async (): Promise<OfficeTimeCard[]> => {
        const ids = run.employees.map((e) => e.id);
        const own = (await listTimeCards(sessionApi, { from: run.day, to: run.day })).filter(
            (c) => Number(c.crewCounter) === run.crew.id || ids.includes(Number(c.employeeCounter)),
        );
        run.ctx.cards = own;
        for (const card of own) if (!run.timeCardIds.includes(card.timeCardCounter)) run.timeCardIds.push(card.timeCardCounter);
        return own;
    };

    await pages.crewTimeIn.punchIn({ ...where, ...seed.timeIn, employees: names });
    if (seed.pieceOut) await pages.crewPieceOut.pieceOut({ ...where, ...seed.pieceOut.at, pieces: seed.pieceOut.pieces });

    // The time-out form only offers employees with an open time-in, so wait until it is readable.
    await expect(async () => {
        const own = await recordOwn();
        expect(own.filter((c) => Number(c.cardType) === CARD_TYPE.timeIn)).toHaveLength(names.length);
    }).toPass({ timeout: 60_000 });

    if (seed.timeOut) await pages.crewTimeOut.punchOut({ day: run.day, crew: run.crew.name, employees: names, ...seed.timeOut });

    const expectedCards = names.length * (seed.timeOut ? 2 : 1) + (seed.pieceOut ? 1 : 0);
    await expect(async () => {
        expect(await recordOwn()).toHaveLength(expectedCards);
    }).toPass({ timeout: 60_000 });
    return { timeCardCounters: run.timeCardIds.slice() };
}

/** The slice of a run the shared transfer helpers read; jobCardIds is the run's own array, so recorded ids reach teardown. */
function transferView(run: CfRun, jobCards: number) {
    return { scenario: { label: run.label, expected: { jobCards } }, crew: run.crew, day: run.day, jobCardIds: run.jobCardIds, ctx: run.ctx };
}

export async function transferCrewDay(run: CfRun, deps: CfDeps, seed: SeedResult, jobCards: number): Promise<TransferOutcome> {
    const view = transferView(run, jobCards);
    const candidates = await openScopedCandidates(view, { pages: deps.pages, crew: run.crew.name }, seed);
    return commitTransfer(view, deps, seed, candidates, { jobCards, timeCards: seed.timeCardCounters.length });
}

/** Refuses unless the run on screen is this test's own, then reverses it on View > Job Cards and returns the reverse's run id. */
export async function reverseCrewDay(run: CfRun, deps: CfDeps, transfer: TransferOutcome, expected: { jobCards: number; timeCards: number }): Promise<number> {
    const { sessionApi, pages } = deps;
    const meRes = await sessionApi.get('session/me');
    if (!meRes.ok()) throw new Error(`GET session/me failed with ${meRes.status()}`);
    const me = (await meRes.json()) as Record<string, unknown>;
    const user = (me.user ?? {}) as Record<string, unknown>;
    const sessionUserId = Number(user.userId ?? me.userCounter ?? me.userId ?? user.userCounter ?? user.id ?? me.id);
    if (!Number.isFinite(sessionUserId)) {
        throw new Error(`${run.label}: GET session/me names no user id (keys: ${Object.keys(me).join(', ')}).`);
    }

    await guardReversibleRun(
        { scenario: { label: run.label }, crew: run.crew, picker: run.picker, day: run.day, startedAt: run.startedAt, sessionUserId },
        deps,
        transfer,
        expected,
    );
    await pages.viewJobCards.openReverse();
    const reversedRunId = await pages.viewJobCards.confirmReverse();
    for (const id of transfer.jobCardCounters) {
        const at = run.jobCardIds.indexOf(id);
        if (at >= 0) run.jobCardIds.splice(at, 1);
    }
    return reversedRunId;
}

/** Seed one employee for export tickets: openCrewExport expects every row's employee to contain `picker.name`. */
export async function exportCrewDay(run: CfRun, deps: CfDeps, scenario: Parameters<typeof exportE>[2], pass: 'first' | 'second') {
    return exportE(run, deps, scenario, pass);
}

export async function reverseCrewExport(run: CfRun, deps: CfDeps, scenario: Parameters<typeof reverseOwnExport>[2], runId: number): Promise<void> {
    return reverseOwnExport(run, deps, scenario, runId);
}

export function mintName(ticket: string, noun: string): string {
    return readableName(ownerForTicket(ticket), noun);
}

/** A second browser context logged in as the non-SU user; unset credentials fail by name, never skip. */
export async function loginAsNonSu(browser: Browser): Promise<{ page: Page; pages: PageObjects; close: () => Promise<void> }> {
    const user = getConfigValue(ConfigProperties.CF_NONSU_USER);
    const password = getConfigValue(ConfigProperties.CF_NONSU_PASSWORD);
    if (!user || !password) throw new Error('environment-gate: CF_NONSU_USER / CF_NONSU_PASSWORD are not set; this ticket needs the non-SU login.');
    const context = await browser.newContext({ baseURL: getConfigValue(ConfigProperties.APP_URL), storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const pages = createPageObjects(page);
    await pages.login.gotoPetTiger();
    await pages.login.loginPetTiger(user, password);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
    return { page, pages, close: () => context.close() };
}
