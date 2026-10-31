import { expect } from '@playwright/test';
import type { APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';
import { createPageObjects, type PageObjects } from '@fixtures/pages.fixture';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import { CF_FIXTURE, cfCrew } from '@data/client-feedback/fixture';
import type { CfCrewKey } from '@data/schemas/clientFeedbackFixture';
import type { CfSeedInput } from '@data/schemas/clientFeedbackScenario';
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
    /** Further crew-days the scenario owns (extraCrews), in JSON order. */
    extra: CfCrewDay[];
    /** Cumulative over every seed step, so each poll waits for the running total. */
    seeded: { timeIns: number; cards: number };
    cleanup(): Promise<void>;
}

export interface CfCrewDay {
    crew: EnsuredRecord;
    employees: EnsuredRecord[];
    day: string;
}

interface CfScenario {
    ticket: string;
    fixtureCrew: CfCrewKey;
    dayOffset: number;
    extraCrews?: Array<{ fixtureCrew: CfCrewKey; dayOffset: number }>;
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

const crewDays = (run: CfRun): CfCrewDay[] => [{ crew: run.crew, employees: run.employees, day: run.day }, ...run.extra];
const sweepScope = (cd: CfCrewDay) => ({ employeeIds: cd.employees.map((e) => e.id), day: cd.day, crewIds: [cd.crew.id] });

async function deleteCrewJobCards(api: APIRequestContext, cd: CfCrewDay): Promise<void> {
    const cards = (await listJobCards(api, { from: cd.day, to: cd.day })).filter((c) => Number(c.crewCounter) === cd.crew.id);
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
        for (const cd of crewDays(run)) {
            await allowApiWrites('cleanup', `${run.label} teardown: ${cd.crew.name} day sweep`, () => sweepFixtureCards(api, sweepScope(cd))).catch(() => undefined);
        }
    });
}

/** Fixture rows on screen, the 21-day gate, teardown registered, then the before-phase sweep of the crew's day. */
export async function prepareCfRun(scenario: CfScenario, deps: CfDeps): Promise<CfRun> {
    const { sessionApi } = deps;
    const f = await ensureCfFixtures(deps, scenario.fixtureCrew);
    const day = isoDay(punchDay(scenario.dayOffset));
    const extra: CfCrewDay[] = [];
    for (const x of scenario.extraCrews ?? []) {
        const fx = await ensureCfFixtures(deps, x.fixtureCrew);
        extra.push({ crew: fx.crew, employees: fx.employees, day: isoDay(punchDay(x.dayOffset)) });
    }
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
        extra,
        seeded: { timeIns: 0, cards: 0 },
        cleanup: async () => undefined,
    };

    // Read, never written: a moved window must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    const deepest = Math.max(...[scenario.dayOffset, ...(scenario.extraCrews ?? []).map((x) => x.dayOffset)].map(Math.abs));
    if (!(Number(preferences.maximumDaysForTransferExport) >= deepest)) {
        throw new Error(`${run.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day offset -${deepest}.`);
    }

    run.cleanup = registerCfCleanup(run, deps);

    // Export residue first, then job cards (a transferred time card cannot be deleted), then time cards.
    for (const cd of crewDays(run)) {
        await healExportResidue(sessionApi, { crewId: cd.crew.id, day: cd.day, label: run.label });
        await allowApiWrites('cleanup', `${run.label} before-phase: ${cd.crew.name} job cards and time cards`, async () => {
            await deleteCrewJobCards(sessionApi, cd);
            await sweepFixtureCards(sessionApi, sweepScope(cd));
        });
    }
    return run;
}

/** One step or several, on the main crew-day or `target`; own card ids are recorded on every poll, before anything is asserted. */
export async function seedCrewDay(run: CfRun, deps: CfDeps, seed: CfSeedInput, target: CfCrewDay = crewDays(run)[0]): Promise<SeedResult> {
    const { sessionApi, pages } = deps;
    const crewIds = new Set(crewDays(run).map((cd) => cd.crew.id));
    const employeeIds = new Set(crewDays(run).flatMap((cd) => cd.employees.map((e) => e.id)));

    const recordOwn = async (): Promise<OfficeTimeCard[]> => {
        const own: OfficeTimeCard[] = [];
        for (const day of new Set(crewDays(run).map((cd) => cd.day))) {
            own.push(
                ...(await listTimeCards(sessionApi, { from: day, to: day })).filter(
                    (c) => crewIds.has(Number(c.crewCounter)) || employeeIds.has(Number(c.employeeCounter)),
                ),
            );
        }
        run.ctx.cards = own;
        for (const card of own) if (!run.timeCardIds.includes(card.timeCardCounter)) run.timeCardIds.push(card.timeCardCounter);
        return own;
    };

    for (const step of Array.isArray(seed) ? seed : [seed]) {
        const names = step.employees.map((k) => target.employees[WHICH[k]].name);
        const where = { day: target.day, crew: target.crew.name, ranch: run.ranch.name, field: run.field.name, job: run.jobs[step.job].name };

        await pages.crewTimeIn.punchIn({ ...where, ...step.timeIn, employees: names });
        if (step.pieceOut) await pages.crewPieceOut.pieceOut({ ...where, ...step.pieceOut.at, pieces: step.pieceOut.pieces });
        run.seeded.timeIns += names.length;

        // The time-out form only offers employees with an open time-in, so wait until it is readable.
        await expect(async () => {
            expect((await recordOwn()).filter((c) => Number(c.cardType) === CARD_TYPE.timeIn)).toHaveLength(run.seeded.timeIns);
        }).toPass({ timeout: 60_000 });

        if (step.timeOut) await pages.crewTimeOut.punchOut({ day: target.day, crew: target.crew.name, employees: names, ...step.timeOut });

        if (step.employeePieceOut) {
            const p = step.employeePieceOut;
            await pages.transferToJobCards.openFromMenu();
            await pages.transferToJobCards.addPieceOut({
                day: target.day,
                time: `${String(p.at.hour).padStart(2, '0')}:${String(p.at.minute).padStart(2, '0')}`,
                employee: target.employees[WHICH[p.employee]].name,
                crew: target.crew.name,
                job: run.jobs[step.job].name,
                ranch: run.ranch.name,
                field: run.field.name,
                pieces: p.pieces,
            });
        }

        run.seeded.cards += names.length * (step.timeOut ? 2 : 1) + (step.pieceOut ? 1 : 0) + (step.employeePieceOut ? 1 : 0);
        await expect(async () => {
            expect(await recordOwn()).toHaveLength(run.seeded.cards);
        }).toPass({ timeout: 60_000 });
    }
    return { timeCardCounters: run.timeCardIds.slice() };
}

