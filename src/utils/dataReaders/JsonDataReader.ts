/**
 * @fileoverview JSON data reader for flat or section-based JSON files.
 *
 * {@link JsonDataReader} extends {@link BaseDataReader} and supports:
 * - Top-level arrays (`[{...}, ...]`)
 * - Section-based objects (`{ "sectionA": [...], "sectionB": [...] }`)
 * - Objects with a `data` property
 *
 * @module utils/dataReaders/JsonDataReader
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const reader = new JsonDataReader('./data/tests.json', 'loginTests');
 * const tests = await reader.readAll<TestCaseData>();
 * const sections = await reader.getSections();
 * ```
 */
import {BaseDataReader} from './BaseDataReader';
import fs from 'fs/promises';

/**
 * Reads JSON files and resolves records from sections or top-level arrays.
 *
 * @class JsonDataReader
 * @extends {BaseDataReader}
 */
export class JsonDataReader extends BaseDataReader {

    /** @private Optional section key to read from the JSON object */
    private readonly sheetName?: string;

    /**
     * @param {string} filePath - Path to the JSON file
     * @param {string} [sheetName] - Optional section key within the JSON object
     */
    constructor(filePath: string, sheetName?: string) {
        super(filePath, 'json');
        this.sheetName = sheetName;
    }

    /**
     * Reads records from a named section within the JSON file.
     *
     * @template T - Record shape
     * @param {string} sectionName - Key in the root JSON object
     * @returns {Promise<T[]>} Records from the section (empty array if not found)
     */
    async readSection<T>(sectionName: string): Promise<T[]> {
        const fileContent = await fs.readFile(this.filePath, 'utf-8');
        const jsonData = JSON.parse(fileContent);

        if (jsonData[sectionName]) {
            const data = jsonData[sectionName];
            return Array.isArray(data) ? data : [data];
        }

        this.logger.warn(`Section '${sectionName}' not found in JSON file`);
        return [];
    }


    /**
     * Returns the top-level section keys of the JSON file.
     *
     * @returns {Promise<string[]>} Section names (empty array if root is an array)
     */
    async getSections(): Promise<string[]> {
        const fileContent = await fs.readFile(this.filePath, 'utf-8');
        const jsonData = JSON.parse(fileContent);

        if (typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            return Object.keys(jsonData);
        }

        return [];
    }

    /**
     * Parses the JSON file, resolving the target section or top-level array.
     *
     * Resolution order:
     * 1. If `sheetName` is set and the key exists → return that section
     * 2. If root is an array → return it directly
     * 3. If root has a `data` array property → return `data`
     * 4. Otherwise → wrap the root object in an array
     *
     * @protected
     * @template T - Record shape
     * @returns {Promise<T[]>} Parsed records
     */
    protected async parseData<T>(): Promise<T[]> {
        const fileContent = await fs.readFile(this.filePath, 'utf-8');
        const jsonData = JSON.parse(fileContent);

        // If sheetName is provided, look for that key in the JSON
        if (this.sheetName && jsonData[this.sheetName]) {
            const data = jsonData[this.sheetName];
            return Array.isArray(data) ? data : [data];
        }

        // If the JSON is an array, return it directly
        if (Array.isArray(jsonData)) {
            return jsonData;
        }

        // If it's an object with a 'data' property, return that
        if (jsonData.data && Array.isArray(jsonData.data)) {
            return jsonData.data;
        }

        // Otherwise, wrap it in an array
        return [jsonData];
    }
}

export default JsonDataReader;
