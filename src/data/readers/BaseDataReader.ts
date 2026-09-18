/**
 * @fileoverview Abstract base for data readers: shared caching, filtering,
 * and availability logic. Concrete subclasses only implement {@link BaseDataReader.parseData}.
 */
import type {DataSourceType, IDataReader} from '../../types';
import {Logger} from '../../utils/logger';
import fs from 'fs';

export abstract class BaseDataReader implements IDataReader {
    protected readonly logger: Logger;
    protected readonly filePath: string;
    protected readonly sourceType: DataSourceType;
    /** In-memory cache of parsed data; `null` when not yet loaded */
    protected cachedData: unknown[] | null = null;

    constructor(filePath: string, sourceType: DataSourceType) {
        this.filePath = filePath;
        this.sourceType = sourceType;
        this.logger = new Logger(this.constructor.name);
    }


    /**
     * Reads all records from the data source (returns cached data on repeat calls).
     *
     * @template T - Record shape
     * @throws {Error} If the underlying {@link parseData} fails
     */
    async readAll<T>(): Promise<T[]> {
        try {
            if (this.cachedData) {
                this.logger.debug('Returning cached data');
                return this.cachedData as T[];
            }

            this.logger.debug(`Reading data from: ${this.filePath}`);
            const data = await this.parseData<T>();
            this.cachedData = data;
            this.logger.debug(`Loaded ${data.length} records from ${this.sourceType}`);
            return data;
        } catch (error) {
            this.logger.error(`Failed to read data: ${error}`);
            throw error;
        }
    }

    /**
     * Finds a single record by its `id` property.
     *
     * @template T - Record shape (must include `id: string`)
     */
    async readById<T extends { id: string }>(id: string): Promise<T | null> {
        const allData = await this.readAll<T>();
        return allData.find((item) => item.id === id) || null;
    }


    /**
     * Returns records matching all key-value pairs in `filter`.
     *
     * @template T - Record shape
     */
    async readFiltered<T>(filter: Partial<T>): Promise<T[]> {
        const allData = await this.readAll<T>();
        return allData.filter((item) => {
            return Object.entries(filter).every(([key, value]) => {
                return (item as Record<string, unknown>)[key] === value;
            });
        });
    }


    /**
     * Returns only records where `enabled` is not explicitly `false`.
     *
     * @template T - Record shape (may include `enabled?: boolean`)
     */
    async readEnabled<T extends { enabled?: boolean }>(): Promise<T[]> {
        const allData = await this.readAll<T>();
        return allData.filter((item) => item.enabled !== false);
    }


    /** Checks whether the underlying data source is accessible. */
    async isAvailable(): Promise<boolean> {
        try {
            return fs.existsSync(this.filePath);
        } catch {
            return false;
        }
    }


    /** Parses raw data from the underlying source. Implemented by subclasses. */
    protected abstract parseData<T>(): Promise<T[]>;
}

export default BaseDataReader;
