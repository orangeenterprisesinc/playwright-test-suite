/**
 * @fileoverview Data source configuration for multi-source test data management.
 *
 * Resolves all data source paths and connection details from environment variables,
 * with sensible defaults for local development. Supports JSON, CSV, Excel, and
 * database (SQLite / MySQL) sources.
 *
 * @module config/dataSource.config
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getDataSourceConfig, getCurrentDataSourceType } from '../config/dataSource.config';
 *
 * const config = getDataSourceConfig();
 * console.log(config.type);     // 'json' | 'csv' | 'excel' | 'db'
 * console.log(config.jsonPath); // '/absolute/path/to/runnerManager.json'
 * ```
 */
import fs from 'fs';
import path from 'path';
import { loadEnvFiles } from './envLoader';
import type {DataSourceType} from '../types';

loadEnvFiles({ cwd: path.resolve(__dirname, '..', '..') });

/**
 * Supported database engine types for data-source-backed test data.
 *
 * - `'sqlite'` — Local file-based SQLite database
 * - `'mysql'` — Remote MySQL database server
 */
export type DatabaseType = 'sqlite' | 'mysql';

/**
 * Complete configuration for resolving and connecting to test data sources.
 *
 * @interface DataSourceConfig
 * @property {DataSourceType} type - Active data source type (`'json'` | `'csv'` | `'excel'` | `'db'`)
 * @property {string} jsonPath - Absolute path to the JSON test data file
 * @property {string} csvPath - Absolute path to the CSV test data file
 * @property {string} excelPath - Absolute path to the Excel (.xlsx) test data file
 * @property {DatabaseType} dbType - Database engine type (`'sqlite'` or `'mysql'`)
 * @property {string} dbPath - Absolute path to the SQLite database file
 * @property {string} [dbHost] - MySQL host (only for `dbType: 'mysql'`)
 * @property {number} [dbPort] - MySQL port (only for `dbType: 'mysql'`)
 * @property {string} [dbName] - MySQL database name
 * @property {string} [dbUser] - MySQL username
 * @property {string} [dbPassword] - MySQL password
 * @property {string} sheetName - Excel sheet name to read data from
 */
export interface DataSourceConfig {
    type: DataSourceType;
    jsonPath: string;
    csvPath: string;
    excelPath: string;
    dbType: DatabaseType;
    dbPath: string;
    dbHost?: string;
    dbPort?: number;
    dbName?: string;
    dbUser?: string;
    dbPassword?: string;
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
 * | `DATA_FILE_PATH_EXCEL`| `'src/data/runnerManager.xlsx'`| Excel file path (relative)     |
 * | `DB_TYPE`             | `'sqlite'`                     | Database type                  |
 * | `DB_PATH`             | `'src/data/runnerManager.db'`  | SQLite file path (relative)    |
 * | *(from `cloudDb_config.json`)* |                          |                                |
 * | `DB_HOST`             | —                              | MySQL host                     |
 * | `DB_PORT`             | —                              | MySQL port                     |
 * | `DB_NAME`             | —                              | MySQL database name            |
 * | `DB_USER`             | —                              | MySQL username                 |
 * | `DB_PASSWORD`         | —                              | MySQL password                 |
 * | `DATA_SHEET_NAME`     | `'runnerManager'`              | Excel sheet name               |
 *
 * @returns {DataSourceConfig} Fully resolved data source configuration
 *
 * @example
 * ```typescript
 * const config = getDataSourceConfig();
 * if (config.type === 'db' && config.dbType === 'mysql') {
 *   console.log(`Connecting to MySQL at ${config.dbHost}:${config.dbPort}`);
 * }
 * ```
 */
/**
 * Loads cloud database configuration from `src/data/cloudDb_config.json`.
 *
 * @returns {Record<string, string | number>} Parsed cloud DB config, or empty object if file not found
 */
function loadCloudDbConfig(): Record<string, string | number> {
    const configPath = path.resolve(__dirname, '..', 'data', 'cloudDb_config.json');
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function getDataSourceConfig(): DataSourceConfig {
    const projectRoot = path.resolve(__dirname, '..', '..');
    const cloudDb = loadCloudDbConfig();

    return {
        type: (process.env.TEST_DATA_SOURCE as DataSourceType) || 'json',
        jsonPath: path.join(
            projectRoot,
            process.env.DATA_FILE_PATH_JSON || 'src/data/runnerManager.json',
        ),
        csvPath: path.join(projectRoot, process.env.DATA_FILE_PATH_CSV || 'src/data/runnerManager.csv'),
        excelPath: path.join(
            projectRoot,
            process.env.DATA_FILE_PATH_EXCEL || 'src/data/runnerManager.xlsx',
        ),
        dbType: (process.env.DB_TYPE as DatabaseType) || 'sqlite',
        dbPath: path.join(projectRoot, process.env.DB_PATH || 'src/data/runnerManager.db'),
        dbHost: cloudDb.DB_HOST as string | undefined,
        dbPort: cloudDb.DB_PORT ? Number(cloudDb.DB_PORT) : undefined,
        dbName: cloudDb.DB_NAME as string | undefined,
        dbUser: cloudDb.DB_USER as string | undefined,
        dbPassword: cloudDb.DB_PASSWORD as string | undefined,
        sheetName: process.env.DATA_SHEET_NAME || 'runnerManager',
    };
}

/**
 * Returns the currently active data source type from the configuration.
 *
 * Shorthand for `getDataSourceConfig().type`.
 *
 * @returns {DataSourceType} The active data source type (`'json'` | `'csv'` | `'excel'` | `'db'`)
 *
 * @example
 * ```typescript
 * const sourceType = getCurrentDataSourceType(); // 'json'
 * ```
 */
export function getCurrentDataSourceType(): DataSourceType {
    return getDataSourceConfig().type;
}
