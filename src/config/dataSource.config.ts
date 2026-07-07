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
 * @property {string} jsonPath - Absolute path to the JSON test data file
 * @property {string} csvPath - Absolute path to the CSV test data file
 * @property {string} sheetName - Record-set key for readers that support one
 */
export interface DataSourceConfig {
    type: DataSourceType;
    jsonPath: string;
    csvPath: string;
    sheetName: string;
}

/**
 * Builds and returns the complete data source configuration by resolving
 * environment variables with default fallbacks.
 *
 * ### Environment Variables
 * | Variable              | Default                        | Description                    |
 * |-----------------------|--------------------------------|--------------------------------|
 * | `TEST_DATA_SOURCE`    | `'json'`                       | Active data source type        |
 * | `DATA_FILE_PATH_JSON` | `'src/data/runnerManager.json'`| JSON file path (relative)      |
 * | `DATA_FILE_PATH_CSV`  | `'src/data/runnerManager.csv'` | CSV file path (relative)       |
 * | `DATA_SHEET_NAME`     | `'runnerManager'`              | Record-set key                 |
 *
 * @returns {DataSourceConfig} Fully resolved data source configuration
 */
export function getDataSourceConfig(): DataSourceConfig {
    const projectRoot = path.resolve(__dirname, '..', '..');

    return {
        type: (process.env.TEST_DATA_SOURCE as DataSourceType) || 'json',
        jsonPath: path.join(
            projectRoot,
            process.env.DATA_FILE_PATH_JSON || 'src/data/runnerManager.json',
        ),
        csvPath: path.join(projectRoot, process.env.DATA_FILE_PATH_CSV || 'src/data/runnerManager.csv'),
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