/** One seeded card of the run, by employee and kind — read from the ids recorded while seeding. */
export function ownCard(run: CfRun, who: 'one' | 'two', kind: 'timeIn' | 'timeOut'): { id: number; reference: string } {
    const employee = run.employees[WHICH[who]];
    const card = (run.ctx.cards ?? []).find((c) => Number(c.employeeCounter) === employee.id && Number(c.cardType) === CARD_TYPE[kind]);
    if (!card) throw new Error(`${run.label}: no seeded ${kind} card for ${employee.name}`);
    return { id: card.timeCardCounter, reference: String(card.reference) };
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

// ── Cluster 2, part A: commit, piece-outs, Job Cards tab ──

/** References of every own card recorded so far (the ids a seed or Crew In captured). */
export function ownReferences(run: CfRun): string[] {
    return (run.ctx.cards ?? []).map((c) => String(c.reference));
}

/** WEBPET-2906: delete this transfer's own job cards on View ▸ Job Cards, one Delete Selected each; refuses unless the screen shows exactly this run's cards. */
export async function deleteOwnJobCards(run: CfRun, deps: CfDeps, transfer: TransferOutcome, confirmText: string): Promise<string[]> {
    const view = deps.pages.viewJobCards;
    await view.waitForTransferLanding();
    if (view.transferRunParam() !== transfer.transferRunCounter) {
        throw new Error(`${run.label}: refusing to delete — landed on transferRun ${view.transferRunParam()}, not ${transfer.transferRunCounter}.`);
    }
    const rows = view.rowsForCrew(run.crew.name);
    // The landing URL and heading appear before the grid replaces its loading skeleton rows.
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBe(transfer.jobCardCounters.length).catch(() => undefined);
    const refs: string[] = [];
    for (let i = 0; i < (await rows.count()); i += 1) refs.push(await view.referenceOf(rows.nth(i)));
    if (refs.length !== transfer.jobCardCounters.length) {
        throw new Error(`${run.label}: refusing to delete — ${refs.length} ${run.crew.name} row(s) on screen, the transfer wrote ${transfer.jobCardCounters.length}.`);
    }
    for (const ref of refs) await view.deleteOwnJobCard(ref, confirmText);
    for (const id of transfer.jobCardCounters) {
        const at = run.jobCardIds.indexOf(id);
        if (at >= 0) run.jobCardIds.splice(at, 1);
    }
    return refs;
}

// ── Cluster 2, part B: Crew In sheet + Time In edit ──

/** Record every own card of the run's crew-days (GET, cleanup ids), return the Time Ins not in `before` — the cards a Crew In just created on screen. */
export async function recordCrewInCards(run: CfRun, deps: CfDeps, before: number[]): Promise<Array<{ id: number; reference: string; employeeId: number }>> {
    const crewIds = new Set(crewDays(run).map((cd) => cd.crew.id));
    const employeeIds = new Set(crewDays(run).flatMap((cd) => cd.employees.map((e) => e.id)));
    const own: OfficeTimeCard[] = [];
    for (const day of new Set(crewDays(run).map((cd) => cd.day))) {
        own.push(
            ...(await listTimeCards(deps.sessionApi, { from: day, to: day })).filter(
                (c) => crewIds.has(Number(c.crewCounter)) || employeeIds.has(Number(c.employeeCounter)),
            ),
        );
    }
    run.ctx.cards = own;
    for (const card of own) if (!run.timeCardIds.includes(card.timeCardCounter)) run.timeCardIds.push(card.timeCardCounter);
    return own
        .filter((c) => Number(c.cardType) === CARD_TYPE.timeIn && !before.includes(c.timeCardCounter))
        .map((c) => ({ id: c.timeCardCounter, reference: String(c.reference), employeeId: Number(c.employeeCounter) }));
}
