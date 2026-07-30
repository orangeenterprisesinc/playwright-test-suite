/**
 * @fileoverview Central type definitions for the Playwright POM Framework.
 *
 * Only types with a real import site elsewhere in the codebase live here.
 * Types were pruned to just this set (previously included unused
 * User/Auth/API-fixture/Excel/accessibility interfaces with zero callers) —
 * re-add a type here only once something actually imports it.
 *
 * - **Test Data Management**: {@link TestCaseData}, {@link DataProviderResult}, {@link RunnerData}
 * - **Data Reader Abstraction**: {@link IDataReader}, {@link DataSourceType}
 * - **Logging**: {@link LogLevel}, {@link LogEntry}
 *
 * @module types
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import type { TestCaseData, IDataReader } from '../types';
 * ```
 */
import type { ModuleRequirement } from '../data/static/shared/modules';
import type { SegmentRequirement } from '../data/static/shared/segments';

/**
 * Supported log severity levels, ordered from least to most severe.
 *
 * - `'debug'` — Detailed diagnostic information
 * - `'info'` — General informational messages
 * - `'warn'` — Warning conditions that may need attention
 * - `'error'` — Error events that might still allow the test to continue
 * - `'trace'` — Very detailed tracing information
 *
 * @typedef {('debug' | 'info' | 'warn' | 'error' | 'trace')} LogLevel
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

/**
 * A structured log entry with timestamp, level, message, and optional context.
 *
 * @interface LogEntry
 * @property {Date} timestamp - When the log entry was created
 * @property {LogLevel} level - Severity level of the log entry
 * @property {string} message - The log message
 * @property {Record<string, unknown>} [context] - Optional contextual data (e.g., request params, error details)
 */
export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
}

/**
 * Supported data source types for test data providers.
 *
 * - `'json'` — JSON file data source
 * - `'csv'` — CSV file data source
 *
 * @typedef {('json' | 'csv')} DataSourceType
 */
export type DataSourceType = 'json' | 'csv';

/**
 * Test category — mirrors the catalog's `surface` field and maps a runner row to
 * its `tests/` folder. Three categories, **two** folders: the folder boundary is a
 * runtime one (it picks the Playwright project), and only `api` differs there.
 *
 * - `'ui'` — browser-driven tests (`tests/web/`)
 * - `'workflow'` — UI + API (+ DB) hybrids; act in the UI, verify through the API.
 *   Needs the browser and `auth-setup`, so it lives in `tests/web/` too
 * - `'api'` — API-only, browserless (`tests/api/`)
 *
 * The mapping is enforced by `CATEGORY_FOLDER` in `scripts/runner/check.js`.
 *
 * @typedef {('ui' | 'api' | 'workflow')} TestCategory
 */
export type TestCategory = 'ui' | 'api' | 'workflow';


/**
 * Lifecycle of a runner row, mirroring the Workflow Catalog's own `Status` field
 * and extending it with the two states that only exist once automation starts.
 *
 * - `'draft'` — reserved from the catalog; no plan, no spec yet
 * - `'specced'` — a plan exists under `specs/`
 * - `'ticketed'` — build or validation work is cut in Jira
 * - `'automated'` — a spec exists and is bound to this row
 * - `'lifted'` — **web-pet only**: the test exists and runs, but has not yet been
 *   converted to this framework's conventions. Distinct from `'draft'`, which
 *   means no test exists at all. `scripts/runner/check.js` keeps the stricter
 *   four-value list for journey rows, so this state cannot leak into them.
 *
 * @typedef {('draft' | 'specced' | 'ticketed' | 'automated' | 'lifted')} RunnerRowStatus
 */
export type RunnerRowStatus = 'draft' | 'specced' | 'ticketed' | 'automated' | 'lifted';

