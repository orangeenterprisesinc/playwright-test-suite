/**
 * @fileoverview Data preprocessing pipeline that converts all supported data sources
 * (CSV, Excel, SQLite) into a unified JSON format before test execution.
 *
 * The preprocessor runs during {@link globalSetup} and ensures every test consumes
 * a single, normalised `runnerManager.json` file — regardless of the original
 * data source configured via `process.env.TEST_DATA_SOURCE`.
 *
 * ### Pipeline Flow
 * ```
 * env.qe (TEST_DATA_SOURCE) → DataPreprocessor.preprocess()
 *   → Read source (CSV / Excel / DB)
 *   → Transform to standardised JSON
 *   → Backup original JSON
 *   → Persist to src/data/runnerManager.json
 *   → Tests consume JSON only
 * ```
 *
 * @module utils/DataPreprocessor
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { DataPreprocessor } from '../utils/DataPreprocessor';
 *
 * // In global-setup.ts
 * await DataPreprocessor.preprocess();
 *
 * // In global-teardown.ts
 * DataPreprocessor.restoreOriginalJson();
 * ```
 */
import fs from 'fs';
import path from 'path';
import { Logger } from './logger';
import { CsvDataReader, DatabaseDataReader, ExcelDataReader } from './dataReaders';
import { getDataSourceConfig, type DataSourceConfig } from '../config/dataSource.config';
import type { DataSourceType } from '../types';

/**
 * Metadata embedded in the generated JSON file for traceability.
 *
 * @interface PreprocessMetadata
 */
export interface PreprocessMetadata {
    /** Original data source type that was converted */
    sourceType: DataSourceType;
    /** Absolute path to the original source file */
    originalSource: string;
    /** ISO-8601 timestamp of when the conversion was performed */
    generatedAt: string;
    /** Total number of records converted */
    recordCount: number;
    /** Identifier of the conversion engine */
    preprocessedBy: string;
}

/**
 * Result returned by {@link DataPreprocessor.preprocess}.
 *
 * @interface PreprocessResult
 */
export interface PreprocessResult {
    /** Whether preprocessing was actually performed (false when source is already JSON) */
    converted: boolean;
    /** The data source type that was processed */
    sourceType: DataSourceType;
    /** Path to the output JSON file */
    outputPath: string;
    /** Number of records written */
    recordCount: number;
    /** Path to the backup file (null when no backup was needed) */
    backupPath: string | null;
}

/**
 * Static utility that converts CSV, Excel, and SQLite data sources into a
 * unified JSON format and persists the result to `src/data/runnerManager.json`.
 *
 * @class DataPreprocessor
 */
export class DataPreprocessor {

    /** @private Logger scoped to the preprocessor */
    private static readonly logger = new Logger('DataPreprocessor');

    /** @private Backup file extension */
    private static readonly BACKUP_EXT = '.preprocessing.bak';

    /**
     * Executes the full preprocessing pipeline:
     *
     * 1. Reads `TEST_DATA_SOURCE` from the environment
     * 2. If source is `json`, skips conversion (already in target format)
     * 3. Reads all records from the configured source using the appropriate reader
     * 4. Backs up the existing `runnerManager.json`
     * 5. Writes the normalised JSON with `_metadata` and `runnerManager` keys
     *
     * @returns {Promise<PreprocessResult>} Conversion result with metadata
     * @throws {Error} If the source file does not exist or cannot be read
     *
     * @example
     * ```typescript
     * const result = await DataPreprocessor.preprocess();
     * console.log(`Converted ${result.recordCount} records from ${result.sourceType}`);
     * ```
     */
    static async preprocess(): Promise<PreprocessResult> {
        const config = getDataSourceConfig();
        const sourceType = config.type;
        const outputPath = config.jsonPath;

        DataPreprocessor.logger.info(
            `Preprocessing pipeline started — source: ${sourceType}`,
        );

        // ── Skip when source is already JSON ───────────────────
        if (sourceType === 'json') {
            DataPreprocessor.logger.info(
                'Source is already JSON — skipping conversion',
            );
            const existing = DataPreprocessor.readExistingJson(outputPath, config.sheetName);
            return {
                converted: false,
                sourceType,
                outputPath,
                recordCount: existing.length,
                backupPath: null,
            };
        }

        // ── Validate source file exists ────────────────────────
        const sourcePath = DataPreprocessor.resolveSourcePath(sourceType, config);
        DataPreprocessor.validateSourceExists(sourcePath, sourceType);

        // ── Read records from source ───────────────────────────
        const records = await DataPreprocessor.readFromSource(sourceType, config);
        DataPreprocessor.logger.info(
            `Read ${records.length} records from ${sourceType} source: ${sourcePath}`,
        );

        if (records.length === 0) {
            DataPreprocessor.logger.warn(
                'No records found in source — writing empty array to JSON',
            );
        }

        // ── Backup original JSON ───────────────────────────────
        const backupPath = DataPreprocessor.backupOriginalJson(outputPath);

        // ── Build output structure ─────────────────────────────
        const metadata: PreprocessMetadata = {
            sourceType,
            originalSource: sourcePath,
            generatedAt: new Date().toISOString(),
            recordCount: records.length,
            preprocessedBy: 'DataPreprocessor',
        };

        const outputData = {
            _metadata: metadata,
            [config.sheetName]: records,
        };

        // ── Write normalised JSON ──────────────────────────────
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
        DataPreprocessor.logger.info(
            `Wrote ${records.length} records to ${outputPath}`,
        );

        // ── Set environment flag for downstream consumers ──────
        process.env.DATA_PREPROCESSED = 'true';
        process.env.DATA_PREPROCESSED_SOURCE = sourceType;

        return {
            converted: true,
            sourceType,
            outputPath,
            recordCount: records.length,
            backupPath,
        };
    }

