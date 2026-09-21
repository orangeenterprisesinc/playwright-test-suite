import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { createLoginRequestContext } from '../api/apiLogin';
import {
    newImportDeadline,
    runFingerprint,
    TERMINAL_IMPORT_STATUSES,
    type ImportDeadline,
    type ImportFileResult,
    type ImportWaitVerdict,
} from '../api/connectivityImportApi';
import { deleteTimeCard, isoDay, listTimeCardsWithMeta, type OfficeTimeCard } from '../api/timeCardsApi';
import { drainMailbox } from '../relay/relayClient';
import { JOURNEY_B_FIXTURE, punchDay } from '../../data/journey-b/fixture';
import { cleanupTarget, isProtectedName } from '../../data/static/shared/cleanupTargets';
import { readRecordedImportRuns } from './importRunRecorder';
import { envNumber } from './residueSweep';
import { Logger } from '../logger';

// Run START waits out the previous run's in-flight imports (their rows land after this
// run's per-spec sweep and flip a Transfer row Warning→Blocking), drains stale office
// envelopes and sweeps the Journey B fixture employee-days over the whole fixture-day
// window. Run END does the same, best effort, from this run's recorded import ids.
// Never throws; never creates entities; API only.

const SUMMARY_DIR = path.join('artifacts', 'results');
const SUITE_REFERENCE = /^\d{7}-\d{6}-[A-Z]{2}-[0-9A-Z]{4}-ui$/;
// -10 covers the Journey B fixture days. Suite-CREATED employees (E2E*) can hold
// cards far older than that, and while one survives the residue sweep can never
// delete the employee (409 record.used_by_time_card / fk_in_use), so the two halves
// deadlock forever — dev carried the same six rows for weeks. RECONCILE_WINDOW_DAYS
// widens the lookback for exactly that case.
const WINDOW_TO_OFFSET = 0;
const LOOKBACK = 40;
const CONFIRM_GAP = 5;
const MAX_PROBE_ID = 2 ** 24;
const SWEEP_BUDGET_MS = 120_000;
const FIXTURE_EMPLOYEE_CODES = [...JOURNEY_B_FIXTURE.present, JOURNEY_B_FIXTURE.absentee, ...JOURNEY_B_FIXTURE.sticker].map(
    (e) => e.code,
);
/** Name prefixes the residue sweep reclaims — their cards must go first or it 409s. */
const CREATED_EMPLOYEE_PREFIXES = cleanupTarget('employee').prefixes.map((p) => p.prefix);

const logger = new Logger('FixtureReconcile');

export type ReconcilePhase = 'start' | 'end';

export interface ReconcileOptions {
    phase: ReconcilePhase;
    context?: APIRequestContext;
}

export type ProbeAnswer = 'present' | 'absent' | 'unknown';

export interface ReconcileSummary {
    phase: ReconcilePhase;
    startedAt: string;
    durationMs: number;
    enabled: boolean;
    auth: 'ok' | 'failed' | 'skipped';
    probe: { latestRunId: number | null; requests: number; error?: string };
    quiesce: {
        source: 'probe' | 'recorder' | 'none';
        inFlight: number[];
        settled: number[];
        unsettled: Array<{ runId: number; status: string }>;
        verdict: ImportWaitVerdict | null;
        waitedMs: number;
    };
    mailbox: { drained: number; skipped?: string; error?: string };
    sweep: {
        from: string;
        to: string;
        employees: Record<string, number | null>;
        /** Suite-created employees whose cards must go before the residue sweep can delete them. */
        createdEmployees: Record<string, number>;
        undefinedEmployeeId: number | null;
        /** `resolved/total` — a mostly-null map makes every match fail silently. */
        employeesResolved: string;
        listed: number;
        matched: number;
        deleted: number;
        skippedTransferred: number;
        notFound: number;
        failed: number;
        budgetExhausted: boolean;
        /** References of rows that MATCHED. Empty when matched is 0 — see listedSamples. */
        samples: string[];
        perDay: Record<string, { listed: number; matched: number; deleted: number }>;
        /** A day that lands exactly on the page size was probably truncated. */
        capSuspected: boolean;
        /** First few rows the API RETURNED, matched or not — the only field that can explain matched=0. */
        listedSamples: Array<{ reference: string; employeeCounter: number | null; dateTime: string | null }>;
        /** Keys on the raw list body; a paging envelope here means asArray dropped the count. */
        rawBodyKeys: string[];
        /**
         * Employees the sweep could not clear because a card is transferred. The product
         * refuses `DELETE /time-cards/{id}` on a transferred row (record.transferred_delete)
         * and the UI enforces the same rule, so these are stranded for good — the residue
         * sweep skips them rather than burning a failed DELETE on each one every run.
         */
        blockedEmployees: number[];
        error?: string;
    };
    error?: string;
}

