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
 */
export class TypeCoercionHelper {
    private static readonly ARRAY_COLUMNS = ['tags', 'segments', 'modules'];

    /** @private Columns that should be converted to numbers */
    private static readonly NUMERIC_COLUMNS = [
        'expectedCount', 'count', 'quantity', 'price', 'amount', 'total',
    ];

    /** @private Columns that should be converted to booleans */
    private static readonly BOOLEAN_COLUMNS = [
        'enabled', 'shouldComplete', 'completed', 'active', 'demo',
    ];

    constructor(private readonly arrayDelimiter: string = '|') {}

    /**
     * Transforms a raw row object into a properly typed JSON record.
     *
     * Applies column-specific coercion based on well-known column names,
     * then falls back to heuristic type detection for remaining fields.
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

    /** Converts a value to a string array by splitting on the configured delimiter. */
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

    /** Converts a value to a boolean. Recognises `true/false`, `yes/no`, `1/0`. */
    convertToBoolean(value: unknown): boolean {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            return lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1';
        }
        return false;
    }

    /** Converts a value to a number. Returns `0` for non-numeric input. */
    convertToNumber(value: unknown): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const num = parseFloat(value.trim());
            return isNaN(num) ? 0 : num;
        }
        return 0;
    }

    /** Checks whether a string represents a boolean value. */
    isBooleanString(value: string): boolean {
        const lowerValue = value.toLowerCase();
        return ['true', 'false', 'yes', 'no', '1', '0'].includes(lowerValue);
    }
}

export default TypeCoercionHelper;

