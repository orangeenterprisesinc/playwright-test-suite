/**
 * @fileoverview Excel (`.xlsx` / `.xls`) data reader using the `xlsx` (SheetJS) library.
 *
 * {@link ExcelDataReader} extends {@link BaseDataReader} to parse Excel workbooks,
 * read individual sheets or cell ranges, and apply {@link TypeCoercionHelper} transformations.
 *
 * @module utils/dataReaders/ExcelDataReader
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const reader = new ExcelDataReader('./data/tests.xlsx', 'LoginTests');
 * const tests = await reader.readAll<TestCaseData>();
 * const sheets = reader.getSheetNames();
 * ```
 */
import {BaseDataReader} from './BaseDataReader';
import {TypeCoercionHelper} from './TypeCoercionHelper';
import * as XLSX from 'xlsx';

/**
 * Configuration options for the Excel reader.
 *
 * @interface ExcelDataReaderOptions
 * @property {string} [arrayDelimiter='|'] - Delimiter for pipe-separated array columns
 */
interface ExcelDataReaderOptions {
    arrayDelimiter?: string;
}

/**
 * Reads and parses Excel workbooks with automatic type coercion.
 *
 * @class ExcelDataReader
 * @extends {BaseDataReader}
 */
export class ExcelDataReader extends BaseDataReader {

    /** @private Target sheet name (defaults to first sheet if omitted) */
    private readonly sheetName?: string;

    /** @private Lazy-loaded workbook instance */
    private workbook: XLSX.WorkBook | null = null;

    /** @private Coercion helper for type transformations */
    private readonly coercionHelper: TypeCoercionHelper;

    /**
     * @param {string} filePath - Path to the Excel file
     * @param {string} [sheetName] - Sheet to read (defaults to the first sheet)
     * @param {ExcelDataReaderOptions} [options] - Additional options
     */
    constructor(filePath: string, sheetName?: string, options?: ExcelDataReaderOptions) {
        super(filePath, 'excel');
        this.sheetName = sheetName;
        this.coercionHelper = new TypeCoercionHelper(options?.arrayDelimiter || '|');
    }

    /**
     * Reads all rows from a specific sheet by name.
     *
     * @template T - Record shape
     * @param {string} sheetName - Sheet to read
     * @returns {Promise<T[]>} Coerced records (empty array if sheet not found)
     */
    async readSheet<T>(sheetName: string): Promise<T[]> {
        const workbook = this.loadWorkbook();
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
            this.logger.warn(`Sheet '${sheetName}' not found`);
            return [];
        }

        const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: null,
            raw: false,
        });

        return rawData.map((row) => this.coercionHelper.transformRowToJson(row)) as T[];
    }


    /** Returns the names of all sheets in the workbook. */
    getSheetNames(): string[] {
        const workbook = this.loadWorkbook();
        return workbook.SheetNames;
    }

    /**
     * Reads a specific cell range from a sheet.
     *
     * @template T - Record shape
     * @param {string} sheetName - Sheet name
     * @param {string} range - Excel range (e.g. `'A1:D10'`)
     * @returns {Promise<T[]>} Coerced records within the range
     * @throws {Error} If the sheet is not found
     */
    async readRange<T>(sheetName: string, range: string): Promise<T[]> {
        const workbook = this.loadWorkbook();
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
            throw new Error(`Sheet '${sheetName}' not found`);
        }

        // Create a new worksheet with only the specified range
        const rangedWorksheet = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            range,
            defval: null,
            raw: false,
        });

        return rangedWorksheet.map((row) => this.coercionHelper.transformRowToJson(row)) as T[];
    }

    /**
     * Reads the header row from a sheet.
     *
     * @param {string} [sheetName] - Sheet name (defaults to configured sheet or first)
     * @returns {string[]} Column header names
     */
    getHeaders(sheetName?: string): string[] {
        const workbook = this.loadWorkbook();
        const sheet = sheetName || this.sheetName || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheet];

        if (!worksheet || !worksheet['!ref']) {
            return [];
        }

        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const headers: string[] = [];

        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({r: 0, c: col});
            const cell = worksheet[cellAddress];
            headers.push(cell ? String(cell.v) : '');
        }

        return headers;
    }

    /**
     * Parses the configured sheet and applies type coercion.
     *
     * @protected
     * @template T - Record shape
     * @returns {Promise<T[]>} Parsed and coerced records
     * @throws {Error} If the sheet is not found
     */
    protected async parseData<T>(): Promise<T[]> {
        const workbook = this.loadWorkbook();

        // Use specified sheet or first sheet
        const sheetName = this.sheetName || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
            throw new Error(`Sheet '${sheetName}' not found in Excel file`);
        }

        // Convert to JSON with header row
        const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: null, // Default value for empty cells
            raw: false, // Get formatted values
        });

        // Transform data to consistent JSON format
        const jsonData = rawData.map((row) => this.coercionHelper.transformRowToJson(row, { autoConvertNumericStrings: true }));
        this.logger.debug(`Converted ${jsonData.length} Excel rows to JSON format`);

        return jsonData as T[];
    }

    /** @private Lazy-loads and caches the workbook. */
    private loadWorkbook(): XLSX.WorkBook {
        if (!this.workbook) {
            this.workbook = XLSX.readFile(this.filePath);
        }
        return this.workbook;
    }

}

export default ExcelDataReader;
