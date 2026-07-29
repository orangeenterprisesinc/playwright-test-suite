/**
 * @fileoverview Data source configuration for test data management.
 *
 * Resolves data source paths from environment variables, with sensible
 * defaults for local development. Supports JSON and CSV sources — data is
 * always read DIRECTLY from the configured file, never converted.
 *
 * @module config/dataSource.config
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getDataSourceConfig, getCurrentDataSourceType } from '../config/dataSource.config';
 *
 * const config = getDataSourceConfig();
 * console.log(config.type);     // 'json' | 'csv'
 * console.log(config.jsonPath); // '/absolute/path/to/runnerManager.json'
 * ```
 */
import path from 'path';
import { loadEnvFiles } from './envLoader';
import type {DataSourceType} from '../types';

loadEnvFiles({ cwd: path.resolve(__dirname, '..', '..') });

/**
 * Complete configuration for resolving test data sources.
 *
 * @interface DataSourceConfig
 * @property {DataSourceType} type - Active data source type (`'json'` | `'csv'`)
 * @property {string} runnerDir - Absolute path to the directory of per-journey runner files
 * @property {boolean} useRunnerDir - Whether to read the directory (false when a single-file override is set)
 * @property {string} jsonPath - Absolute path to a single JSON test data file (override)
 * @property {string} csvPath - Absolute path to a single CSV test data file (override)
 * @property {string} sheetName - Record-set key for readers that support one
 */
export interface DataSourceConfig {
    type: DataSourceType;
    runnerDir: string;
    useRunnerDir: boolean;
    jsonPath: string;
    csvPath: string;
    sheetName: string;
}

/**
 * Builds and returns the complete data source configuration by resolving
 * environment variables with default fallbacks.
 *
 * Runner rows normally live one file per journey in `RUNNER_DATA_DIR`
 * (`src/data/runner/`), read as one combined set by `MultiFileDataReader`.
 * Setting `DATA_FILE_PATH_JSON` or `DATA_FILE_PATH_CSV` switches to that single
 * file instead — an escape hatch for running against one hand-made data file
 * without touching the committed rows.
 *
 * ### Environment Variables
 * | Variable              | Default              | Description                        |
 * |-----------------------|----------------------|------------------------------------|
 * | `TEST_DATA_SOURCE`    | `'json'`             | Active data source type            |
 * | `RUNNER_DATA_DIR`     | `'src/data/runner'`  | Directory of per-journey row files |
 * | `DATA_FILE_PATH_JSON` | *(unset)*            | Single JSON file override          |
 * | `DATA_FILE_PATH_CSV`  | *(unset)*            | Single CSV file override           |
 * | `DATA_SHEET_NAME`     | `'runnerManager'`    | Record-set key within each JSON    |
 *
 * @returns {DataSourceConfig} Fully resolved data source configuration
 */
export function getDataSourceConfig(): DataSourceConfig {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const type = (process.env.TEST_DATA_SOURCE as DataSourceType) || 'json';

    const jsonOverride = process.env.DATA_FILE_PATH_JSON;
    const csvOverride = process.env.DATA_FILE_PATH_CSV;
    const override = type === 'csv' ? csvOverride : jsonOverride;

    return {
        type,
        runnerDir: path.join(projectRoot, process.env.RUNNER_DATA_DIR || 'src/data/runner'),
        useRunnerDir: !override,
        jsonPath: path.join(projectRoot, jsonOverride || 'src/data/runner/journey-a.json'),
        csvPath: path.join(projectRoot, csvOverride || 'src/data/runner/journey-a.csv'),
        sheetName: process.env.DATA_SHEET_NAME || 'runnerManager',
    };
}

/**
 * Returns the currently active data source type from the configuration.
 *
 * Shorthand for `getDataSourceConfig().type`.
 *
 * @returns {DataSourceType} The active data source type (`'json'` | `'csv'`)
 *
 * @example
 * ```typescript
 * const sourceType = getCurrentDataSourceType(); // 'json'
 * ```
 */
export function getCurrentDataSourceType(): DataSourceType {
    return getDataSourceConfig().type;
}
