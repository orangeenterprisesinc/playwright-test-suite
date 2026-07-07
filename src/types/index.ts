/**
 * @fileoverview Central type definitions for the Playwright POM Framework.
 *
 * This module contains all shared TypeScript interfaces, type aliases, and contracts
 * used throughout the framework. Types are organized into the following categories:
 *
 * - **User & Authentication**: {@link User}, {@link UserRole}, {@link AuthFixture}
 * - **Environment Configuration**: {@link Environment}, {@link EnvironmentConfig}
 * - **Test Data Management**: {@link TestData}, {@link TestCaseData}, {@link UserTestData},
 *   {@link ApiTestData}, {@link TestDataRow}, {@link DataProviderResult}, {@link RunnerData}
 * - **API Testing**: {@link ApiResponse}, {@link ApiError}, {@link ApiFixture}, {@link MockRoute}
 * - **Page & Component Contracts**: {@link PageObjectOptions}, {@link ComponentOptions}
 * - **Logging**: {@link LogLevel}, {@link LogEntry}
 * - **Accessibility**: {@link A11yViolation}, {@link A11yNode}, {@link AccessibilitySnapshot}, {@link DiscoveredElement}
 * - **Visual Testing**: {@link ScreenshotOptions}
 * - **Data Reader Abstraction**: {@link IDataReader}, {@link DataSourceType}
 *
 * @module types
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import type { User, EnvironmentConfig, TestData, IDataReader } from '../types';
 *
 * const user: User = { username: 'admin', password: 'secret', role: 'admin' };
 * const config: EnvironmentConfig = { name: 'dev', appUrl: 'http://localhost', apiUrl: 'http://api', timeout: 30000, retries: 2 };
 * ```
 */
import type {APIRequestContext, BrowserContext, Locator, Page} from "@playwright/test";

/**
 * Represents a user in the system with authentication credentials and profile information.
 *
 * @interface User
 * @property {string} username - The user's login username
 * @property {string} password - The user's login password
 * @property {string} [email] - Optional email address
 * @property {string} [firstName] - Optional first name
 * @property {string} [lastName] - Optional last name
 * @property {UserRole} [role] - Optional role assignment (provider, nurse, or admin)
 *
 * @example
 * ```typescript
 * const adminUser: User = {
 *   username: 'admin@example.com',
 *   password: 'securePassword123',
 *   email: 'admin@example.com',
 *   firstName: 'John',
 *   lastName: 'Doe',
 *   role: 'admin',
 * };
 * ```
 */
export interface User {
    username: string;
    password: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: UserRole;
}

/**
 * Available user roles in the application.
 *
 * - `'provider'` — Healthcare provider role
 * - `'nurse'` — Nursing staff role
 * - `'admin'` — Administrator role with full access
 *
 * @typedef {('provider' | 'nurse' | 'admin')} UserRole
 */
export type UserRole = 'provider' | 'nurse' | 'admin';

/**
 * Supported deployment environments for the application.
 *
 * - `'dev'` — Development environment
 * - `'qe'` — Quality Engineering / QA environment
 * - `'stag'` — Staging / Pre-production environment
 * - `'prod'` — Production environment
 *
 * @typedef {('dev' | 'qe' | 'stag' | 'prod')} Environment
 */
export type Environment = 'dev' | 'qe' | 'stag' | 'prod';

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
 * Generic wrapper for test data with metadata.
 *
 * @interface TestData
 * @template T - The type of the test data payload (defaults to `unknown`)
 * @property {string} id - Unique identifier for the test data entry
 * @property {string} name - Human-readable name or description
 * @property {T} data - The actual test data payload
 * @property {string[]} [tags] - Optional tags for filtering and categorization
 *
 * @example
 * ```typescript
 * const loginData: TestData<{ email: string; password: string }> = {
 *   id: 'TC001',
 *   name: 'Valid Login',
 *   data: { email: 'user@test.com', password: 'pass123' },
 *   tags: ['smoke', 'login'],
 * };
 * ```
 */
