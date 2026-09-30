/**
 * @fileoverview Run-time half of the UI-first rule (`.claude/profiles/JOURNEY.md`).
 *
 * A journey does on screen everything a user does on screen. ESLint stops a spec
 * *importing* an API module, but it cannot tell intent: `journeyCFlow.captureByTable`
 * POSTs a punch (forbidden) and its cleanup DELETEs the same row (allowed) from the
 * same TypeScript module. Only the call site knows which, so the call site declares it
 * — `allowApiWrites(allowance, reason, fn)` — and every API context is wrapped so an
 * undeclared write is seen.
 *
 * Four allowances exist; three of them are writes:
 *   preference — configuration a screen does not expose, written in a before-hook
 *   cleanup    — residue sweeps, teardown, recycle-bin restores
 *   device     — PET Pocket envelopes through the Post Office relay: it *is* the handheld
 * The fourth, read-only, needs no declaration: GET and HEAD always pass, as do the two
 * non-committing POSTs the Transfer screen uses to preview work.
 *
 * Modes (`UI_FIRST_GUARD`): `off` disables the check, `warn` (default) annotates the
 * test and records the violation, `enforce` throws before the request is sent.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import { Logger } from '../logger';

const logger = new Logger('UiFirstGuard');

export type WriteAllowance = 'preference' | 'cleanup' | 'device';
export type GuardMode = 'off' | 'warn' | 'enforce';

/** The annotation an in-test violation leaves behind; `ui-first-audit` reads these. */
export const VIOLATION_ANNOTATION = 'ui-first-violation';

/**
 * POSTs that commit nothing — the Transfer screen's own dry runs. They answer a
 * question about work that has not happened, so they are reads wearing a POST.
 */
export const READ_ONLY_POSTS: RegExp[] = [
    /^transfer-to-job-cards\/analyze(\/|$|\?)/,
    /^transfer-to-job-cards\/job-cards-preview(\/|$|\?)/,
];

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** The context methods that can send a write. `fetch` carries its method in options. */
const TRAPPED = new Set(['post', 'put', 'patch', 'delete', 'fetch']);

export interface WriteRecord {
    type: 'violation' | 'allowed';
    method: string;
    url: string;
    /** Which context sent it — `sessionApi`, `cleanupScope`, `relay`, … */
    label: string;
    allowance?: WriteAllowance;
    /** The caller's own words: "B7 stickerStartLocations", "after timeCards". */
    reason?: string;
    /** Spec file and test title when the call happened inside a test. */
    spec?: string;
    test?: string;
    /** Two frames of the call site — enough to find it, short enough to read. */
    frames: string[];
    at: string;
}

export class UiFirstViolation extends Error {
    constructor(readonly record: WriteRecord) {
        super(
            `UI-first violation: ${record.method} ${record.url} (${record.label}) was made through the API.\n` +
                `  at ${record.frames.join('\n  ← ')}\n` +
                'A step a user performs on screen is driven on screen. If this call really is ' +
                'configuration, cleanup or device simulation, wrap it in ' +
                "allowApiWrites('preference'|'cleanup'|'device', reason, fn) — and never wrap it " +
                'just to make a red test green.',
        );
        this.name = 'UiFirstViolation';
    }
}

interface Allowance {
    allowance: WriteAllowance;
    reason: string;
}

const allowances = new AsyncLocalStorage<Allowance>();

export function guardMode(): GuardMode {
    const raw = (process.env.UI_FIRST_GUARD ?? 'warn').toLowerCase();
    return raw === 'off' || raw === 'enforce' ? raw : 'warn';
}

/**
 * Declare that the writes `fn` makes are one of the four allowances.
 *
 * `reason` is mandatory and lands in the ledger, so `ui-first:audit --allowed` reads as
 * prose rather than a list of URLs. Nesting is fine — the innermost declaration wins.
 */
export function allowApiWrites<T>(
    allowance: WriteAllowance,
    reason: string,
    fn: () => Promise<T>,
): Promise<T> {
    return allowances.run({ allowance, reason }, fn);
}

/** The ledger a run appends to, one JSONL per worker so parallel writes never interleave. */
function ledgerPath(): string {
    const worker = process.env.TEST_WORKER_INDEX ?? process.env.WORKER_INDEX ?? '0';
    return path.join('artifacts', 'results', `ui-first-w${worker}.jsonl`);
}

