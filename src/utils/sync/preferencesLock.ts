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

function lockDir(): string {
    const tenant = createHash('sha1').update(process.env.API_URL || 'local').digest('hex').slice(0, 8);
    return join(tmpdir(), `pts-preferences-${tenant}.lock`);
}

export async function withPreferencesLock<T>(fn: () => Promise<T>): Promise<T> {
    const dir = lockDir();
    for (;;) {
        try {
            mkdirSync(dir);
            break;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            try {
                // A holder killed mid-run never releases; its lock ages out. The rename is atomic, so
                // two waiters that both see it stale cannot both clear it and end up holding together.
                if (Date.now() - statSync(dir).mtimeMs > STALE_MS) {
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
    try {
        return await fn();
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
