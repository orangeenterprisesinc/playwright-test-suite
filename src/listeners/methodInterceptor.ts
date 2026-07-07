/**
 * @fileoverview Runner list-based test filter (method interceptor).
 *
 * Loads a JSON runner list file that controls which tests are active. Tests marked
 * with `execute: "yes"` are considered active; all others are skipped. If no runner
 * list exists, all tests run by default.
 *
 * @module listeners/methodInterceptor
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { isTestActive, getGrepPattern } from '../listeners/methodInterceptor';
 *
 * if (isTestActive('loginTest')) {
 *   // run the test
 * }
 * const grep = getGrepPattern(); // 'loginTest|searchTest|...'
 * ```
 */
import fs from 'fs';
import {Logger} from '../utils/logger';
import {FrameworkConstants} from '../constants/frameworkConstants';

const logger = new Logger('MethodInterceptor');

/**
 * A single entry from the runner list JSON file.
 *
 * @interface RunnerListEntry
 * @property {string} testcasename - Name of the test case
 * @property {string} [testdescription] - Optional test description
 * @property {string} execute - Whether to execute this test (`'yes'` or `'no'`)
 * @property {number} [priority] - Execution priority
 * @property {number} [count] - Invocation count (from Selenium framework compat)
 */
export interface RunnerListEntry {
    testcasename: string;
    testdescription?: string;
    execute: string; // "yes" | "no"
    priority?: number;
    count?: number; // invocationCount from Selenium framework
    [key: string]: unknown; // allow extra metadata
}

/** @private Nested JSON structure of the runner list file. */
type RunnerListJson = Record<string, Record<string, RunnerListEntry[]>>;

/** @private Cached list of active tests. */
let activeTests: RunnerListEntry[] | null = null;
/** @private Cached full runner list. */
let fullRunnerList: RunnerListEntry[] | null = null;

/**
 * Loads and parses the runner list JSON file, caching the result.
 * @returns {RunnerListEntry[]} All entries from the runner list (may be empty)
 * @private
 */
function loadRunnerList(): RunnerListEntry[] {
    if (fullRunnerList !== null) return fullRunnerList;

    const runnerPath = FrameworkConstants.RUNNER_LIST_PATH;

    if (!fs.existsSync(runnerPath)) {
        logger.warn(`Runner list not found at ${runnerPath} — all tests will be active`);
        fullRunnerList = [];
        return fullRunnerList;
    }

    try {
        const raw = JSON.parse(fs.readFileSync(runnerPath, 'utf-8')) as RunnerListJson;

        // Flatten nested structure: { "runmanager": { "testcaselist": [...], ... } }
        const entries: RunnerListEntry[] = [];
        for (const category of Object.values(raw)) {
            for (const testArray of Object.values(category)) {
                if (Array.isArray(testArray)) {
                    entries.push(...testArray);
                }
            }
        }

        fullRunnerList = entries;
        logger.info(`Loaded ${entries.length} test entries from runner list`);
        return fullRunnerList;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to parse runner list: ${msg}`);
        fullRunnerList = [];
        return fullRunnerList;
    }
}

/**
 * Returns all test entries with `execute: "yes"` from the runner list.
 *
 * Results are cached after the first call. If no runner list exists, returns an empty array.
 *
 * @returns {RunnerListEntry[]} Active test entries
 */
export function getActiveTests(): RunnerListEntry[] {
    if (activeTests !== null) return activeTests;

    const all = loadRunnerList();
    activeTests = all.filter((entry) => entry.execute?.toLowerCase() === 'yes');

    logger.info(
        `Active tests: ${activeTests.length}/${all.length} — [${activeTests.map((t) => t.testcasename).join(', ')}]`,
    );
    return activeTests;
}

/**
 * Checks whether a test is active (should execute) based on the runner list.
 *
 * Returns `true` if the runner list is empty (no filtering), or if the test
 * is found with `execute: "yes"`.
 *
 * @param {string} testName - Test case name (case-insensitive)
 * @returns {boolean} `true` if the test should run
 */
export function isTestActive(testName: string): boolean {
    const active = getActiveTests();
    if (active.length === 0) return true; // no runner list → run everything
    return active.some((t) => t.testcasename.toLowerCase() === testName.toLowerCase());
}

/**
 * Returns the runner list configuration entry for a specific test.
 *
 * @param {string} testName - Test case name (case-insensitive)
 * @returns {RunnerListEntry | undefined} The matching entry, or `undefined`
 */
export function getTestConfig(testName: string): RunnerListEntry | undefined {
    return getActiveTests().find((t) => t.testcasename.toLowerCase() === testName.toLowerCase());
}

/**
 * Generates a pipe-separated grep pattern of all active test names.
 *
 * Can be used with Playwright's `--grep` CLI option to filter test execution.
 *
 * @returns {string} Grep pattern (e.g., `'loginTest|searchTest|checkoutTest'`), or empty string
 */
export function getGrepPattern(): string {
    const active = getActiveTests();
    if (active.length === 0) return '';
    return active.map((t) => t.testcasename).join('|');
}

/**
 * Clears the cached runner list, forcing a reload on the next call.
 */
export function resetRunnerListCache(): void {
    activeTests = null;
    fullRunnerList = null;
}