    /**
     * Restores the original `runnerManager.json` from the backup created
     * during {@link preprocess}. Safe to call even if no backup exists.
     *
     * @returns {boolean} `true` if the backup was restored, `false` otherwise
     *
     * @example
     * ```typescript
     * // In global-teardown.ts
     * DataPreprocessor.restoreOriginalJson();
     * ```
     */
    static restoreOriginalJson(): boolean {
        const config = getDataSourceConfig();
        const jsonPath = config.jsonPath;
        const backupPath = jsonPath + DataPreprocessor.BACKUP_EXT;

        if (!fs.existsSync(backupPath)) {
            DataPreprocessor.logger.debug('No backup file found — nothing to restore');
            return false;
        }

        try {
            fs.copyFileSync(backupPath, jsonPath);
            fs.unlinkSync(backupPath);
            DataPreprocessor.logger.info(
                `Restored original JSON from backup: ${backupPath}`,
            );
            return true;
        } catch (error) {
            DataPreprocessor.logger.error(
                `Failed to restore backup: ${error}`,
            );
            return false;
        }
    }

    // ── Private helpers ─────────────────────────────────────────

    /**
     * Resolves the absolute path to the source file for the given type.
     * @private
     */
    private static resolveSourcePath(
        sourceType: DataSourceType,
        config: DataSourceConfig,
    ): string {
        switch (sourceType) {
            case 'csv':
                return config.csvPath;
            case 'excel':
                return config.excelPath;
            case 'db':
                return config.dbPath;
            default:
                return config.jsonPath;
        }
    }

    /**
     * Validates that the source file exists before attempting to read.
     * @private
     * @throws {Error} If the source file is not found
     */
    private static validateSourceExists(
        sourcePath: string,
        sourceType: DataSourceType,
    ): void {
        if (!fs.existsSync(sourcePath)) {
            const msg = `Data source file not found: ${sourcePath} (type: ${sourceType}). ` +
                `Ensure the file exists or update TEST_DATA_SOURCE in your env file.`;
            DataPreprocessor.logger.error(msg);
            throw new Error(msg);
        }
    }

    /**
     * Reads all records from the configured data source using the appropriate reader.
     * @private
     */
    private static async readFromSource(
        sourceType: DataSourceType,
        config: DataSourceConfig,
    ): Promise<Record<string, unknown>[]> {
        switch (sourceType) {
            case 'csv': {
                const reader = new CsvDataReader(config.csvPath);
                return reader.readAll<Record<string, unknown>>();
            }
            case 'excel': {
                const reader = new ExcelDataReader(config.excelPath, config.sheetName);
                return reader.readAll<Record<string, unknown>>();
            }
            case 'db': {
                const reader = new DatabaseDataReader(config.dbPath, config.sheetName);
                try {
                    return await reader.readAll<Record<string, unknown>>();
                } finally {
                    await reader.close();
                }
            }
            default:
                throw new Error(`Unsupported source type for preprocessing: ${sourceType}`);
        }
    }

    /**
     * Creates a backup of the existing `runnerManager.json` before overwriting.
     * @private
     * @returns {string | null} Path to the backup file, or null if no backup was created
     */
    private static backupOriginalJson(jsonPath: string): string | null {
        if (!fs.existsSync(jsonPath)) {
            DataPreprocessor.logger.debug(
                'No existing JSON file to backup',
            );
            return null;
        }

        const backupPath = jsonPath + DataPreprocessor.BACKUP_EXT;
        try {
            fs.copyFileSync(jsonPath, backupPath);
            DataPreprocessor.logger.info(`Backed up original JSON to: ${backupPath}`);
            return backupPath;
        } catch (error) {
            DataPreprocessor.logger.warn(
                `Could not backup JSON file: ${error}`,
            );
            return null;
        }
    }

    /**
     * Reads the existing JSON file and returns the records from the configured section.
     * @private
     */
    private static readExistingJson(
        jsonPath: string,
        sectionName: string,
    ): unknown[] {
        try {
            if (!fs.existsSync(jsonPath)) return [];
            const content = fs.readFileSync(jsonPath, 'utf-8');
            const parsed = JSON.parse(content);
            const section = parsed[sectionName];
            return Array.isArray(section) ? section : [];
        } catch {
            return [];
        }
    }
}

export default DataPreprocessor;