export interface TestData<T = unknown> {
    id: string;
    name: string;
    data: T;
    tags?: string[];
}

/**
 * Typed API response wrapper with status, headers, and parsed body.
 *
 * @interface ApiResponse
 * @template T - The type of the response body (defaults to `unknown`)
 * @property {number} status - HTTP status code (e.g., 200, 404, 500)
 * @property {string} statusText - HTTP status text (e.g., `'OK'`, `'Not Found'`)
 * @property {T} data - The parsed response body
 * @property {Record<string, string>} headers - Response headers as key-value pairs
 *
 * @example
 * ```typescript
 * const response: ApiResponse<{ id: number; name: string }> = {
 *   status: 200,
 *   statusText: 'OK',
 *   data: { id: 1, name: 'Test Item' },
 *   headers: { 'content-type': 'application/json' },
 * };
 * ```
 */
export interface ApiResponse<T = unknown> {
    status: number;
    statusText: string;
    data: T;
    headers: Record<string, string>;
}

/**
 * Represents an API error response.
 *
 * @interface ApiError
 * @property {number} status - HTTP status code of the error
 * @property {string} message - Human-readable error message
 * @property {string} [code] - Optional application-specific error code
 * @property {unknown} [details] - Optional additional error details
 *
 * @example
 * ```typescript
 * const error: ApiError = {
 *   status: 422,
 *   message: 'Validation failed',
 *   code: 'VALIDATION_ERROR',
 *   details: { field: 'email', reason: 'Invalid format' },
 * };
 * ```
 */
export interface ApiError {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
}

/**
 * Options for initializing a Page Object.
 *
 * @interface PageObjectOptions
 * @property {Page} page - The Playwright Page instance
 * @property {BrowserContext} [context] - Optional browser context for multi-tab scenarios
 * @property {string} [baseUrl] - Optional base URL override for the page object
 *
 * @example
 * ```typescript
 * const options: PageObjectOptions = {
 *   page: await browser.newPage(),
 *   baseUrl: 'https://example.com',
 * };
 * ```
 */
export interface PageObjectOptions {
    page: Page;
    context?: BrowserContext;
    baseUrl?: string;
}

/**
 * Options for initializing a UI component.
 *
 * @interface ComponentOptions
 * @property {Page} page - The Playwright Page instance
 * @property {string} [rootSelector] - Optional CSS selector for the component's root element
 *
 * @example
 * ```typescript
 * const componentOpts: ComponentOptions = {
 *   page,
 *   rootSelector: '[data-testid="modal-dialog"]',
 * };
 * ```
 */
export interface ComponentOptions {
    page: Page;
    rootSelector?: string;
}

/**
 * Fixture providing an authenticated page and its associated context and user.
 *
 * @interface AuthFixture
 * @property {Page} authenticatedPage - A Playwright Page that is already logged in
 * @property {BrowserContext} authContext - The browser context containing auth cookies/state
 * @property {User} user - The user credentials used for authentication
 */
export interface AuthFixture {
    authenticatedPage: Page;
    authContext: BrowserContext;
    user: User;
}

/**
 * Fixture providing API testing context and base URL.
 *
 * @interface ApiFixture
 * @property {APIRequestContext} apiContext - Playwright API request context for HTTP calls
 * @property {string} apiBaseUrl - Base URL for API requests
 */
export interface ApiFixture {
    apiContext: APIRequestContext;
    apiBaseUrl: string;
}

/**
 * Composite fixture combining auth, API, and test data fixtures.
 *
 * @interface TestFixtures
 * @property {AuthFixture} auth - Authentication fixture
 * @property {ApiFixture} api - API testing fixture
 * @property {TestDataManager} testData - Test data management fixture
 */
export interface TestFixtures {
    auth: AuthFixture;
    api: ApiFixture;
    testData: TestDataManager;
}

