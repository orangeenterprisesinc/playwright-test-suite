/**
 * @fileoverview JSON data reader for flat or section-based JSON files.
 *
 * {@link JsonDataReader} extends {@link BaseDataReader} and supports:
 * - Top-level arrays (`[{...}, ...]`)
 * - Section-based objects (`{ "sectionA": [...], "sectionB": [...] }`)
 * - Objects with a `data` property
 */
import {BaseDataReader} from './BaseDataReader';
import fs from 'fs/promises';

/**
 * Reads JSON files and resolves records from sections or top-level arrays.
 *
 * @extends {BaseDataReader}
 */
export class JsonDataReader extends BaseDataReader {

    /** @private Optional section key to read from the JSON object */
    private readonly sheetName?: string;

    constructor(filePath: string, sheetName?: string) {
        super(filePath, 'json');
        this.sheetName = sheetName;
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
