/**
 * @fileoverview Runner-row source for the developer-contribution lane.
 *
 * Same composition as `webpetRunnerSource.ts` — `MultiFileDataReader` over the
 * framework's own readers, pointed at `src/data/contrib/` — and for the same
 * reason: `DataProvider` is a process-wide singleton bound to
 * `src/data/runner/`, with no per-project way to repoint its directory. See
 * that file's header for the full argument; it applies verbatim here.
 *
 * ## Why there is no structural key
 *
 * The webpet index carries a second `file::titlePath` index because the lifted
 * suite arrived with hundreds of tests that had no `testCaseId` yet, and the
 * gate had to govern them without one. The contrib lane has no such history:
 * `contrib:runner:check` refuses a spec whose tests do not all carry an id, so
 * the id is the only identity this index needs.
 */
import { MultiFileDataReader } from '../readers/MultiFileDataReader';
import { getCurrentDataSourceType } from '../../config/dataSource.config';
import { CONTRIB_DATA_DIR } from '../../config/contribPaths';
import type { ContribTestCaseData } from '../../types';

export interface ContribRunnerIndex {
    byId: ReadonlyMap<string, ContribTestCaseData>;
    /** `false` when the row files are missing/unreadable. */
    available: boolean;
}

let cache: Promise<ContribRunnerIndex> | null = null;

/** Loads and indexes the contrib rows once per worker process. */
export function getContribRunnerIndex(): Promise<ContribRunnerIndex> {
    if (!cache) cache = build();
    return cache;
}

async function build(): Promise<ContribRunnerIndex> {
    const reader = new MultiFileDataReader(
        CONTRIB_DATA_DIR,
        getCurrentDataSourceType(),
        // Sheet key inside the JSON mirror; `scripts/contrib/runner-sync.js`
        // emits rows under `contribRunnerManager` to match.
        'contribRunnerManager',
    );

    if (!(await reader.isAvailable())) {
        return { byId: new Map(), available: false };
    }

    const rows = await reader.readAll<ContribTestCaseData>();
    const byId = new Map<string, ContribTestCaseData>();
    for (const row of rows) {
        if (row.id) byId.set(row.id, row);
    }

    return { byId, available: true };
}
