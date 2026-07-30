/**
 * @fileoverview Central type definitions for the Playwright POM Framework.
 *
 * Only types with a real import site elsewhere in the codebase live here.
 * Types were pruned to just this set (previously included unused
 * User/Auth/API-fixture/Excel/accessibility interfaces with zero callers) —
 * re-add a type here only once something actually imports it.
 *
 * - **Environment Configuration**: {@link Environment}, {@link EnvironmentConfig}
 * - **Test Data Management**: {@link TestCaseData}, {@link DataProviderResult}, {@link RunnerData}
 * - **Data Reader Abstraction**: {@link IDataReader}, {@link DataSourceType}
 * - **Network**: {@link MockRoute}
 * - **Logging**: {@link LogLevel}, {@link LogEntry}
 * - **Visual Testing**: {@link ScreenshotOptions}
 *
 * @module types
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import type { EnvironmentConfig, TestCaseData, IDataReader } from '../types';
 *
 * const config: EnvironmentConfig = { name: 'dev', appUrl: 'http://localhost', apiUrl: 'http://api', timeout: 30000, retries: 2 };
 * ```
 */
import type { Locator } from '@playwright/test';
import type { ModuleRequirement } from '../data/shared/modules';
import type { SegmentRequirement } from '../data/shared/segments';

/**
 * Supported deployment environments for the application.
 *
 * - `'local'` — Local development stack (http://localhost:3000)
 * - `'dev'` — Development environment
 * - `'qa'` — QA environment
 *
 * @typedef {('local' | 'dev' | 'qa')} Environment
 */
export type Environment = 'local' | 'dev' | 'qa';

/**
 * Configuration settings for a specific deployment environment.
 *
 * @interface EnvironmentConfig
 * @property {Environment} name - The environment identifier
 * @property {string} appUrl - Base URL for the web application (e.g., `'https://app.staging.example.com'`)
 * @property {string} apiUrl - Base URL for the API server (e.g., `'https://api.staging.example.com'`)
 * @property {number} timeout - Default timeout in milliseconds for operations
 * @property {number} retries - Number of retry attempts for flaky operations
 *
 * @example
 * ```typescript
 * const stagingConfig: EnvironmentConfig = {
 *   name: 'stag',
 *   appUrl: 'https://app.staging.example.com',
 *   apiUrl: 'https://api.staging.example.com',
 *   timeout: 30000,
 *   retries: 2,
 * };
 * ```
 */
export interface EnvironmentConfig {
    name: Environment;
    appUrl: string;
    apiUrl: string;
    timeout: number;
    retries: number;
}

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
 * Options for taking and comparing screenshots.
 *
 * @interface ScreenshotOptions
 * @property {boolean} [fullPage] - Whether to capture the full scrollable page
 * @property {{ x: number; y: number; width: number; height: number }} [clip] - Specific region to capture
 * @property {Locator[]} [mask] - Elements to mask (hide) in the screenshot
 * @property {number} [maxDiffPixels] - Maximum allowed pixel difference for visual comparison
 * @property {number} [threshold] - Per-pixel color threshold (0–1) for visual comparison
 */
export interface ScreenshotOptions {
    fullPage?: boolean;
    clip?: { x: number; y: number; width: number; height: number };
    mask?: Locator[];
    maxDiffPixels?: number;
    threshold?: number;
}

/**
 * Configuration for mocking a network route during testing.
 *
 * @interface MockRoute
 * @property {string | RegExp} url - URL pattern to intercept
 * @property {string} [method] - HTTP method to match (e.g., `'GET'`, `'POST'`)
 * @property {number} [status] - HTTP status code for the mocked response (default: 200)
 * @property {unknown} [body] - Response body (will be JSON-stringified if not a string)
 * @property {Record<string, string>} [headers] - Custom response headers
 *
 * @example
 * ```typescript
 * const route: MockRoute = {
 *   url: '/api/users',
 *   method: 'GET',
 *   status: 200,
 *   body: [{ id: 1, name: 'Test User' }],
 * };
 * ```
 */
export interface MockRoute {
    url: string | RegExp;
    method?: string;
    status?: number;
    body?: unknown;
    headers?: Record<string, string>;
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
 * Test category — maps a runner row to its `tests/` folder.
 *
 * - `'ui'` — UI end-to-end tests (`tests/ui/`)
 * - `'api'` — API-only tests (`tests/api/`)
 * - `'workflow'` — UI + API hybrid tests (`tests/workflow/`)
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
 *   means no test exists at all. `scripts/check-runner.js` keeps the stricter
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
