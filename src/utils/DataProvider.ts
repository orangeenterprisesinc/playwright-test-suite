/**
 * @fileoverview Singleton data provider that unifies access to JSON, CSV, Excel,
 * and SQLite data sources via the {@link IDataReader} abstraction.
 *
 * Also exposes {@link DataProvider.toRunnerData} for converting test data into
 * the `RunnerData` format (replacing the former RunnerManager class).
 *
 * @module utils/DataProvider
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { DataProvider } from '@utils/DataProvider';
 *
 * const provider = DataProvider.getInstance();
 * const { data, totalCount } = await provider.getTestData<MyTestCase>();
 * console.log(`Loaded ${totalCount} test cases`);
 *
 * // Switch source without mutating singleton
 * const csvProvider = DataProvider.forSource('csv');
 * const csvData = await csvProvider.getTestData<MyTestCase>();
 * ```
 */
import type {DataProviderResult, DataSourceType, IDataReader, RunnerData, TestCaseData} from '../types';
import {type DataSourceConfig, getDataSourceConfig} from '../config/dataSource.config';
import {CsvDataReader, DatabaseDataReader, ExcelDataReader, JsonDataReader} from './dataReaders';
import {Logger} from './logger';
import path from 'path';

/**
 * Singleton data provider that reads test data from multiple sources and
 * returns it in a uniform format.
 *
 * @class DataProvider
 *
 * @example
 * ```typescript
 * const provider = DataProvider.getInstance();
 * const enabled = await provider.getEnabledTestData<TodoItem>();
 * ```
 */
export class DataProvider {
    /** @private Singleton instance */
    private static instance: DataProvider;
    /** @private Logger for data provider operations */
    private readonly logger: Logger;
    /** @private Active data source configuration */
    private readonly config: DataSourceConfig;

    /**
     * Private constructor — use {@link getInstance} or {@link forSource}.
     * @param {DataSourceConfig} [configOverride] - Optional configuration override
     */
    private constructor(configOverride?: DataSourceConfig) {
        this.logger = new Logger('DataProvider');
        this.config = configOverride ?? getDataSourceConfig();
        this.logger.info(`Data source configured: ${this.config.type}`);
    }

    /**
     * Returns the shared singleton instance, creating it on the first call.
     *
     * When the data preprocessing pipeline has run (indicated by
     * `process.env.DATA_PREPROCESSED === 'true'`), the instance is
     * **forced to consume JSON** regardless of the original
     * `TEST_DATA_SOURCE` value.  This ensures every test reads from
     * the unified `runnerManager.json` generated during global setup.
     *
     * @returns {DataProvider} The singleton instance
     */
    static getInstance(): DataProvider {
        if (!DataProvider.instance) {
            if (process.env.DATA_PREPROCESSED === 'true') {
                const baseConfig = getDataSourceConfig();
                DataProvider.instance = new DataProvider({
                    ...baseConfig,
                    type: 'json',
                });
                DataProvider.instance.logger.info(
                    `Preprocessing active — forcing JSON reader ` +
                    `(original source: ${process.env.DATA_PREPROCESSED_SOURCE ?? 'unknown'})`,
                );
            } else {
                DataProvider.instance = new DataProvider();
            }
        }
        return DataProvider.instance;
    }

    /**
     * Returns a new DataProvider instance with the specified source type,
     * without mutating the shared singleton.
     */
    static forSource(sourceType: DataSourceType): DataProvider {
        const baseConfig = DataProvider.getInstance().config;
        return new DataProvider({ ...baseConfig, type: sourceType });
    }

    /**
     * Loads all test data from the configured (or specified) source.
     *
     * @template T - Shape of each test-data record
     * @param {DataSourceType} [sourceType] - Override the default source type
     * @returns {Promise<DataProviderResult<T>>} Wrapped result with data, counts, and metadata
     */
    async getTestData<T>(sourceType?: DataSourceType): Promise<DataProviderResult<T>> {
        const type = sourceType || this.config.type;
        const reader = await this.getReader(type);
        const filePath = this.getResolvedFilePath(type);

        this.logger.info(`Loading test data from ${type}: ${filePath}`);

        const allData = await reader.readAll<T>();
        const enabledData = await reader.readEnabled<T & { enabled?: boolean }>();

        return {
            data: allData,
            source: type,
            filePath,
            loadedAt: new Date(),
            totalCount: allData.length,
            enabledCount: enabledData.length,
        };
    }


