/**
 * @fileoverview Singleton data provider over JSON/CSV runner rows. Reads a
 * catalog id (e.g. `A1-001`) straight from its one journey file when
 * possible, falling back to a per-type id index built from all files.
 */
import fs from 'node:fs';
import path from 'node:path';
import type {DataSourceType, IDataReader, RunnerData, TestCaseData} from '../../types';
import {type DataSourceConfig, getDataSourceConfig} from '../../config/dataSource.config';
import {CsvDataReader, JsonDataReader, MultiFileDataReader} from './index';
import {normalizeRow} from './MultiFileDataReader';
import {Logger} from '../../utils/logger';

/** Matches a catalog id and captures its journey letter, e.g. `A1-001` -> `A`. */
const JOURNEY_ID = /^([A-F])\d{1,2}-\d{3}$/;

type Row = Record<string, unknown> & { id?: string };

/**
 * Singleton data provider that reads test data from multiple sources and
 * returns it in a uniform format.
 */
export class DataProvider {
    private static instance: DataProvider;
    private readonly logger: Logger;
    private readonly config: DataSourceConfig;
    private readonly readers = new Map<DataSourceType, IDataReader>();
    private readonly fileReaders = new Map<string, IDataReader>();
    private readonly indexes = new Map<DataSourceType, Promise<Map<string, Row>>>();

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
     * Returns only test data records where `enabled !== false`.
     *
     * @template T - Record shape (must optionally include `enabled`)
     */
    async getEnabledTestData<T extends { enabled?: boolean }>(
        sourceType?: DataSourceType,
    ): Promise<T[]> {
        const reader = this.getDirectReader(sourceType || this.config.type);
        return reader.readEnabled<T>();
    }

    /**
     * Looks up a single test data record by its `id` field: reads its one
     * journey file directly when the id maps to one, else falls back to an
     * id index built from all files (system rows, DATA_FILE_PATH_* override).
     *
     * @template T - Record shape (must include `id`)
     */
    async getTestDataById<T extends { id: string }>(
        id: string,
        sourceType?: DataSourceType,
    ): Promise<T | null> {
        const type = sourceType || this.config.type;
        const scoped = this.readerForId(id, type);
        if (scoped) {
            const raw = await scoped.readById<Row & { id: string }>(id);
            if (raw) return normalizeRow(raw) as T;
        }
        return ((await this.index(type)).get(id) as T | undefined) ?? null;
    }

    /** Factory method that instantiates the appropriate {@link IDataReader} subclass, memoized per source type. */
    private getDirectReader(sourceType: DataSourceType): IDataReader {
        const hit = this.readers.get(sourceType);
        if (hit) return hit;

        // Normal path: the per-journey files under src/data/runner/ read as one
        // combined set. A DATA_FILE_PATH_* override clears `useRunnerDir` and
        // falls through to the single-file readers below.
        let reader: IDataReader;
        if (this.config.useRunnerDir) {
            reader = new MultiFileDataReader(this.config.runnerDir, sourceType, this.config.sheetName);
        } else {
            switch (sourceType) {
                case 'json':
                    reader = new JsonDataReader(this.config.jsonPath, this.config.sheetName);
                    break;
                case 'csv':
                    reader = new CsvDataReader(this.config.csvPath);
                    break;
                default:
                    this.logger.warn(`Unsupported data source type: ${sourceType}, falling back to JSON`);
                    reader = new JsonDataReader(this.config.jsonPath);
            }
        }

        this.readers.set(sourceType, reader);
        return reader;
    }

    /**
     * Returns a reader scoped to the single journey file an id belongs to
     * (e.g. `A1-001` -> `journey-a.json`), or `null` when the id doesn't map
     * to one file (system rows) or a DATA_FILE_PATH_* override is active.
     */
    private readerForId(id: string, type: DataSourceType): IDataReader | null {
        if (!this.config.useRunnerDir || (type !== 'json' && type !== 'csv')) return null;
        const m = JOURNEY_ID.exec(id);
        if (!m) return null;

        const file = path.join(this.config.runnerDir, `journey-${m[1].toLowerCase()}.${type}`);
        if (!fs.existsSync(file)) return null;

        let reader = this.fileReaders.get(file);
        if (!reader) {
            reader = type === 'csv' ? new CsvDataReader(file) : new JsonDataReader(file, this.config.sheetName);
            this.fileReaders.set(file, reader);
        }
        return reader;
    }

    /** Builds (once per type) an id -> row index over every runner file, first match wins. */
    private index(type: DataSourceType): Promise<Map<string, Row>> {
        let built = this.indexes.get(type);
        if (!built) {
            built = this.getDirectReader(type).readAll<Row>().then((rows) => {
                const byId = new Map<string, Row>();
                for (const row of rows) if (row.id && !byId.has(row.id)) byId.set(row.id, row);
                return byId;
            });
            this.indexes.set(type, built);
        }
        return built;
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

        this.logger.debug(`Converted ${testCases.length} records to RunnerData from ${type}`);
        return runnerData;
    }

}

/** Convenience function that retrieves enabled test data from the singleton DataProvider. */
export async function getEnabledTestData(sourceType?: DataSourceType): Promise<TestCaseData[]> {
    const provider = DataProvider.getInstance();
    return provider.getEnabledTestData<TestCaseData>(sourceType);
}

/** Looks up a single test case by `id` from the singleton {@link DataProvider}. */
export async function getTestCaseById<T extends { id: string }>(id: string): Promise<T | null> {
    const provider = DataProvider.getInstance();
    return provider.getTestDataById<T>(id);
}

/** Loads all test data as {@link RunnerData} from the singleton {@link DataProvider}. */
export async function getRunnerData<T>(): Promise<RunnerData<T>> {
    const provider = DataProvider.getInstance();
    return provider.toRunnerData<T>();
}

export default DataProvider;