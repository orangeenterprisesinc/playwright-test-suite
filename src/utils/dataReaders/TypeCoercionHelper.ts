/**
 * @fileoverview Shared type coercion utility for all data readers.
 *
 * {@link TypeCoercionHelper} eliminates duplicate `convertToArray`, `convertToBoolean`,
 * `convertToNumber`, and `transformRowToJson` methods that previously existed in
 * `CsvDataReader`, `ExcelDataReader`, and `DatabaseDataReader`.
 *
 * Columns are mapped to their expected type based on well-known column name lists.
 * Unknown columns undergo heuristic coercion (boolean strings, null detection,
 * optional numeric auto-conversion).
 *
 * @module utils/dataReaders/TypeCoercionHelper
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const helper = new TypeCoercionHelper('|');
 * const row = helper.transformRowToJson({ tags: 'a|b|c', enabled: 'true', price: '9.99' });
 * // { tags: ['a', 'b', 'c'], enabled: true, price: 9.99 }
 * ```
 */
export class TypeCoercionHelper {
    /** @private Columns that should be converted to string arrays */
    private static readonly ARRAY_COLUMNS = ['tags'];

    /** @private Columns that should be converted to numbers */
    private static readonly NUMERIC_COLUMNS = [
        'expectedCount', 'count', 'quantity', 'price', 'amount', 'total',
    ];

    /** @private Columns that should be converted to booleans */
    private static readonly BOOLEAN_COLUMNS = [
        'enabled', 'shouldComplete', 'completed', 'active',
    ];

    /**
     * @param {string} [arrayDelimiter='|'] - Delimiter used to split array column values
     */
    constructor(private readonly arrayDelimiter: string = '|') {}

    /**
     * Transforms a raw row object into a properly typed JSON record.
     *
     * Applies column-specific coercion based on well-known column names,
     * then falls back to heuristic type detection for remaining fields.
     *
     * @param {Record<string, unknown>} row - Raw row data
     * @param {object} [options] - Transformation options
     * @param {boolean} [options.autoConvertNumericStrings=false] - Auto-convert numeric strings
     * @returns {Record<string, unknown>} Coerced record
     */
    transformRowToJson(
        row: Record<string, unknown>,
        options?: { autoConvertNumericStrings?: boolean },
    ): Record<string, unknown> {
        const jsonObject: Record<string, unknown> = {};
        const autoNumeric = options?.autoConvertNumericStrings ?? false;

        for (const [key, value] of Object.entries(row)) {
            const normalizedKey = key.trim();

            if (TypeCoercionHelper.ARRAY_COLUMNS.includes(normalizedKey)) {
                jsonObject[normalizedKey] = this.convertToArray(value);
                continue;
            }

            if (TypeCoercionHelper.BOOLEAN_COLUMNS.includes(normalizedKey)) {
                jsonObject[normalizedKey] = this.convertToBoolean(value);
                continue;
            }

            if (TypeCoercionHelper.NUMERIC_COLUMNS.includes(normalizedKey)) {
                jsonObject[normalizedKey] = this.convertToNumber(value);
                continue;
            }

            if (typeof value === 'string') {
                const trimmedValue = value.trim();
                if (this.isBooleanString(trimmedValue)) {
                    jsonObject[normalizedKey] = this.convertToBoolean(trimmedValue);
                } else if (trimmedValue === '' || trimmedValue.toLowerCase() === 'null') {
                    jsonObject[normalizedKey] = null;
                } else if (autoNumeric && /^-?[0-9]+(\.[0-9]+)?$/.test(trimmedValue)) {
                    jsonObject[normalizedKey] = parseFloat(trimmedValue);
                } else {
                    jsonObject[normalizedKey] = trimmedValue;
                }
            } else if (value === null || value === undefined) {
                jsonObject[normalizedKey] = null;
            } else {
                jsonObject[normalizedKey] = value;
            }
        }

        return jsonObject;
    }

    /**
     * Converts a value to a string array by splitting on the configured delimiter.
     *
     * @param {unknown} value - Raw value
     * @returns {string[]} Array of trimmed, non-empty strings
     */
    convertToArray(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map(String);
        }
        if (typeof value === 'string' && value.trim()) {
            return value
                .split(this.arrayDelimiter)
                .map((item) => item.trim())
                .filter(Boolean);
        }
        return [];
    }

    /**
     * Converts a value to a boolean. Recognises `true/false`, `yes/no`, `1/0`.
     *
     * @param {unknown} value - Raw value
     * @returns {boolean} Coerced boolean
     */
    convertToBoolean(value: unknown): boolean {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            return lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1';
        }
        return false;
    }

    /**
     * Converts a value to a number. Returns `0` for non-numeric input.
     *
     * @param {unknown} value - Raw value
     * @returns {number} Coerced number
     */
    convertToNumber(value: unknown): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const num = parseFloat(value.trim());
            return isNaN(num) ? 0 : num;
        }
        return 0;
    }

    /**
     * Checks whether a string represents a boolean value.
     *
     * @param {string} value - String to test
     * @returns {boolean} `true` if the string is `'true'`, `'false'`, `'yes'`, `'no'`, `'1'`, or `'0'`
     */
    isBooleanString(value: string): boolean {
        const lowerValue = value.toLowerCase();
        return ['true', 'false', 'yes', 'no', '1', '0'].includes(lowerValue);
    }
}

export default TypeCoercionHelper;

