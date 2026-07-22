/**
 * @fileoverview Runner-list-based test filter (optional, NOT the primary control surface).
 *
 * Execution is controlled by the runnerManager `enabled` flag (resolved per
 * test in base.fixture via the `testCaseId` option / annotation) — that is the
 * single source of truth for whether a test runs. This runner list is a
 * separate, opt-in name-based filter that is NOT wired into the run path; it
 * ships as `{}` (no filtering, everything runs) and stays inert until you
 * populate `src/data/runnerList.json` and explicitly consume `getGrepPattern()`.
 *
 * Prefer toggling `enabled` in runnerManager.json / runnerManager.csv over this.
 *
 * @module listeners/methodInterceptor
 */
import fs from 'node:fs';
import { Logger } from '../utils/logger';
import { FrameworkConstants } from '../core/frameworkConstants';

const logger = new Logger('MethodInterceptor');

export interface RunnerListEntry {
    testcasename: string;
    testdescription?: string;
    execute: string; // "yes" | "no"
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

/** Whether a test should run. Returns `true` for everyone when the runner list is empty. */
export function isTestActive(testName: string): boolean {
    const active = getActiveTests();
    if (active.length === 0) return true;
    return active.some((t) => t.testcasename.toLowerCase() === testName.toLowerCase());
}

/** Pipe-separated grep pattern of active test names, for `--grep`. */
export function getGrepPattern(): string {
    const active = getActiveTests();
    return active.length === 0 ? '' : active.map((t) => t.testcasename).join('|');
}

/** Clears the cached runner list, forcing a reload on the next call. */
export function resetRunnerListCache(): void {
    activeTests = null;
    fullRunnerList = null;
}
