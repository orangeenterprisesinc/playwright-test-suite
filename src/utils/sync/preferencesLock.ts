import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

// The Preferences screen's Save sends the whole form, so one worker's save can revert a key another
// worker changed between load and save. Every on-screen Preferences change (load, set, save, read
// back) runs under this cross-process lock: mkdir is atomic, so exactly one worker holds it.
const POLL_MS = 250;
const STALE_MS = 120_000;

function lockDir(name: string): string {
    const tenant = createHash('sha1').update(process.env.API_URL || 'local').digest('hex').slice(0, 8);
    return join(tmpdir(), `pts-${name}-${tenant}.lock`);
}

export function withPreferencesLock<T>(fn: () => Promise<T>): Promise<T> {
    return withFileLock('preferences', fn);
}

// Export to Accounting hands every worker the user's single draft run, so a second worker's Refresh→Save
// would commit or delete the draft under the first. The window includes a Test File and a Save: 10 min stale.
export function withExportDraftLock<T>(fn: () => Promise<T>): Promise<T> {
    return withFileLock('export-draft', fn, 600_000);
}

// The tenant's Paid Break Job is one value that D10 and B9 each point at their own job; held from the
// designation until the restore, across a whole preview or commit, so 10 min stale.
export function acquirePaidBreakJobLock(): Promise<() => void> {
    return acquireFileLock('paid-break-job', 600_000);
}

// The Transfer screen keeps one analyze job per user: every new analyze (Analyze, Try again, Re-analyze, the Job
// Cards preview) supersedes the user's previous job, which then answers 404 (tigerden "transfer: load job
// superseded"). Two workers on one login kill each other's jobs, so a worker holds this while it is on the screen.
export function acquireTransferScreenLock(): Promise<() => void> {
    return acquireFileLock('transfer-screen', 600_000);
}

/** Waits for the lock and returns its release. Prefer {@link withFileLock}; this is for a hold that spans several calls. */
export async function acquireFileLock(name: string, staleMs = STALE_MS): Promise<() => void> {
    const dir = lockDir(name);
    for (;;) {
        try {
            mkdirSync(dir);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            try {
                // A holder killed mid-run never releases; its lock ages out. The rename is atomic, so
                // two waiters that both see it stale cannot both clear it and end up holding together.
                if (Date.now() - statSync(dir).mtimeMs > staleMs) {
                    const stale = `${dir}.stale-${String(process.pid)}`;
                    renameSync(dir, stale);
                    rmSync(stale, { recursive: true, force: true });
                }
            } catch {
                // released, or claimed by the other waiter, between the two calls
            }
            await sleep(POLL_MS);
        }
    }
    return () => rmSync(dir, { recursive: true, force: true });
}

export async function withFileLock<T>(name: string, fn: () => Promise<T>, staleMs = STALE_MS): Promise<T> {
    const release = await acquireFileLock(name, staleMs);
    try {
        return await fn();
    } finally {
        release();
    }
}