/**
 * Contract for managing test users and generating unique identifiers.
 *
 * @interface TestDataManager
 *
 * @example
 * ```typescript
 * const manager: TestDataManager = {
 *   getUser: (role) => ({ username: 'admin', password: 'pass', role: role ?? 'admin' }),
 *   generateUniqueId: () => `test-${Date.now()}`,
 * };
 * ```
 */
export interface TestDataManager {
    /**
     * Retrieves a user with the specified role.
     * @param {UserRole} [role] - The desired user role; returns a default user if omitted
     * @returns {User} A user object matching the requested role
     */
    getUser(role?: UserRole): User;

    /**
     * Generates a unique identifier for test data isolation.
     * @returns {string} A unique string identifier
     */
    generateUniqueId(): string;
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
 * Represents an accessibility (a11y) violation detected on a page.
 *
 * @interface A11yViolation
 * @property {string} id - Rule identifier (e.g., `'color-contrast'`, `'image-alt'`)
 * @property {('minor' | 'moderate' | 'serious' | 'critical')} impact - Severity of the violation
 * @property {string} description - Detailed description of the violation
 * @property {string} help - Short description of how to fix the issue
 * @property {string} helpUrl - URL to documentation about the rule
 * @property {A11yNode[]} nodes - DOM nodes where the violation was detected
 */
export interface A11yViolation {
    id: string;
    impact: 'minor' | 'moderate' | 'serious' | 'critical';
    description: string;
    help: string;
    helpUrl: string;
    nodes: A11yNode[];
}

/**
 * A DOM node associated with an accessibility violation.
 *
 * @interface A11yNode
 * @property {string} html - The outer HTML of the offending element
 * @property {string[]} target - CSS selectors identifying the element
 * @property {string} [failureSummary] - Summary of what checks failed
 */
export interface A11yNode {
    html: string;
    target: string[];
    failureSummary?: string;
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
 * - `'excel'` — Excel (.xlsx) file data source
 * - `'db'` — SQLite database data source
 *
 * @typedef {('json' | 'csv' | 'excel' | 'db')} DataSourceType
 */
export type DataSourceType = 'json' | 'csv' | 'excel' | 'db';


/**
 * Data structure for a general-purpose test case driven by external data files.
 *
 * Used primarily with CSV, Excel, or database data sources where each row
 * represents a test case.
 *
 * @interface TestCaseData
 * @property {string} id - Unique test case identifier (e.g., `'TC001'`)
 * @property {string} testName - Machine-friendly test name
 * @property {string} testTitle - Human-readable test title
 * @property {string} [testDescription] - Optional detailed description
 * @property {boolean} shouldComplete - Whether the test case is expected to complete successfully
 * @property {number} expectedCount - Expected count for assertion validation
 * @property {string[]} [tags] - Optional tags for filtering (e.g., `['smoke', 'regression']`)
 * @property {boolean} enabled - Whether this test case should be executed
 *
 * @example
 * ```typescript
 * const testCase: TestCaseData = {
 *   id: 'TC001',
 *   testName: 'searchProducts',
 *   testTitle: 'Search for products by keyword',
 *   testDescription: 'Verify product search returns relevant results',
 *   shouldComplete: true,
 *   expectedCount: 5,
 *   tags: ['smoke', 'search'],
 *   enabled: true,
 * };
 * ```
 */
export interface TestCaseData {
    id: string;
    testName: string;
    testTitle: string;
    testDescription?: string;
    shouldComplete: boolean;
    expectedCount: number;
    tags?: string[];
    enabled: boolean;
}

/**
 * Test data structure for user authentication test scenarios.
 *
 * @interface UserTestData
 * @property {string} id - Unique test case identifier
 * @property {string} testName - Test case name
 * @property {string} username - Username to use for login
 * @property {string} password - Password to use for login
 * @property {string} [email] - Optional email address
 * @property {UserRole} role - The user's role in the system
 * @property {('success' | 'failure')} expectedResult - Expected outcome of the login attempt
 * @property {string} [errorMessage] - Expected error message for failure scenarios
 * @property {boolean} enabled - Whether this test case is active
 *
 * @example
 * ```typescript
 * const loginTest: UserTestData = {
 *   id: 'AUTH001',
 *   testName: 'invalidPasswordLogin',
 *   username: 'admin@test.com',
 *   password: 'wrongpassword',
 *   role: 'admin',
 *   expectedResult: 'failure',
 *   errorMessage: 'Invalid credentials',
 *   enabled: true,
 * };
 * ```
 */
export interface UserTestData {
    id: string;
    testName: string;
    username: string;
    password: string;
    email?: string;
    role: UserRole;
    expectedResult: 'success' | 'failure';
    errorMessage?: string;
    enabled: boolean;
}

/**
 * Test data structure for API endpoint test scenarios.
 *
 * @interface ApiTestData
 * @property {string} id - Unique test case identifier
 * @property {string} testName - Test case name
 * @property {string} endpoint - API endpoint path (e.g., `'/api/users'`)
 * @property {('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')} method - HTTP method
 * @property {Record<string, unknown>} [requestBody] - Optional request body for POST/PUT/PATCH
 * @property {number} expectedStatus - Expected HTTP status code
 * @property {string[]} [expectedResponseKeys] - Keys expected in the response body
 * @property {Record<string, string>} [headers] - Custom request headers
 * @property {boolean} enabled - Whether this test case is active
 *
 * @example
 * ```typescript
 * const apiTest: ApiTestData = {
 *   id: 'API001',
 *   testName: 'createUser',
 *   endpoint: '/api/users',
 *   method: 'POST',
 *   requestBody: { name: 'New User', email: 'new@test.com' },
 *   expectedStatus: 201,
 *   expectedResponseKeys: ['id', 'name', 'email'],
 *   enabled: true,
 * };
 * ```
 */
export interface ApiTestData {
    id: string;
    testName: string;
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    requestBody?: Record<string, unknown>;
    expectedStatus: number;
    expectedResponseKeys?: string[];
    headers?: Record<string, string>;
    enabled: boolean;
}

/**
 * Generic test data row with a typed payload and metadata.
 *
 * @interface TestDataRow
 * @template T - The type of the data payload (defaults to `unknown`)
 * @property {string} id - Unique row identifier
 * @property {string} testName - Associated test name
 * @property {T} data - The actual test data payload
 * @property {boolean} enabled - Whether this row is active for testing
 * @property {string[]} [tags] - Optional categorization tags
 */
export interface TestDataRow<T = unknown> {
    id: string;
    testName: string;
    data: T;
    enabled: boolean;
    tags?: string[];
}

/**
 * Contract for reading test data from any supported source (JSON, CSV, Excel, DB).
 *
 * All data reader implementations (e.g., {@link JsonDataReader}, {@link CsvDataReader},
 * {@link ExcelDataReader}, {@link DatabaseDataReader}) must implement this interface.
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
 * Represents a node in an accessibility tree snapshot.
 *
 * @interface AccessibilitySnapshot
 * @property {string} role - ARIA role of the element (e.g., `'button'`, `'textbox'`)
 * @property {string} name - Accessible name of the element
 * @property {string} [value] - Current value (e.g., text input value)
 * @property {string} [description] - Accessible description
 * @property {AccessibilitySnapshot[]} [children] - Child nodes in the accessibility tree
 */
export interface AccessibilitySnapshot {
    role: string;
    name: string;
    value?: string;
    description?: string;
    children?: AccessibilitySnapshot[];
}

/**
 * Represents a discovered interactive or identifiable element on a page.
 *
 * @interface DiscoveredElement
 * @property {string} role - ARIA role of the element
 * @property {string} name - Accessible name or label text
 * @property {string} locator - Playwright-compatible locator string
 * @property {boolean} isInteractive - Whether the element is interactive (button, input, etc.)
 * @property {{ x: number; y: number; width: number; height: number }} [boundingBox] - Element's position and dimensions
 */
export interface DiscoveredElement {
    role: string;
    name: string;
    locator: string;
    isInteractive: boolean;
    boundingBox?: { x: number; y: number; width: number; height: number };
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