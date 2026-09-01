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
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

/** A structured log entry with timestamp, level, message, and optional context. */
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
 * - `'api'` — API-only / device export-import specs; same `tests/web/` folder
 *   (the separate `tests/api/` was retired 2026-08-26)
 *
 * The mapping is enforced by `CATEGORY_FOLDER` in `scripts/runner/check.js`.
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
 */
export interface IDataReader {
    /**
     * Reads all records from the data source.
     * @template T - The expected record type
     */
    readAll<T>(): Promise<T[]>;

    /**
     * Reads a single record by its unique identifier.
     * @template T - The expected record type (must have an `id` field)
     */
    readById<T extends { id: string }>(id: string): Promise<T | null>;

    /**
     * Reads records matching the given filter criteria.
     * @template T - The expected record type
     */
    readFiltered<T>(filter: Partial<T>): Promise<T[]>;

    /**
     * Reads only enabled records (where `enabled !== false`).
     * @template T - The expected record type (should have an optional `enabled` field)
     */
    readEnabled<T extends { enabled?: boolean }>(): Promise<T[]>;

    /** Checks whether the underlying data source is accessible. */
    isAvailable(): Promise<boolean>;
}

/**
 * Result returned by {@link DataProvider} after loading test data from a source.
 *
 * @template T - The type of the loaded data records
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
 * @template T - The type of individual test case records
 */
export interface RunnerData<T = unknown> {
    metadata: {
        sourceType: DataSourceType;
        generatedAt: string;
        originalSource: string;
    };
    testCases: T[];
}