/**
 * One runner row: a single test case, bound to a spec by `id`.
 *
 * Rows are authored per journey under `src/data/runner/` and are the machine-
 * readable projection of the Workflow Catalog — `workflow`, `segments` and
 * `modules` come straight from the catalog entry, which is what lets a customer
 * scope be derived rather than hand-maintained (see `src/config/scope.ts`).
 *
 * A row with `enabled: false` and no spec is a **reservation** — the backlog
 * entry for a workflow the tester has not recorded yet. `npm run runner:check`
 * reports those as planned work rather than errors.
 *
 * @interface TestCaseData
 * @property {string} id - Row id, `<workflow>-<nnn>` (e.g. `'A1-001'`); joins catalog ▸ plan ▸ spec ▸ row
 * @property {TestCategory} category - Which suite the case belongs to (`ui` | `api` | `workflow`); must match the spec's folder
 * @property {string} [journey] - Catalog journey letter, `'A'`–`'F'` (absent for system rows such as login)
 * @property {string} [workflow] - Catalog workflow id, e.g. `'A1'` (absent for system rows)
 * @property {string} testName - Machine-friendly test name
 * @property {string} testTitle - Human-readable test title
 * @property {string} [testDescription] - Optional detailed description; becomes the Allure description
 * @property {SegmentRequirement[]} [segments] - Segments the workflow applies to, or `['all']`
 * @property {ModuleRequirement[]} [modules] - Licence modules the workflow requires, or `['core']`
 * @property {string[]} [tags] - Tags for reporting (e.g. `['smoke', 'regression']`)
 * @property {boolean} [demo] - Catalog's per-segment demo-candidate flag
 * @property {string} [jira] - Epic/issue key once work is cut
 * @property {RunnerRowStatus} [status] - Row lifecycle state
 * @property {boolean} enabled - Whether this test case should be executed
 * @property {boolean} [shouldComplete] - Legacy; retained for the original login rows, unused by specs
 * @property {number} [expectedCount] - Legacy; retained for the original login rows, unused by specs
 *
 * @example
 * ```typescript
 * const row: TestCaseData = {
 *   id: 'A1-001',
 *   category: 'ui',
 *   journey: 'A',
 *   workflow: 'A1',
 *   testName: 'createUserWithAllFields',
 *   testTitle: 'Create a user with all fields populated',
 *   segments: ['all'],
 *   modules: ['Windows', 'Network'],
 *   tags: ['smoke', 'regression'],
 *   status: 'automated',
 *   enabled: true,
 * };
 * ```
 */
export interface TestCaseData {
    id: string;
    category: TestCategory;
    journey?: string;
    workflow?: string;
    testName: string;
    testTitle: string;
    testDescription?: string;
    segments?: SegmentRequirement[];
    modules?: ModuleRequirement[];
    tags?: string[];
    demo?: boolean;
    jira?: string;
    status?: RunnerRowStatus;
    enabled: boolean;
    shouldComplete?: boolean;
    expectedCount?: number;
}

/**
 * One runner row for the migrated web-pet suite.
 *
 * A superset of {@link TestCaseData} — so it can be handed straight to
 * `evaluateScope()` and `applyAllureLabels()` — plus the columns that only make
 * sense for a lifted suite whose tests are identified structurally as well as by
 * id.
 *
 * Deliberately absent: `segments` / `modules` / `journey` / `workflow` / `demo`.
 * Those are Workflow Catalog concepts; filling them with plausible-looking
 * values would make `evaluateScope()` match nothing (a module name absent from
 * `workflow-catalog.json` never resolves) and would print a fabricated `Journey`
 * parameter into every Allure result. Leaving them undefined is what makes
 * `evaluateScope()` correctly treat every web-pet row as always-in-scope.
 *
 * @interface WebpetTestCaseData
 * @property {string} file - Spec path relative to `tests/webpet`, posix separators
 * @property {string} titlePath - Describe titles + test title, `' > '`-joined
 * @property {string} [caseKey] - Business key for a loop-generated test; drives `src/data/webpet/ids/`
 * @property {string} [module] - Feature area, seeded from the spec file name
 * @property {string} [notes] - Free-text triage note
 * @property {boolean} [stale] - The test no longer exists; the row is kept, never deleted
 */
export interface WebpetTestCaseData extends TestCaseData {
    file: string;
    titlePath: string;
    caseKey?: string;
    module?: string;
    notes?: string;
    stale?: boolean;
}

