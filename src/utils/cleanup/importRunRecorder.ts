import fs from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import { WORKER_INDEX } from './runToken';

// One JSON line per import run this worker waited on, so the end-phase reconcile can
// quiesce them without probing the tenant. Playwright wipes artifacts/results before
// global setup, so the start phase never sees a stale file (see fixtureReconcile.ts).

const RESULTS_DIR = path.join('artifacts', 'results');
const FILE_RE = /^import-runs-w\d+\.jsonl$/;

export interface RecordedImportRun {
    runId: number;
    testId: string | null;
    at: string;
}

export function recordImportRun(runId: number, testInfo?: TestInfo): void {
    if (!Number.isFinite(runId) || runId <= 0) return;
    try {
        fs.mkdirSync(RESULTS_DIR, { recursive: true });
        fs.appendFileSync(
            path.join(RESULTS_DIR, `import-runs-w${WORKER_INDEX}.jsonl`),
            JSON.stringify({ runId, testId: testInfo?.testId ?? null, at: new Date().toISOString() }) + '\n',
        );
    } catch {
        /* best effort */
    }
}

export function readRecordedImportRuns(): RecordedImportRun[] {
    let names: string[];
    try {
        names = fs.readdirSync(RESULTS_DIR).filter((n) => FILE_RE.test(n));
    } catch {
        return [];
    }
    const seen = new Map<number, RecordedImportRun>();
    for (const name of names) {
        let text: string;
        try {
            text = fs.readFileSync(path.join(RESULTS_DIR, name), 'utf-8');
        } catch {
            continue;
        }
        for (const line of text.split('\n')) {
            if (!line.trim()) continue;
            try {
                const row = JSON.parse(line) as RecordedImportRun;
                if (Number.isFinite(row.runId)) seen.set(row.runId, row);
            } catch {
                /* skip a malformed line */
            }
        }
    }
    return [...seen.values()];
}
