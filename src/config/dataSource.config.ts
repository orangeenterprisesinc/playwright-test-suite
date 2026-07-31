/**
 * @fileoverview Data source configuration for test data management.
 *
 * Resolves data source paths from environment variables, with sensible
 * defaults for local development. Supports JSON and CSV sources — data is
 * always read DIRECTLY from the configured file, never converted.
 */
import path from 'path';
import { loadEnvFiles } from './envLoader';
import type {DataSourceType} from '../types';

loadEnvFiles({ cwd: path.resolve(__dirname, '..', '..') });

/** Complete configuration for resolving test data sources. */
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
 */
export function getCurrentDataSourceType(): DataSourceType {
    return getDataSourceConfig().type;
}
