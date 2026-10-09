import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { journeyE2Fixture } from '@data/journey-e/fixture';
import { JOURNEY_B_FIXTURE, punchDay } from '@data/journey-b/fixture';
import { deleteJobCard, getJobCard, listJobCards, type JobCardRecord } from '@utils/api/jobCardsApi';
import { analyzeTransfer, previewJobCards } from '@utils/api/transferToJobCardsApi';
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
import type { PreviewBoundary } from '@utils/journeys/journeyDFlow';

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
        },
        `${scenario.label}: E2 CREW must carry no exercise job or break automation that would split the day`,
    ).toEqual({ exerciseJobCounter: 0, createBreakCardFromTimeIn: 0, autoPaidBreakType: 0, autoReturnFromBreak: 0 });

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

    // Read, never written: a moved window or meal length must fail loudly rather than skip.
    const preferences = await getPreferences(sessionApi);
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(scenario.dayOffset))) {
        throw new Error(
            `${scenario.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${scenario.dayOffset}.`,
        );
    }
    for (const key of ['employeeMealStart', 'employeeMealTime', 'employeeMinNetForMeal', 'timeDecimalRounding']) {
        testInfo.annotations.push({ type: 'preference-evidence', description: `${key}=${String(preferences[key])}` });
    }
    if (typeof preferences.employeeMealTime === 'number' && Math.round(preferences.employeeMealTime * 60) !== scenario.expected.mealMinutes) {
        throw new Error(
            `${scenario.label}: employeeMealTime=${preferences.employeeMealTime} h is ${Math.round(preferences.employeeMealTime * 60)} min, the scenario expects ${scenario.expected.mealMinutes}.`,
        );
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
