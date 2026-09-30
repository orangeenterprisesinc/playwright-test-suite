/**
 * @fileoverview Cleanup that survives a timeout.
 *
 * Journey specs used to clean up from `try { … } finally { await run.cleanup(); }`
 * in the test body. That covers a pass and an ordinary failure, but not the one
 * case that matters most: Playwright kills a timed-out test where it stands, so
 * the `finally` never runs and a long import spec leaves its whole fixture behind.
 *
 * A flow helper registers its cleanup with the scope the moment it starts creating
 * things; the `cleanupScope` fixture drains the scope in teardown, which Playwright
 * runs even after a timeout. Registration is keyed on `testInfo`, so nothing in the
 * flow signatures had to change.
 *
 * The API context the drain uses is the scope's OWN, opened untraced at drain time —
 * never the test's `sessionApi`. After a timeout Playwright has already stopped
 * tracing and removed the trace file, and the test's request context throws
 * `ENOENT …/traces/…trace` inside `_wrapApiCall` on every call, before anything
 * reaches the network. Cleanup "ran" through that context and every entry failed
 * (measured 2026-09-29: two committed job cards and five transferred time cards
 * left on dev). A context from the module-level `request` is not attached to the
 * test's tracing, so it keeps working after the test is dead.
 */
import type { APIRequestContext, Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { createSessionRequestContext } from '../api/sessionContext';
import { allowApiWrites } from '../api/writeGuard';
import { Logger } from '../logger';

export type ScopeOutcome = 'ok' | 'failed' | 'skipped-budget';

export interface ScopeEntryReport {
    label: string;
    outcome: ScopeOutcome;
    ms: number;
    error?: string;
}

export interface ScopeReport {
    entries: ScopeEntryReport[];
    budgetMs: number;
    budgetExhausted: boolean;
}

/** Opens a browser page for the UI delete fallback, or `null` when none can be had. */
export interface ScopeUi {
    page(): Promise<Page | null>;
}

export interface CleanupScopeOptions {
    /** Called at most once, and only if a UI fallback actually fires. */
    openBrowser?: () => Promise<Browser>;
    storageState?: string;
    budgetMs?: number;
}

/**
 * What a flow registers. The `api` it receives is the scope's own untraced context;
 * a cleanup that uses it instead of the test's `sessionApi` survives a timeout. A
 * zero-argument callable is still accepted, so older registrations keep compiling —
 * they just keep the timeout weakness until they take the parameter.
 */
export type ScopeCleanup = (api: APIRequestContext) => Promise<void>;

interface Registered {
    label: string;
    run: ScopeCleanup;
    done: boolean;
}

/** Handle returned by {@link CleanupScope.add} so a caller can say "already handled". */
export interface ScopeRegistration {
    complete(): void;
}

const SCOPES = new WeakMap<TestInfo, CleanupScope>();

export function bindScope(testInfo: TestInfo, scope: CleanupScope): void {
    SCOPES.set(testInfo, scope);
}

/** What a flow helper calls. `null` outside a test — global teardown, the tools project. */
export function currentScope(testInfo: TestInfo): CleanupScope | null {
    return SCOPES.get(testInfo) ?? null;
}

/**
 * Register `run` with the ambient scope and return an idempotent callable. The flow
 * hands that back to the spec as `run.cleanup()`: a spec that wants to clean up mid-test
 * still can, and teardown then skips it rather than repeating it. With no ambient scope
 * (tools, unit tests) the callable runs `run` against a fresh untraced context itself.
 */
export function register(testInfo: TestInfo, label: string, run: ScopeCleanup): () => Promise<void> {
    const scope = currentScope(testInfo);
    if (!scope) return () => withUntracedApi(label, run, testInfo);
    const registration = scope.add(label, run);
    return async () => {
        await withUntracedApi(label, run, testInfo);
        registration.complete();
    };
}

/**
 * Run `fn` against a context that is not the test's traced one, and dispose it after.
 * Cleanup is allowance (b) of the UI-first rule, declared here so the guard lets the
 * DELETEs through and the audit can show what teardown removed.
 */
async function withUntracedApi(label: string, fn: ScopeCleanup, testInfo?: TestInfo): Promise<void> {
    const api = await createSessionRequestContext(undefined, { label: 'cleanupScope', testInfo });
    if (!api) throw new Error('cleanup: no authenticated API session (.auth/user.json / API_URL) to clean up with');
    try {
        await allowApiWrites('cleanup', label, () => fn(api));
    } finally {
        await api.dispose().catch(() => undefined);
    }
}

export class CleanupScope {
    private readonly logger = new Logger('CleanupScope');
    private readonly entries: Registered[] = [];
    private readonly budgetMs: number;
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private uiPage: Page | null = null;
    private uiOpenFailed = false;

    constructor(private readonly options: CleanupScopeOptions = {}) {
        this.budgetMs = options.budgetMs ?? 60_000;
    }

    add(label: string, run: ScopeCleanup): ScopeRegistration {
        const entry: Registered = { label, run, done: false };
        this.entries.push(entry);
        return {
            complete: () => {
                entry.done = true;
            },
        };
    }

    get ui(): ScopeUi {
        return {
            page: async () => {
                if (this.uiPage) return this.uiPage;
                if (this.uiOpenFailed || !this.options.openBrowser) return null;
                try {
                    this.browser = await this.options.openBrowser();
                    this.context = await this.browser.newContext({ storageState: this.options.storageState ?? '.auth/user.json' });
                    this.uiPage = await this.context.newPage();
                    return this.uiPage;
                } catch (error) {
                    // No .auth/user.json, no browser binary, teardown already past the point
                    // of launching one — the caller falls back to annotating.
                    this.uiOpenFailed = true;
                    this.logger.warn(`Could not open a cleanup page: ${error instanceof Error ? error.message : String(error)}`);
                    return null;
                }
            },
        };
    }

    /**
     * Run everything still outstanding, newest first. Never throws — teardown runs
     * after the verdict is decided and must not overwrite it.
     */
    async runAll(testInfo: TestInfo): Promise<ScopeReport> {
        const report: ScopeReport = { entries: [], budgetMs: this.budgetMs, budgetExhausted: false };
        // Teardown after a timeout is borrowed time; stop rather than hang the worker.
        const deadline = Date.now() + this.budgetMs;

        // One untraced context for the whole drain, opened only if something is outstanding.
        let api: APIRequestContext | null | undefined;
        const openApi = async (): Promise<APIRequestContext> => {
            api ??= await createSessionRequestContext(undefined, { label: 'cleanupScope', testInfo });
            if (!api) throw new Error('no authenticated API session (.auth/user.json / API_URL) to clean up with');
            return api;
        };

        for (let i = this.entries.length - 1; i >= 0; i -= 1) {
            const entry = this.entries[i];
            if (entry.done) continue;
            entry.done = true;

            if (Date.now() > deadline) {
                report.budgetExhausted = true;
                report.entries.push({ label: entry.label, outcome: 'skipped-budget', ms: 0 });
                continue;
            }

            const at = Date.now();
            try {
                const ctx = await openApi();
                await allowApiWrites('cleanup', entry.label, () => entry.run(ctx));
                report.entries.push({ label: entry.label, outcome: 'ok', ms: Date.now() - at });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                report.entries.push({ label: entry.label, outcome: 'failed', ms: Date.now() - at, error: message });
                this.logger.warn(`Cleanup '${entry.label}' failed: ${message}`);
            }
        }

        await api?.dispose().catch(() => undefined);
        await this.closeUi();

        if (report.entries.length) {
            await testInfo
                .attach('cleanup-scope.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' })
                .catch(() => undefined);
        }
        for (const entry of report.entries) {
            if (entry.outcome === 'ok') continue;
            testInfo.annotations.push({
                type: 'cleanup-not-possible',
                description: `${entry.label}: ${entry.outcome === 'skipped-budget' ? `cleanup budget of ${String(this.budgetMs)}ms exhausted` : (entry.error ?? 'failed')}`,
            });
        }
        return report;
    }

    private async closeUi(): Promise<void> {
        try {
            await this.context?.close();
            await this.browser?.close();
        } catch {
            /* best effort */
        } finally {
            this.uiPage = null;
            this.context = null;
            this.browser = null;
        }
    }
}