function record(entry: WriteRecord): void {
    try {
        const file = ledgerPath();
        mkdirSync(path.dirname(file), { recursive: true });
        appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch (error) {
        // The ledger is evidence, not a gate — never fail a run over it.
        logger.warn(`Could not append to the UI-first ledger: ${(error as Error).message}`);
    }
}

/** Two frames of the caller, with this module and node internals dropped. */
function callSite(): string[] {
    const stack = new Error().stack?.split('\n').slice(1) ?? [];
    return stack
        .map((line) => line.trim().replace(/^at\s+/, ''))
        .filter((line) => !line.includes('writeGuard') && !line.startsWith('node:'))
        .slice(0, 2);
}

/** `POST https://api…/api/crew-time-in` → `crew-time-in`, for the READ_ONLY_POSTS match. */
function endpointOf(url: string, baseURL?: string): string {
    const raw = String(url);
    if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
    try {
        const parsed = new URL(raw);
        const base = baseURL ? new URL(baseURL).pathname : '/';
        const pathname = parsed.pathname.startsWith(base)
            ? parsed.pathname.slice(base.length)
            : parsed.pathname;
        return pathname.replace(/^\/+/, '') + parsed.search;
    } catch {
        return raw;
    }
}

export interface GuardOptions {
    /** Which context this is, for the ledger: `sessionApi`, `cleanupScope`, `relay`, … */
    label: string;
    /** Present inside a test: lets a violation annotate the test the audit reports on. */
    testInfo?: TestInfo;
    /** Relay traffic is a different API entirely; it never matches READ_ONLY_POSTS. */
    kind?: 'app' | 'relay';
    /** For trimming absolute URLs down to an endpoint. */
    baseURL?: string;
    /**
     * A standing allowance for every write through this context, for contexts that
     * exist only to do one thing — the residue sweep and the fixture reconcile are
     * cleanup from their first call to their last. An ambient `allowApiWrites` still
     * wins, so a caller can be more specific about its reason.
     */
    defaultAllowance?: WriteAllowance;
}

/**
 * Wrap an API context so its writes are checked.
 *
 * Only the five sending methods are trapped. Everything else is read straight off the
 * target and bound to it — Playwright's channel objects and `_wrapApiCall` rely on
 * `this` being the real instance, so handing back a Proxy-bound method breaks dispose
 * and tracing in ways that surface much later.
 */
export function guardApiContext(ctx: APIRequestContext, opts: GuardOptions): APIRequestContext {
    if (guardMode() === 'off') return ctx;

    const check = (method: string, url: unknown): void => {
        const upper = method.toUpperCase();
        if (!WRITE_METHODS.has(upper)) return;

        const endpoint = endpointOf(String(url), opts.baseURL);
        if (opts.kind !== 'relay' && upper === 'POST' && READ_ONLY_POSTS.some((r) => r.test(endpoint))) {
            return;
        }

        const ambient =
            allowances.getStore() ??
            (opts.defaultAllowance
                ? { allowance: opts.defaultAllowance, reason: opts.label }
                : undefined);
        const entry: WriteRecord = {
            type: ambient ? 'allowed' : 'violation',
            method: upper,
            url: endpoint,
            label: opts.label,
            allowance: ambient?.allowance,
            reason: ambient?.reason,
            spec: opts.testInfo?.file,
            test: opts.testInfo?.title,
            frames: callSite(),
            at: new Date().toISOString(),
        };
        record(entry);
        if (ambient) return;

        const description = `${upper} ${endpoint} (${opts.label}) at ${entry.frames.join(' ← ')}`;
        opts.testInfo?.annotations.push({ type: VIOLATION_ANNOTATION, description });
        logger.warn(`UI-first violation: ${description}`);
        if (guardMode() === 'enforce') throw new UiFirstViolation(entry);
    };

    return new Proxy(ctx, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if (typeof prop !== 'string' || !TRAPPED.has(prop) || typeof value !== 'function') {
                return typeof value === 'function' ? value.bind(target) : value;
            }
            return (url: string, options?: { method?: string }) => {
                // The check is synchronous — it must decide before anything is sent — but
                // these methods are async, and a caller that reaches for .catch() on the
                // returned value would never see a synchronous throw. Reject instead.
                try {
                    check(prop === 'fetch' ? (options?.method ?? 'GET') : prop, url);
                } catch (error) {
                    return Promise.reject(error);
                }
                return (value as (...args: unknown[]) => unknown).call(target, url, options);
            };
        },
    });
}
