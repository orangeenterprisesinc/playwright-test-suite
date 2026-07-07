/**
 * @fileoverview CSV data reader powered by PapaParse with automatic type coercion.
 *
 * {@link CsvDataReader} extends {@link BaseDataReader} to parse CSV files, auto-detect
 * types via `dynamicTyping`, and apply {@link TypeCoercionHelper} transformations.
 *
 * @module utils/dataReaders/CsvDataReader
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const reader = new CsvDataReader('./data/users.csv', { delimiter: ';' });
 * const users = await reader.readAll<User>();
 * ```
 */
import {BaseDataReader} from './BaseDataReader';
import {TypeCoercionHelper} from './TypeCoercionHelper';
import fs from 'fs/promises';
import Papa from 'papaparse';

/**
 * Configuration for CSV parsing behaviour.
 *
 * @interface CsvDataReaderOptions
 * @property {string} [delimiter=','] - Column separator character
 * @property {boolean} [hasHeader=true] - Whether the first row is a header
 * @property {string} [arrayDelimiter='|'] - Delimiter for pipe-separated array columns
 */
interface CsvDataReaderOptions {
    delimiter?: string;
    hasHeader?: boolean;
    arrayDelimiter?: string;
}

/**
 * Reads and parses CSV files using PapaParse with type coercion.
 *
 * @class CsvDataReader
 * @extends {BaseDataReader}
 */
export class CsvDataReader extends BaseDataReader {

    /** @private Column delimiter */
    private readonly delimiter: string;

    /** @private Whether the first row contains headers */
    private readonly hasHeader: boolean;

    /** @private Coercion helper for type transformations */
    private readonly coercionHelper: TypeCoercionHelper;

    /**
     * @param {string} filePath - Path to the CSV file
     * @param {CsvDataReaderOptions} [options] - Parsing options
     */
    constructor(filePath: string, options?: CsvDataReaderOptions) {
        super(filePath, 'csv');
        this.delimiter = options?.delimiter || ',';
        this.hasHeader = options?.hasHeader !== false; // Default to true
        this.coercionHelper = new TypeCoercionHelper(options?.arrayDelimiter || '|');
    }


    /**
     * Reads all rows and remaps column names according to the provided mapping.
     *
     * @template T - Target record shape
     * @param {Record<string, string>} columnMapping - `{ csvColumnName: targetPropertyName }`
     * @returns {Promise<T[]>} Remapped records
     *
     * @example
     * ```typescript
     * const mapped = await reader.readWithMapping<User>({ 'user_name': 'name' });
     * ```
     */
    async readWithMapping<T>(columnMapping: Record<string, string>): Promise<T[]> {
        const rawData = await this.readAll<Record<string, unknown>>();

        return rawData.map((row) => {
            const mapped: Record<string, unknown> = {};
            for (const [csvColumn, targetKey] of Object.entries(columnMapping)) {
                if (row[csvColumn] !== undefined) {
                    mapped[targetKey] = row[csvColumn];
                }
            }
            return mapped as T;
        });
    }


    /**
     * Reads and returns the header column names from the CSV file.
     *
     * @returns {Promise<string[]>} Header names, or empty array if no header row
     */
    async getHeaders(): Promise<string[]> {
        const fileContent = await fs.readFile(this.filePath, 'utf-8');
        const firstLine = fileContent.split('\n')[0];

        if (this.hasHeader) {
            return firstLine.split(this.delimiter).map((h) => h.trim());
        }

        return [];
    }

    /**
     * Parses the CSV file content and applies type coercion to each row.
     *
     * @protected
     * @template T - Record shape
     * @returns {Promise<T[]>} Parsed and transformed records
     */
    protected async parseData<T>(): Promise<T[]> {
        const fileContent = await fs.readFile(this.filePath, 'utf-8');

        return new Promise((resolve, reject) => {
            Papa.parse<T>(fileContent, {
                header: this.hasHeader,
                delimiter: this.delimiter,
                skipEmptyLines: true,
                dynamicTyping: true, // Automatically convert numbers and booleans
                transformHeader: (header: string) => header.trim(),
                complete: (results) => {
                    if (results.errors.length > 0) {
                        this.logger.warn(`CSV parsing warnings: ${JSON.stringify(results.errors)}`);
                    }

                    // Transform data to ensure consistent JSON types
                    const transformedData = (results.data as unknown[]).map((row) =>
                        this.coercionHelper.transformRowToJson(row as Record<string, unknown>),
                    ) as T[];

                    this.logger.debug(
                        `Converted ${transformedData.length} CSV rows to JSON format`,
                    );
                    resolve(transformedData);
                },
                error: (error: Error) => {
                    reject(error);
                },
            });
        });
    }

}

export default CsvDataReader;
