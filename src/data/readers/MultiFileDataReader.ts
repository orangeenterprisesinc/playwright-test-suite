/**
 * @fileoverview Reads runner rows spread across a directory of per-journey files.
 *
 * The suite's runner rows live one file per journey under `src/data/runner/`
 * (`journey-a.csv`, `journey-b.csv`, … plus `system.csv`) rather than in a single
 * flat file: at 69 catalog workflows a single file is hundreds of rows and a
 * permanent merge conflict, and a journey is the unit people actually work in.
 *
 * This reader **composes** {@link JsonDataReader} / {@link CsvDataReader} — one
 * per file — and concatenates their records, so no parsing logic is duplicated.
 * It also normalises each row to a single canonical shape, which the underlying
 * readers cannot do on their own: the CSV path coerces `tags`/`segments`/`modules`
 * to arrays via `TypeCoercionHelper`, but the JSON path returns whatever the file
 * literally contains. Normalising here means a spec sees the same row whichever
 * `TEST_DATA_SOURCE` is active.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BaseDataReader } from './BaseDataReader';
import { CsvDataReader } from './CsvDataReader';
import { JsonDataReader } from './JsonDataReader';
import type { DataSourceType } from '../../types';

/** Columns that hold multiple values (pipe-delimited in CSV, arrays in JSON). */
const ARRAY_FIELDS = ['tags', 'segments', 'modules'] as const;

/** Columns that hold booleans (`1`/`0`/`yes`/`true` in CSV). */
const BOOLEAN_FIELDS = ['enabled', 'demo', 'shouldComplete'] as const;

/**
 * Parsed rows shared across reader instances, keyed by directory + extension.
 *
 * `BaseDataReader` caches per instance, but `DataProvider` builds a fresh reader
 * on every lookup and `base.fixture` looks a row up in each test's `beforeEach`.
 * With one flat file that cost one read per test; with a file per journey it
 * would be seven. The row files are static for the life of a run, so cache them
 * process-wide and read each one once.
 */
const parsedCache = new Map<string, Record<string, unknown>[]>();

/** Clears the process-wide row cache — for tests that rewrite the data files. */
export function clearMultiFileCache(): void {
    parsedCache.clear();
}

/**
 * Reads every `*.json` or `*.csv` file in a directory as one combined record set.
 *
 * @extends BaseDataReader
 */
export class MultiFileDataReader extends BaseDataReader {
    /** @private Section key passed to each JSON reader (e.g. `'runnerManager'`). */
    private readonly sheetName?: string;

    constructor(directoryPath: string, sourceType: DataSourceType, sheetName?: string) {
        super(directoryPath, sourceType);
        this.sheetName = sheetName;
    }

    /** The data files this reader will read, in stable alphabetical order. */
    files(): string[] {
        if (!fs.existsSync(this.filePath)) return [];
        return fs
            .readdirSync(this.filePath)
            .filter((file) => file.endsWith(`.${this.sourceType}`))
            .sort()
            .map((file) => path.join(this.filePath, file));
    }

    /** True when the directory exists and holds at least one matching file. */
    override async isAvailable(): Promise<boolean> {
        return this.files().length > 0;
    }

    /**
     * Reads and concatenates every file in the directory, then normalises each
     * record so JSON and CSV sources yield identical shapes.
     */
    protected async parseData<T>(): Promise<T[]> {
        const cacheKey = `${this.sourceType}:${this.filePath}`;
        const cached = parsedCache.get(cacheKey);
        if (cached) return cached as T[];

        const files = this.files();
        if (!files.length) {
            this.logger.warn(`No .${this.sourceType} files found in ${this.filePath}`);
            return [];
        }

        const records: Record<string, unknown>[] = [];
        for (const file of files) {
            const reader =
                this.sourceType === 'csv'
                    ? new CsvDataReader(file)
                    : new JsonDataReader(file, this.sheetName);
            const rows = await reader.readAll<Record<string, unknown>>();
            this.logger.debug(`${path.basename(file)}: ${rows.length} records`);
            records.push(...rows.map((row) => MultiFileDataReader.normalize(row)));
        }

        parsedCache.set(cacheKey, records);
        return records as T[];
    }

    /**
     * Brings one raw record to the canonical row shape: multi-value fields become
     * string arrays, boolean fields become real booleans, and the empty cells a
     * CSV always produces (read as `null` or `''`) are dropped so an absent
     * optional field is `undefined` rather than `null`.
     */
    private static normalize(row: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(row)) {
            if ((ARRAY_FIELDS as readonly string[]).includes(key)) {
                const items = Array.isArray(value)
                    ? value.map(String)
                    : String(value ?? '').split('|');
                const cleaned = items.map((item) => item.trim()).filter(Boolean);
                if (cleaned.length) out[key] = cleaned;
                continue;
            }

            if ((BOOLEAN_FIELDS as readonly string[]).includes(key)) {
                if (typeof value === 'boolean') out[key] = value;
                else if (typeof value === 'number') out[key] = value === 1;
                else {
                    const text = String(value ?? '').trim().toLowerCase();
                    out[key] = text === '1' || text === 'true' || text === 'yes';
                }
                continue;
            }

            // Drop empty cells rather than carrying null into an optional field.
            if (value === null || value === undefined || value === '') continue;
            out[key] = value;
        }

        return out;
    }
}

export default MultiFileDataReader;
