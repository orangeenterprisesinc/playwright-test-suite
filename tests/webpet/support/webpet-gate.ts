/**
 * Per-test run control for the migrated web-pet suite.
 *
 * The source specs carry no testCaseId annotations, and many tests are
 * generated in loops (one test() callsite → N tests), so the framework's
 * annotation-based runnerManager gate cannot apply without invasive edits.
 * Instead every test is identified by its stable (spec file + full title
 * path) key and matched against a generated row in
 * src/data/webpet/webpetRunnerManager.json (one row per test, WP-#### ids).
 *
 * Semantics — deliberately FAIL-OPEN so gating can never eat the suite:
 *   - runner file missing/unreadable  → everything runs, warning logged
 *   - test key not found in the file  → the test runs (new/renamed test;
 *     `npm run webpet:runner:sync` reconciles the file)
 *   - row.enabled === false           → the test is skipped with a reason
 *     naming the WP id and the runner file
 *
 * Rows default to enabled=true, so the suite's own conditional skips (module
 * gating, S3 availability, opt-in equiv flags…) still fire with their
 * ORIGINAL reasons — this gate only adds a skip when a human flips a row off.
 *
 * Keys are produced identically by scripts/webpet-runner-sync.js; the titlePath
 * filter mirrors src/utils/allureLabels.ts deriveStory().
 */
import type { TestInfo } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { join, relative, sep } from 'path';

export interface WebpetRunnerRow {
    /** WP-#### — stable once assigned by webpet-runner-sync.js. */
    id: string;
    /** Spec path relative to tests/webpet, posix separators. */
    file: string;
    /** Describe titles + test title, ' > '-joined (loop-generated tests are unique per iteration). */
    title: string;
    enabled: boolean;
    /** Reserved for the gradual POM conversion — empty until a module adopts annotations. */
    testCaseId?: string;
    notes?: string;
    /** Set by webpet-runner-sync.js when the test no longer exists; informational. */
    stale?: boolean;
}

interface WebpetRunnerFile {
    metadata?: { generatedAt?: string; total?: number };
    testCases?: WebpetRunnerRow[];
}

const RUNNER_FILE = join(
    __dirname,
    '..',
    '..',
    '..',
    'src',
    'data',
    'webpet',
    'webpetRunnerManager.json',
);
const WEBPET_ROOT = join(__dirname, '..');

/** `undefined` = not loaded yet; `null` = no usable file (fail-open). */
let cache: Map<string, WebpetRunnerRow> | null | undefined;

function loadRows(): Map<string, WebpetRunnerRow> | null {
    if (cache !== undefined) return cache;
    if (!existsSync(RUNNER_FILE)) {
        cache = null;
        return cache;
    }
    try {
        const parsed = JSON.parse(readFileSync(RUNNER_FILE, 'utf-8')) as WebpetRunnerFile;
        cache = new Map((parsed.testCases ?? []).map((r) => [`${r.file}::${r.title}`, r]));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(
            `[webpet-gate] Could not read ${RUNNER_FILE} (${msg}) — running ungated (fail-open).`,
        );
        cache = null;
    }
    return cache;
}

/** Stable identity key for a test: '<file>::<describes > title>'. */
export function webpetRunnerKey(testInfo: TestInfo): string {
    const file = relative(WEBPET_ROOT, testInfo.file).split(sep).join('/');
    // titlePath includes the project name and the spec-file entry — drop both
    // (same defensive filter as allureLabels.deriveStory) leaving describes + title.
    const titles = testInfo.titlePath.filter(
        (t) => t && t !== testInfo.project.name && !t.endsWith('.ts'),
    );
    return `${file}::${titles.join(' > ')}`;
}

/**
 * Applies the runner decision for the current test. Called from the `_webpetGate`
 * auto fixture wired into tests/webpet/fixtures.ts and support/clean-fixtures.ts.
 */
export function applyWebpetGate(testInfo: TestInfo): void {
    const rows = loadRows();
    if (!rows) return;
    const row = rows.get(webpetRunnerKey(testInfo));
    if (!row) return; // new/renamed test — run it; the sync script reconciles.
    testInfo.annotations.push({ type: 'webpet-runner-id', description: row.id });
    if (row.enabled === false) {
        testInfo.skip(
            true,
            `Disabled in webpet runner (${row.id}, enabled=false) — src/data/webpet/webpetRunnerManager.json`,
        );
    }
}