/**
 * Contract for reading test data from any supported source (currently JSON, CSV).
 *
 * All data reader implementations (e.g., {@link JsonDataReader}, {@link CsvDataReader})
 * must implement this interface.
 *
 * @interface IDataReader
 *
 * @example
 * ```typescript
 * class MyCustomReader implements IDataReader {
 *   async readAll<T>(): Promise<T[]> { ... }
 *   async readById<T extends { id: string }>(id: string): Promise<T | null> { ... }
 *   async readFiltered<T>(filter: Partial<T>): Promise<T[]> { ... }
 *   async readEnabled<T extends { enabled?: boolean }>(): Promise<T[]> { ... }
 *   async isAvailable(): Promise<boolean> { ... }
 * }
 * ```
 */
export interface IDataReader {
    /**
     * Reads all records from the data source.
     * @template T - The expected record type
     * @returns {Promise<T[]>} All records from the source
     */
    readAll<T>(): Promise<T[]>;

    /**
     * Reads a single record by its unique identifier.
     * @template T - The expected record type (must have an `id` field)
     * @param {string} id - The record identifier to search for
     * @returns {Promise<T | null>} The matching record, or `null` if not found
     */
    readById<T extends { id: string }>(id: string): Promise<T | null>;

    /**
     * Reads records matching the given filter criteria.
     * @template T - The expected record type
     * @param {Partial<T>} filter - Key-value pairs to match against records
     * @returns {Promise<T[]>} Records matching all filter criteria
     */
    readFiltered<T>(filter: Partial<T>): Promise<T[]>;

    /**
     * Reads only enabled records (where `enabled !== false`).
     * @template T - The expected record type (should have an optional `enabled` field)
     * @returns {Promise<T[]>} Only the enabled records
     */
    readEnabled<T extends { enabled?: boolean }>(): Promise<T[]>;

    /**
     * Checks whether the underlying data source is accessible.
     * @returns {Promise<boolean>} `true` if the source is available, `false` otherwise
     */
    isAvailable(): Promise<boolean>;
}

/**
 * Result returned by {@link DataProvider} after loading test data from a source.
 *
 * @interface DataProviderResult
 * @template T - The type of the loaded data records
 * @property {T[]} data - The loaded data records
 * @property {DataSourceType} source - The type of data source used
 * @property {string} filePath - Path to the source file or database
 * @property {Date} loadedAt - Timestamp of when the data was loaded
 * @property {number} totalCount - Total number of records in the source
 * @property {number} enabledCount - Number of records with `enabled !== false`
 *
 * @example
 * ```typescript
 * const result: DataProviderResult<TestCaseData> = {
 *   data: [...testCases],
 *   source: 'csv',
 *   filePath: 'test-data/login-tests.csv',
 *   loadedAt: new Date(),
 *   totalCount: 10,
 *   enabledCount: 8,
 * };
 * ```
 */
export interface DataProviderResult<T> {
    data: T[];
    source: DataSourceType;
    filePath: string;
    loadedAt: Date;
    totalCount: number;
    enabledCount: number;
}

/**
 * Wrapper for test data with metadata, suitable for serialization and runner consumption.
 *
 * Produced by {@link DataProvider.toRunnerData} for exporting test data
 * in a structured, self-describing format.
 *
 * @interface RunnerData
 * @template T - The type of individual test case records
 * @property {{ sourceType: DataSourceType; generatedAt: string; originalSource: string }} metadata - Generation metadata
 * @property {T[]} testCases - The test case records
 *
 * @example
 * ```typescript
 * const runnerData: RunnerData<TestCaseData> = {
 *   metadata: {
 *     sourceType: 'json',
 *     generatedAt: '2024-01-15T10:30:00.000Z',
 *     originalSource: 'test-data/tests.json',
 *   },
 *   testCases: [...testCases],
 * };
 * ```
 */
export interface RunnerData<T = unknown> {
    metadata: {
        sourceType: DataSourceType;
        generatedAt: string;
        originalSource: string;
    };
    testCases: T[];
}
