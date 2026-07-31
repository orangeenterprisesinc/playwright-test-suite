/**
 * @fileoverview Singleton data provider that unifies access to JSON and CSV
 * data sources via the {@link IDataReader} abstraction.
 *
 * Data is always read DIRECTLY from its source file — JSON runs from JSON,
 * CSV runs from CSV. There is no conversion/preprocessing step.
 *
 * Also exposes {@link DataProvider.toRunnerData} for wrapping test data in
 * the `RunnerData` format.
 */
import type {DataProviderResult, DataSourceType, IDataReader, RunnerData, TestCaseData} from '../../types';
import {type DataSourceConfig, getDataSourceConfig} from '../../config/dataSource.config';
import {CsvDataReader, JsonDataReader, MultiFileDataReader} from './index';
import {Logger} from '../../utils/logger';

/**
 * Singleton data provider that reads test data from multiple sources and
 * returns it in a uniform format.
 */
export class DataProvider {
    /** @private Singleton instance */
    private static instance: DataProvider;
    /** @private Logger for data provider operations */
    private readonly logger: Logger;
    /** @private Active data source configuration */
    private readonly config: DataSourceConfig;

    /** Private constructor — use {@link getInstance} or {@link forSource}. */
    private constructor(configOverride?: DataSourceConfig) {
        this.logger = new Logger('DataProvider');
        this.config = configOverride ?? getDataSourceConfig();
        this.logger.info(`Data source configured: ${this.config.type}`);
    }

    /** Returns the shared singleton instance, creating it on the first call. */
    static getInstance(): DataProvider {
        if (!DataProvider.instance) {
            DataProvider.instance = new DataProvider();
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
     */
    async getFilteredTestData<T>(filter: Partial<T>, sourceType?: DataSourceType): Promise<T[]> {
        const reader = await this.getReader(sourceType);
        return reader.readFiltered<T>(filter);
    }

    /** Returns the active data source configuration. */
    getConfig(): DataSourceConfig {
        return this.config;
    }


    /** Returns the currently configured source type. */
    getCurrentSourceType(): DataSourceType {
        return this.config.type;
    }


    /** Checks whether the specified (or default) data source is accessible. */
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

    /** Factory method that instantiates the appropriate {@link IDataReader} subclass. */
    private getDirectReader(sourceType: DataSourceType): IDataReader {
        // Normal path: the per-journey files under src/data/runner/ read as one
        // combined set. A DATA_FILE_PATH_* override clears `useRunnerDir` and
        // falls through to the single-file readers below.
        if (this.config.useRunnerDir) {
            return new MultiFileDataReader(this.config.runnerDir, sourceType, this.config.sheetName);
        }

        switch (sourceType) {
            case 'json':
                return new JsonDataReader(this.config.jsonPath, this.config.sheetName);
            case 'csv':
                return new CsvDataReader(this.config.csvPath);
            default:
                this.logger.warn(`Unsupported data source type: ${sourceType}, falling back to JSON`);
                return new JsonDataReader(this.config.jsonPath);
        }
    }

    /**
     * Returns the raw configured path for the given source type. Data is read
     * directly from this file — no converted copy exists.
     */
    private getResolvedFilePath(sourceType: DataSourceType): string {
        return this.getRawSourcePath(sourceType);
    }

    /** Returns the raw configured path for the given source type. */
    private getRawSourcePath(sourceType: DataSourceType): string {
        switch (sourceType) {
            case 'csv':
                return this.config.csvPath;
            case 'json':
            default:
                return this.config.jsonPath;
        }
    }

    /** Convert test data into RunnerData format (replaces RunnerManager). */
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

/** Convenience function that retrieves enabled test data from the singleton DataProvider. */
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
 */
export async function getRunnerData<T>(): Promise<RunnerData<T>> {
    const provider = DataProvider.getInstance();
    return provider.toRunnerData<T>();
}

export default DataProvider;