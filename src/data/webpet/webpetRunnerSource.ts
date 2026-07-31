/**
 * @fileoverview Runner-row source for the migrated web-pet suite.
 *
 * Composes the framework's own reader stack — `MultiFileDataReader` over
 * `JsonDataReader`/`CsvDataReader`, the same `TypeCoercionHelper` rules, the
 * same pipe-delimited arrays, the same `TEST_DATA_SOURCE=json|csv` switch — but
 * pointed at `src/data/webpet/` instead of `src/data/runner/`.
 *
 * ## Why not `DataProvider.getInstance()`
 *
 * `dataSource.config.ts` resolves `runnerDir` from `RUNNER_DATA_DIR` **once,
 * from the process environment**, and `DataProvider` caches the resulting config
 * in a process-wide singleton whose `forSource()` escape hatch overrides only
 * the *type*, never the directory. So there is no per-project way to point it
 * here, and pointing it here globally would resolve every JOURNEY id against
 * this directory — every journey test would skip with "has no runner row", in
 * any invocation that materialises both project sets (`WEBPET=1 npx playwright
 * test`). Silent and total.
 *
 * `MultiFileDataReader`'s own parse cache is keyed `"${sourceType}:${dir}"`, so
 * two live row sources in one process are safe through this path.
 */
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import { MultiFileDataReader } from '../readers/MultiFileDataReader';
import { getCurrentDataSourceType } from '../../config/dataSource.config';
import { WEBPET_DATA_DIR, webpetSpecPath } from '../../config/webpetPaths';
import type { WebpetTestCaseData } from '../../types';

/**
 * Rows indexed both ways.
 *
 * `byId` serves converted specs (which carry a `testCaseId` annotation);
 * `byStructuralKey` serves specs a batch has not reached yet. Keeping both means
 * the gate self-tightens as each batch lands, with no cutover moment where the
 * suite is ungoverned.
 */
export interface WebpetRunnerIndex {
    byId: ReadonlyMap<string, WebpetTestCaseData>;
    byStructuralKey: ReadonlyMap<string, WebpetTestCaseData>;
    /** `false` when the row files are missing/unreadable — the gate then fails open. */
    available: boolean;
}

let cache: Promise<WebpetRunnerIndex> | null = null;

/** Loads and indexes the web-pet rows once per worker process. */
export function getWebpetRunnerIndex(): Promise<WebpetRunnerIndex> {
    if (!cache) cache = build();
    return cache;
}

/** Clears the cached index — for tests that rewrite the row files at runtime. */
export function resetWebpetRunnerCache(): void {
    cache = null;
}

async function build(): Promise<WebpetRunnerIndex> {
    const reader = new MultiFileDataReader(
        WEBPET_DATA_DIR,
        getCurrentDataSourceType(),
        // Sheet key inside the JSON mirror. `webpet-runner-sync.js` emits rows
        // under `runnerManager` precisely so this reader can find them.
        'runnerManager',
    );

    if (!(await reader.isAvailable())) {
        return { byId: new Map(), byStructuralKey: new Map(), available: false };
    }

    const rows = await reader.readAll<WebpetTestCaseData>();
    const byId = new Map<string, WebpetTestCaseData>();
    const byStructuralKey = new Map<string, WebpetTestCaseData>();

    for (const row of rows) {
        if (row.stale) continue; // kept in the file for audit, never gates a test
        if (row.id) byId.set(row.id, row);
        if (row.file && row.titlePath) byStructuralKey.set(`${row.file}::${row.titlePath}`, row);
    }

    return { byId, byStructuralKey, available: true };
}

/**
 * Structural identity for a test: `'<file relative to tests/webpet>::<describes > title>'`.
 *
 * The `titlePath` filter drops the project name and the spec-file entry, leaving
 * describes + title. Unchanged from the original gate so no row is orphaned by
 * the move, and mirrored exactly by `scripts/webpet/runner-sync.js` — the three
 * must agree or rows silently stop matching.
 */
export function webpetStructuralKey(testInfo: TestInfo): string {
    const file = webpetSpecPath(testInfo.file);
    const titles = testInfo.titlePath.filter(
        (title) => title && title !== testInfo.project.name && !title.endsWith('.ts'),
    );
    return `${file}::${titles.join(' > ')}`;
}

/** Unused by the runtime gate; exported for tooling that needs the directory. */
export const WEBPET_ROW_DIR: string = path.resolve(WEBPET_DATA_DIR);