// Logged once — captures the runs/{id} 404 shape, which nothing in the repo knows yet.
let probeDebugLogged = false;

// Status-driven, never body-driven: a 200 without a string `status` counts as absent.
// 429/5xx/network get one retry; still inconclusive is `unknown`, which aborts the probe.
async function probeImportRun(request: APIRequestContext, id: number): Promise<{ answer: ProbeAnswer; status: number }> {
    const attempt = async (): Promise<{ answer: ProbeAnswer; status: number } | null> => {
        const res = await request.get(`connectivity/import/runs/${String(id)}`);
        if (res.status() === 404) {
            if (!probeDebugLogged) {
                probeDebugLogged = true;
                logger.debug(`runs/{id} 404 body: ${(await res.text()).slice(0, 200)}`);
            }
            return { answer: 'absent', status: 404 };
        }
        if (res.ok()) {
            const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
            return { answer: body && typeof body.status === 'string' ? 'present' : 'absent', status: res.status() };
        }
        return null;
    };
    const first = await attempt();
    if (first) return first;
    await new Promise((r) => setTimeout(r, 2_000));
    const second = await attempt();
    return second ?? { answer: 'unknown', status: 0 };
}

// Exponential search → bisect → confirm. Ids are sequential per tenant, but a discarded
// run can leave a gap; the confirm step tolerates one ≤ CONFIRM_GAP, not an unbounded one.
export async function findLatestImportRunId(
    request: APIRequestContext,
): Promise<{ latestRunId: number | null; requests: number; error?: string }> {
    let requests = 0;
    const probe = async (id: number) => {
        requests += 1;
        return probeImportRun(request, id);
    };

    let lo = 0;
    let hi = 1;
    for (;;) {
        const { answer } = await probe(hi);
        if (answer === 'unknown') return { latestRunId: null, requests, error: `runs/${String(hi)} answered unknown` };
        if (answer === 'absent') break;
        lo = hi;
        if (hi >= MAX_PROBE_ID) return { latestRunId: null, requests, error: `no absent id found up to ${String(MAX_PROBE_ID)}` };
        hi *= 2;
    }
    if (lo === 0) return { latestRunId: 0, requests };

    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        const { answer } = await probe(mid);
        if (answer === 'unknown') return { latestRunId: null, requests, error: `runs/${String(mid)} answered unknown` };
        if (answer === 'present') lo = mid;
        else hi = mid;
    }

    for (;;) {
        let advanced = false;
        for (let k = 1; k <= CONFIRM_GAP; k += 1) {
            const { answer } = await probe(lo + k);
            if (answer === 'unknown') return { latestRunId: null, requests, error: `runs/${String(lo + k)} answered unknown` };
            if (answer === 'present') {
                lo += k;
                advanced = true;
                break;
            }
        }
        if (!advanced) break;
    }
    return { latestRunId: lo, requests };
}

// Sequential GETs — dev rate-limits bursts.
export async function inFlightImportRuns(request: APIRequestContext, latest: number, lookback = LOOKBACK): Promise<number[]> {
    const from = Math.max(1, latest - lookback + 1);
    const inFlight: number[] = [];
    for (let id = from; id <= latest; id += 1) {
        const res = await request.get(`connectivity/import/runs/${String(id)}`);
        if (!res.ok()) continue;
        const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
        const status = typeof body?.status === 'string' ? body.status : null;
        if (status && !TERMINAL_IMPORT_STATUSES.includes(status)) inFlight.push(id);
    }
    return inFlight;
}

