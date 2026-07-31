/**
 * @fileoverview Runtime override list — the final say on whether a test runs.
 *
 * Two layers decide execution, and this is the upper one:
 *
 *   1. **runnerManager.json / .csv** — the baseline. `enabled` per row is the
 *      normal way to turn a test on or off. Which file is read comes from
 *      `TEST_DATA_SOURCE` (json | csv); exactly one is active at a time.
 *   2. **runnerList.json (this module)** — a runtime *override*, matched on the
 *      runnerManager row `id` (the same id the spec declares via its
 *      `testCaseId` annotation). An entry here **wins outright** over
 *      runnerManager for that id.
 *
 * Override is per-entry, not a whitelist: an id listed here is decided here, and
 * any id *not* listed falls through to its runnerManager `enabled` flag. So
 * adding one entry cannot silently disable everything else.
 *
 * Because `execute: "yes"` overrides `enabled: false`, this list can resurrect a
 * test that was deliberately switched off. Keep it empty (`{}`) for normal runs —
 * that is the shipped state and means "runnerManager governs everything".
 *
 * Shape — category → group → entries:
 *
 * ```json
 * {
 *   "ui": {
 *     "userSetup": [
 *       { "id": "USR-001", "execute": "no" },
 *       { "id": "UI-001",  "execute": "yes" }
 *     ]
 *   }
 * }
 * ```
 */
import fs from 'node:fs';
import { Logger } from '../../utils/logger';
import { FrameworkConstants } from '../../core/frameworkConstants';

const logger = new Logger('MethodInterceptor');

export interface RunnerListEntry {
    /** runnerManager row id this entry governs, e.g. 'USR-001'. */
    id: string;
    /** `"yes"` to force the test to run, `"no"` to force it to skip. */
    execute: string;
    testdescription?: string;
    priority?: number;
    [key: string]: unknown;
}

type RunnerListJson = Record<string, Record<string, RunnerListEntry[]>>;

let activeTests: RunnerListEntry[] | null = null;
let fullRunnerList: RunnerListEntry[] | null = null;

function loadRunnerList(): RunnerListEntry[] {
    if (fullRunnerList !== null) return fullRunnerList;

    const runnerPath = FrameworkConstants.RUNNER_LIST_PATH;
    if (!fs.existsSync(runnerPath)) {
        fullRunnerList = [];
        return fullRunnerList;
    }

    try {
        const raw = JSON.parse(fs.readFileSync(runnerPath, 'utf-8')) as RunnerListJson;
        const entries: RunnerListEntry[] = [];
        for (const category of Object.values(raw)) {
            for (const testArray of Object.values(category)) {
                if (Array.isArray(testArray)) entries.push(...testArray);
            }
        }
        fullRunnerList = entries;
        return fullRunnerList;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to parse runner list: ${msg}`);
        fullRunnerList = [];
        return fullRunnerList;
    }
}

/** All entries with `execute: "yes"`. Cached after the first call. */
export function getActiveTests(): RunnerListEntry[] {
    if (activeTests !== null) return activeTests;
    activeTests = loadRunnerList().filter((entry) => entry.execute?.toLowerCase() === 'yes');
    return activeTests;
}

/**
 * The runner list's verdict for a runnerManager row id.
 *
 * Returns `true` to force the test to run, `false` to force it to skip, and
 * `null` when the list has no entry for this id — in which case the caller must
 * fall back to the runnerManager `enabled` flag. `null` is also returned for an
 * empty or missing runnerList.json, which is the normal shipped state.
 *
 * Replaces the previous name-based `isTestActive()` / `getGrepPattern()` pair:
 * matching on `id` keeps a single join key between spec annotation,
 * runnerManager row, and this list, and a `--grep` pattern was never viable
 * because ids do not appear in test titles.
 */
export function getRunnerListDecision(id: string): boolean | null {
    const entries = loadRunnerList();
    if (entries.length === 0) return null;

    const wanted = id.toLowerCase();
    const entry = entries.find((e) => String(e.id ?? '').toLowerCase() === wanted);
    if (!entry) return null;

    return String(entry.execute ?? '').toLowerCase() === 'yes';
}

/** Clears the cached runner list, forcing a reload on the next call. */
export function resetRunnerListCache(): void {
    activeTests = null;
    fullRunnerList = null;
}