    /**
     * Returns only test data records where `enabled !== false`.
     *
     * @template T - Record shape (must optionally include `enabled`)
     * @param {DataSourceType} [sourceType] - Override the default source type
     * @returns {Promise<T[]>} Array of enabled test records
     */
    async getEnabledTestData<T extends { enabled?: boolean }>(
        sourceType?: DataSourceType,
    ): Promise<T[]> {
        const reader = await this.getReader(sourceType);
        return reader.readEnabled<T>();
    }

    /**
     * Looks up a single test data record by its `id` field.
     *
     * @template T - Record shape (must include `id`)
     * @param {string} id - The record ID to look up
     * @param {DataSourceType} [sourceType] - Override the default source type
     * @returns {Promise<T | null>} The matching record, or `null`
     */
    async getTestDataById<T extends { id: string }>(
        id: string,
        sourceType?: DataSourceType,
    ): Promise<T | null> {
        const reader = await this.getReader(sourceType);
        return reader.readById<T>(id);
    }

    /**
     * Returns test data records matching all key-value pairs in the filter.
     *
     * @template T - Record shape
     * @param {Partial<T>} filter - Key-value pairs to match against
     * @param {DataSourceType} [sourceType] - Override the default source type
     * @returns {Promise<T[]>} Matching records
     */
    async getFilteredTestData<T>(filter: Partial<T>, sourceType?: DataSourceType): Promise<T[]> {
        const reader = await this.getReader(sourceType);
        return reader.readFiltered<T>(filter);
    }

    /**
     * Returns the active data source configuration.
     * @returns {DataSourceConfig} Current configuration
     */
    getConfig(): DataSourceConfig {
        return this.config;
    }


    /**
     * Returns the currently configured source type.
     * @returns {DataSourceType} The active data source type
     */
    getCurrentSourceType(): DataSourceType {
        return this.config.type;
    }


    /**
     * Checks whether the specified (or default) data source is accessible.
     *
     * @param {DataSourceType} [sourceType] - Source type to check
     * @returns {Promise<boolean>} `true` if the source file/database exists and is readable
     */
    async isSourceAvailable(sourceType?: DataSourceType): Promise<boolean> {
        const reader = await this.getReader(sourceType);
        return reader.isAvailable();
    }


    /**
     * Returns the appropriate reader for the given source type directly,
     * without an intermediate JSON conversion step.
     */
    private async getReader(sourceType?: DataSourceType): Promise<IDataReader> {
        const type = sourceType || this.config.type;
        return this.getDirectReader(type);
    }

    /**
     * Factory method that instantiates the appropriate {@link IDataReader} subclass.
     *
     * @param {DataSourceType} sourceType - Which reader to create
     * @returns {IDataReader} A data reader for the given source
     * @private
     */
    private getDirectReader(sourceType: DataSourceType): IDataReader {
        switch (sourceType) {
            case 'json':
                return new JsonDataReader(this.config.jsonPath, this.config.sheetName);
            case 'csv':
                return new CsvDataReader(this.config.csvPath);
            case 'excel':
                return new ExcelDataReader(this.config.excelPath, this.config.sheetName);
            case 'db':
                return new DatabaseDataReader(this.config.dbPath, this.config.sheetName);
            default:
                this.logger.warn(`Unknown data source type: ${sourceType}, falling back to JSON`);
                return new JsonDataReader(this.config.jsonPath);
        }
    }

    /**
     * Resolves the file path for a given source type.
     * @param {DataSourceType} sourceType - The data source type
     * @returns {string} Resolved file path
     * @private
     */
    private getResolvedFilePath(sourceType: DataSourceType): string {
        if (sourceType === 'json') {
            return this.config.jsonPath;
        }
        return this.getConvertedJsonPath(sourceType);
    }

    /**
     * Returns the raw configured path for the given source type.
     * @param {DataSourceType} sourceType - The data source type
     * @returns {string} Raw source path from configuration
     * @private
     */
    private getRawSourcePath(sourceType: DataSourceType): string {
        switch (sourceType) {
            case 'csv':
                return this.config.csvPath;
            case 'excel':
                return this.config.excelPath;
            case 'db':
                return this.config.dbPath;
            case 'json':
            default:
                return this.config.jsonPath;
        }
    }