// One multi-run loop shaped like waitForImportRun: touch on any fingerprint change,
// stop on the deadline's verdict.
export async function awaitImportQuiescence(
    request: APIRequestContext,
    runIds: number[],
    deadline: ImportDeadline,
): Promise<{ settled: number[]; unsettled: Array<{ runId: number; status: string }>; verdict: ImportWaitVerdict | null; waitedMs: number }> {
    const startedAt = Date.now();
    if (!runIds.length) return { settled: [], unsettled: [], verdict: null, waitedMs: 0 };

    deadline.touch();
    const remaining = new Map<number, string>(runIds.map((id) => [id, '']));
    const fingerprints = new Map<number, string>();
    const settled: number[] = [];

    for (;;) {
        for (const runId of [...remaining.keys()]) {
            const res = await request.get(`connectivity/import/runs/${String(runId)}`);
            if (!res.ok()) continue;
            const body = (await res.json().catch(() => null)) as { status?: string; files?: ImportFileResult[] } | null;
            if (!body) continue;
            const fp = runFingerprint(body);
            if (fp !== fingerprints.get(runId)) {
                fingerprints.set(runId, fp);
                deadline.touch();
            }
            const status = String(body.status ?? remaining.get(runId));
            remaining.set(runId, status);
            if (TERMINAL_IMPORT_STATUSES.includes(status)) {
                settled.push(runId);
                remaining.delete(runId);
            }
        }
        if (!remaining.size) return { settled, unsettled: [], verdict: null, waitedMs: Date.now() - startedAt };
        const verdict = deadline.verdict();
        if (verdict) {
            return {
                settled,
                unsettled: [...remaining.entries()].map(([runId, status]) => ({ runId, status })),
                verdict,
                waitedMs: Date.now() - startedAt,
            };
        }
        await new Promise((r) => setTimeout(r, deadline.pollDelayMs()));
    }
}

interface EmployeeListRow {
    code?: unknown;
    employeeCounter?: unknown;
    [key: string]: unknown;
}

function employeeRows(body: unknown): EmployeeListRow[] {
    if (Array.isArray(body)) return body as EmployeeListRow[];
    const wrapped = body as { items?: EmployeeListRow[]; data?: EmployeeListRow[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

// Find-only: one GET employees for all fixture codes — never ensureEmployee.
async function resolveFixtureEmployees(
    request: APIRequestContext,
): Promise<{ fixture: Record<string, number | null>; created: Record<string, number> }> {
    const fixture: Record<string, number | null> = {};
    for (const code of FIXTURE_EMPLOYEE_CODES) fixture[code] = null;
    const created: Record<string, number> = {};

    const res = await request.get('employees');
    if (!res.ok()) return { fixture, created };
    const rows = employeeRows(await res.json().catch(() => null));
    for (const code of FIXTURE_EMPLOYEE_CODES) {
        const match = rows.find((r) => String(r.code ?? '') === code);
        if (match) fixture[code] = Number(match.employeeCounter);
    }
    // Employees this suite created. Their cards block the residue sweep's DELETE, and
    // the fixture-code list above will never contain them.
    for (const row of rows) {
        const name = String((row as { name?: unknown }).name ?? '');
        if (!name || isProtectedName(name)) continue;
        if (!CREATED_EMPLOYEE_PREFIXES.some((prefix) => name.startsWith(prefix))) continue;
        const id = Number(row.employeeCounter);
        if (Number.isFinite(id)) created[name] = id;
    }
    return { fixture, created };
}

// An employee COUNTER, not a code (mirrors b05/b07); null/unset (WEBPET-2843) is a valid answer.
async function readUndefinedEmployeeId(request: APIRequestContext): Promise<number | null> {
    const res = await request.get('preferences');
    if (!res.ok()) return null;
    const body = (await res.json().catch(() => null)) as { undefinedEmployee?: unknown } | null;
    const id = Number(body?.undefinedEmployee);
    return Number.isFinite(id) && id > 0 ? id : null;
}

// One request per day, not one for the whole window. Every other caller of
// listTimeCards in this repo asks for a single day; this was the only multi-day
// caller and the only one that found nothing (run 35589360814: listed 50, matched 0).
// A capped page would be invisible — asArray drops the paging envelope — so a day
// landing exactly on PAGE_SIZE_HINT is flagged rather than trusted.
const PAGE_SIZE_HINT = 50;

async function sweepWindow(
    request: APIRequestContext,
    ids: Set<number>,
    undefinedId: number | null,
    budgetEndAt: number,
    out: ReconcileSummary['sweep'],
): Promise<void> {
    const fromOffset = -Math.abs(envNumber('RECONCILE_WINDOW_DAYS', 30));
    out.from = isoDay(punchDay(fromOffset));
    out.to = isoDay(punchDay(WINDOW_TO_OFFSET));

    let warned = 0;
    for (let offset = fromOffset; offset <= WINDOW_TO_OFFSET; offset += 1) {
        if (Date.now() > budgetEndAt) {
            out.budgetExhausted = true;
            break;
        }
        const day = isoDay(punchDay(offset));
        let cards: OfficeTimeCard[];
        try {
            const page = await listTimeCardsWithMeta(request, { from: day, to: day });
            cards = page.cards;
            if (!out.rawBodyKeys.length) out.rawBodyKeys = page.bodyKeys;
        } catch (error) {
            out.error = error instanceof Error ? error.message : String(error);
            return;
        }

        if (cards.length >= PAGE_SIZE_HINT) out.capSuspected = true;
        out.listed += cards.length;
        for (const card of cards.slice(0, Math.max(0, 3 - out.listedSamples.length))) {
            out.listedSamples.push({
                reference: String(card.reference ?? ''),
                employeeCounter: Number.isFinite(Number(card.employeeCounter)) ? Number(card.employeeCounter) : null,
                dateTime: card.dateTime === undefined ? null : String(card.dateTime),
            });
        }

        const matched = cards.filter(
            (c) =>
                ids.has(Number(c.employeeCounter)) ||
                (undefinedId !== null && Number(c.employeeCounter) === undefinedId && SUITE_REFERENCE.test(String(c.reference ?? ''))),
        );
        out.matched += matched.length;
        for (const card of matched.slice(0, Math.max(0, 3 - out.samples.length))) {
            out.samples.push(String(card.reference ?? ''));
        }

        const perDay = { listed: cards.length, matched: matched.length, deleted: 0 };
        out.perDay[day] = perDay;

        for (const card of matched) {
            if (Date.now() > budgetEndAt) {
                out.budgetExhausted = true;
                break;
            }
            const employeeId = Number(card.employeeCounter);
            const strand = (): void => {
                out.skippedTransferred += 1;
                if (Number.isFinite(employeeId) && !out.blockedEmployees.includes(employeeId)) out.blockedEmployees.push(employeeId);
            };
            if (card.transferred === true) {
                strand();
                continue;
            }
            const { deleted, status } = await deleteTimeCard(request, card.timeCardCounter);
            if (deleted) {
                out.deleted += 1;
                perDay.deleted += 1;
            } else if (status === 409) strand();
            else if (status === 404) out.notFound += 1;
            else {
                out.failed += 1;
                if (warned < 5) {
                    warned += 1;
                    logger.warn(`fixture reconcile: time card #${String(card.timeCardCounter)} delete -> ${String(status)}`);
                }
            }
        }
    }
}

export function formatReconcileSummary(s: ReconcileSummary): string {
    const header = `fixture reconcile [${s.phase}] auth=${s.auth} enabled=${String(s.enabled)} ${String(s.durationMs)}ms`;
    const probeLine = `  probe latest=${String(s.probe.latestRunId ?? 'n/a')} requests=${String(s.probe.requests)}${s.probe.error ? `  ERROR ${s.probe.error}` : ''}`;
    const quiesceLine =
        `  quiesce source=${s.quiesce.source} inFlight=${String(s.quiesce.inFlight.length)} ` +
        `settled=${String(s.quiesce.settled.length)} unsettled=${String(s.quiesce.unsettled.length)}` +
        `${s.quiesce.verdict ? `  ${s.quiesce.verdict}` : ''} waited=${String(s.quiesce.waitedMs)}ms`;
    const mailboxLine = `  mailbox drained=${String(s.mailbox.drained)}${s.mailbox.skipped ? `  skipped: ${s.mailbox.skipped}` : ''}${s.mailbox.error ? `  ERROR ${s.mailbox.error}` : ''}`;
    const sweepLine =
        `  sweep ${s.sweep.from}..${s.sweep.to} listed=${String(s.sweep.listed)} matched=${String(s.sweep.matched)} ` +
        `deleted=${String(s.sweep.deleted)} skipped409=${String(s.sweep.skippedTransferred)} notFound=${String(s.sweep.notFound)} ` +
        `failed=${String(s.sweep.failed)} employees=${s.sweep.employeesResolved}` +
        `${s.sweep.blockedEmployees.length ? ` blockedEmployees=${s.sweep.blockedEmployees.join(',')}` : ''}` +
        `${s.sweep.capSuspected ? '  CAP SUSPECTED' : ''}${s.sweep.budgetExhausted ? '  BUDGET EXHAUSTED' : ''}` +
        `${s.sweep.error ? `  ERROR ${s.sweep.error}` : ''}`;
    // matched=0 is unexplainable from the artifact without a sample of what WAS returned.
    const listedLine =
        s.sweep.matched === 0 && s.sweep.listed > 0
            ? `  listed samples: ${s.sweep.listedSamples.map((r) => `${r.reference || '(no ref)'}#${String(r.employeeCounter ?? '?')}`).join(', ')}` +
              `${s.sweep.rawBodyKeys.length ? `  bodyKeys=${s.sweep.rawBodyKeys.join(',')}` : ''}`
            : null;
    return [header, probeLine, quiesceLine, mailboxLine, sweepLine, listedLine].filter((l) => l !== null).join('\n');
}

export async function reconcileFixtureDays(opts: ReconcileOptions): Promise<ReconcileSummary> {
    const { phase } = opts;
    const startedAt = new Date();
    const stallMs = envNumber('RECONCILE_STALL_MS', 480_000);
    const ceilingMs = envNumber('RECONCILE_CEILING_MS', 600_000);
    const budgetMs = envNumber('RECONCILE_BUDGET_MS', 480_000);

    const summary: ReconcileSummary = {
        phase,
        startedAt: startedAt.toISOString(),
        durationMs: 0,
        enabled: true,
        auth: 'skipped',
        probe: { latestRunId: null, requests: 0 },
        quiesce: { source: 'none', inFlight: [], settled: [], unsettled: [], verdict: null, waitedMs: 0 },
        mailbox: { drained: 0 },
        sweep: {
            from: '',
            to: '',
            employees: {},
            createdEmployees: {},
            undefinedEmployeeId: null,
            employeesResolved: '0/0',
            listed: 0,
            matched: 0,
            deleted: 0,
            skippedTransferred: 0,
            notFound: 0,
            failed: 0,
            budgetExhausted: false,
            samples: [],
            perDay: {},
            capSuspected: false,
            listedSamples: [],
            rawBodyKeys: [],
            blockedEmployees: [],
        },
    };

    const finish = (): ReconcileSummary => {
        summary.durationMs = Date.now() - startedAt.getTime();
        logger.info(formatReconcileSummary(summary));
        try {
            fs.mkdirSync(SUMMARY_DIR, { recursive: true });
            fs.writeFileSync(path.join(SUMMARY_DIR, `fixture-reconcile-${phase}.json`), JSON.stringify(summary, null, 2));
        } catch (error) {
            logger.warn(`Could not write the reconcile summary: ${error instanceof Error ? error.message : String(error)}`);
        }
        return summary;
    };

    if (process.env.FIXTURE_RECONCILE === '0') {
        summary.enabled = false;
        return finish();
    }

    let context = opts.context ?? null;
    const ownsContext = !opts.context;
    try {
        context ??= await createLoginRequestContext({ label: `fixture reconcile (${phase})` });
        if (!context) {
            summary.auth = 'failed';
            return finish();
        }
        summary.auth = 'ok';

        let inFlight: number[] = [];
        if (phase === 'start') {
            try {
                const probeResult = await findLatestImportRunId(context);
                summary.probe.latestRunId = probeResult.latestRunId;
                summary.probe.requests = probeResult.requests;
                if (probeResult.error) summary.probe.error = probeResult.error;
                summary.quiesce.source = 'probe';
                if (probeResult.latestRunId) {
                    inFlight = await inFlightImportRuns(context, probeResult.latestRunId);
                }
            } catch (error) {
                summary.probe.error = error instanceof Error ? error.message : String(error);
            }
        } else {
            try {
                const recorded = [...new Set(readRecordedImportRuns().map((r) => r.runId))];
                const unresolved: number[] = [];
                for (const runId of recorded) {
                    const res = await context.get(`connectivity/import/runs/${String(runId)}`);
                    if (!res.ok()) continue;
                    const body = (await res.json().catch(() => null)) as { status?: string } | null;
                    if (typeof body?.status === 'string' && !TERMINAL_IMPORT_STATUSES.includes(body.status)) {
                        unresolved.push(runId);
                    }
                }
                inFlight = unresolved;
                summary.quiesce.source = 'recorder';
            } catch (error) {
                logger.warn(
                    `fixture reconcile [end]: could not resolve recorded runs — ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
        summary.quiesce.inFlight = inFlight;

        if (inFlight.length) {
            // The import circuit breaker's consecutiveStalls is worker-local; this runs in
            // the global setup/teardown process, so it never caps this deadline.
            const deadline =
                phase === 'start'
                    ? newImportDeadline({ ceilingMs, stallMs })
                    : newImportDeadline({ ceilingMs: budgetMs, stallMs: Math.min(stallMs, budgetMs) });
            const result = await awaitImportQuiescence(context, inFlight, deadline);
            summary.quiesce.settled = result.settled;
            summary.quiesce.unsettled = result.unsettled;
            summary.quiesce.verdict = result.verdict;
            summary.quiesce.waitedMs = result.waitedMs;
        }

        const relayUrl = process.env.DEVICE_RELAY_URL;
        const relayServer = process.env.DEVICE_RELAY_SERVER;
        if (relayUrl && relayServer) {
            try {
                summary.mailbox.drained = await drainMailbox(relayUrl, relayServer);
            } catch (error) {
                summary.mailbox.error = error instanceof Error ? error.message : String(error);
            }
        } else {
            summary.mailbox.skipped = 'DEVICE_RELAY_URL/DEVICE_RELAY_SERVER unset';
        }

        try {
            const { fixture, created } = await resolveFixtureEmployees(context);
            summary.sweep.employees = fixture;
            summary.sweep.createdEmployees = created;
            const fixtureIds = new Set(Object.values(fixture).filter((v): v is number => v !== null));
            const ids = new Set([...fixtureIds, ...Object.values(created)]);
            summary.sweep.employeesResolved = `${String(fixtureIds.size)}/${String(Object.keys(fixture).length)}+${String(Object.keys(created).length)} created`;
            summary.sweep.undefinedEmployeeId = await readUndefinedEmployeeId(context);
            if (!fixtureIds.size) {
                summary.sweep.error = 'no fixture employee resolved';
            } else {
                await sweepWindow(context, ids, summary.sweep.undefinedEmployeeId, Date.now() + SWEEP_BUDGET_MS, summary.sweep);
            }
        } catch (error) {
            summary.sweep.error = error instanceof Error ? error.message : String(error);
        }

        return finish();
    } catch (error) {
        summary.error = error instanceof Error ? error.message : String(error);
        return finish();
    } finally {
        if (ownsContext && context) await context.dispose().catch(() => undefined);
    }
}