    /**
     * Generates the path for a converted JSON file in the `test-results/converted/` directory.
     * @param {DataSourceType} sourceType - The original data source type
     * @returns {string} Path to the converted JSON file
     * @private
     */
    private getConvertedJsonPath(sourceType: DataSourceType): string {
        const projectRoot = path.resolve(__dirname, '..', '..');
        const filename = `testdata.${sourceType}.json`;
        return path.join(projectRoot, 'test-results', 'converted', filename);
    }

    /**
     * Convert test data into RunnerData format (replaces RunnerManager).
     */
    async toRunnerData<T>(sourceType?: DataSourceType): Promise<RunnerData<T>> {
        const type = sourceType || this.config.type;
        const reader = this.getDirectReader(type);
        const testCases = await reader.readAll<T>();
        const originalSource = this.getRawSourcePath(type);

        const runnerData: RunnerData<T> = {
            metadata: {
                sourceType: type,
                generatedAt: new Date().toISOString(),
                originalSource,
            },
            testCases,
        };

        // Close DB reader if applicable
        const closable = reader as unknown as { close?: () => Promise<void> };
        if (typeof closable.close === 'function') {
            await closable.close();
        }

        this.logger.info(`Converted ${testCases.length} records to RunnerData from ${type}`);
        return runnerData;
    }

}

/**
 * Convenience function that retrieves enabled test data from the singleton DataProvider.
 *
 * @param {DataSourceType} [sourceType] - Optional source type override
 * @returns {Promise<TestCaseData[]>} Array of enabled test case records
 *
 * @example
 * ```typescript
 * import { getEnabledTestData } from '@utils/DataProvider';
 * const testCases = await getEnabledTestData('csv');
 * ```
 */
export async function getEnabledTestData(sourceType?: DataSourceType): Promise<TestCaseData[]> {
    const provider = DataProvider.getInstance();
    return provider.getEnabledTestData<TestCaseData>(sourceType);
}

/**
 * Convenience function that looks up a single test case by its `id` field
 * from the singleton {@link DataProvider}.
 *
 * Reduces the typical 3-line `beforeAll` boilerplate to a single call:
 *
 * ```typescript
 * // ❌ Before
 * const provider = DataProvider.getInstance();
 * testCase = await provider.getTestDataById<TestCaseData>('TC-AUTH-001');
 *
 * // ✅ After
 * testCase = await getTestCaseById<TestCaseData>('TC-AUTH-001');
 * ```
 *
 * @template T - Record shape (must include `id: string`)
 * @param {string} id - The test case ID to look up (e.g. `'TC-AUTH-001'`)
 * @returns {Promise<T | null>} The matching record, or `null` if not found
 *
 * @example
 * ```typescript
 * import { getTestCaseById } from '../../src/utils/DataProvider';
 * import type { TestCaseData } from '../../src/types';
 *
 * let testCase: TestCaseData | null;
 *
 * test.beforeAll(async () => {
 *     testCase = await getTestCaseById<TestCaseData>('TC-AUTH-001');
 * });
 * ```
 */
export async function getTestCaseById<T extends { id: string }>(id: string): Promise<T | null> {
    const provider = DataProvider.getInstance();
    return provider.getTestDataById<T>(id);
}

/**
 * Convenience function that loads all test data as {@link RunnerData}
 * from the singleton {@link DataProvider}.
 *
 * Useful for tests that look up records by `testName` instead of `id`:
 *
 * ```typescript
 * // ❌ Before
 * const provider = DataProvider.getInstance();
 * runnerData = await provider.toRunnerData<TestCaseData>();
 *
 * // ✅ After
 * runnerData = await getRunnerData<TestCaseData>();
 * ```
 *
 * @template T - Record shape for individual test case records
 * @returns {Promise<RunnerData<T>>} Structured runner data with metadata and test cases
 *
 * @example
 * ```typescript
 * import { getRunnerData } from '../../src/utils/DataProvider';
 * import type { TestCaseData, RunnerData } from '../../src/types';
 *
 * let runnerData: RunnerData<TestCaseData>;
 *
 * test.beforeAll(async () => {
 *     runnerData = await getRunnerData<TestCaseData>();
 *     const testCase = runnerData.testCases.find(tc => tc.testName === 'myTest');
 * });
 * ```
 */
export async function getRunnerData<T>(): Promise<RunnerData<T>> {
    const provider = DataProvider.getInstance();
    return provider.toRunnerData<T>();
}

export default DataProvider;