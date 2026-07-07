/**
 * @fileoverview Database connection management for MySQL (remote) and SQLite (local).
 *
 * Provides a unified {@link getConnection} entry point that delegates to MySQL or
 * SQLite based on the configured `RUN_MODE`. Cloud database credentials are read
 * from `DatabaseConfig.json` with Base64-decoded usernames and passwords.
 *
 * @module utils/databaseConnectionManager
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getConnection, retrieveRowData, closeConnection } from '@utils/databaseConnectionManager';
 *
 * const conn = await getConnection();
 * const row  = await retrieveRowData('SELECT * FROM users LIMIT 1');
 * await closeConnection();
 * ```
 */
import fs from 'fs';
import path from 'path';
import {Logger} from './logger';
import {decodeBase64UTF8} from './stringDecoder';
import {ConfigProperties, getConfigValue} from '../enums/configProperties';
import {FrameworkConstants} from '../constants/frameworkConstants';
import {DatabaseException} from '../exceptions/frameworkExceptions';

const logger = new Logger('DatabaseConnectionManager');

/**
 * Keys used to look up cloud database configuration values from `DatabaseConfig.json`.
 *
 * @enum {string}
 */
export enum CloudDbProperty {
    HOSTNAME = 'hostname',
    PORT = 'port',
    SCHEMA = 'schema',
    DBUSERNAME = 'dbusername',
    DBPASSWORD = 'dbpassword',
}

/** Represents a MySQL connection pool (from mysql2/promise) */
export interface MySqlPool {
    execute(sql: string, values?: unknown[]): Promise<[unknown[], unknown]>;
    end(): Promise<void>;
}

/** Represents a better-sqlite3 Database instance */
export interface SqliteDatabase {
    prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[]; run(...params: unknown[]): { changes: number } };
    exec(sql: string): void;
    close(): void;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
}

export type DatabaseConnection = MySqlPool | SqliteDatabase;

/**
 * Type guard: returns `true` when the connection is a MySQL pool (has `execute` method).
 *
 * @param {unknown} conn - Database connection to test
 * @returns {boolean} `true` if MySQL pool
 */
export function isMySqlPool(conn: unknown): conn is MySqlPool {
    return typeof (conn as Record<string, unknown>).execute === 'function';
}

/**
 * Type guard: returns `true` when the connection is an SQLite database (has `prepare` method but no `execute`).
 *
 * @param {unknown} conn - Database connection to test
 * @returns {boolean} `true` if SQLite database
 */
export function isSqliteDb(conn: unknown): conn is SqliteDatabase {
    return typeof (conn as Record<string, unknown>).prepare === 'function'
        && typeof (conn as Record<string, unknown>).execute !== 'function';
}

const cloudConfigMap: Record<string, string> = {};
let mysqlPool: MySqlPool | null = null;
let sqliteDb: SqliteDatabase | null = null;

function getRunMode(): string {
    return getConfigValue(ConfigProperties.RUN_MODE, 'local').toLowerCase();
}

function loadCloudDbConfig(): Record<string, string> {
    if (Object.keys(cloudConfigMap).length > 0) return cloudConfigMap;

    const configPath = path.join(FrameworkConstants.DATA_DIR, 'DatabaseConfig.json');
    if (!fs.existsSync(configPath)) {
        logger.warn(`Cloud DB config not found at ${configPath}`);
        return cloudConfigMap;
    }

    try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        for (const [k, v] of Object.entries(raw)) {
            cloudConfigMap[k.toLowerCase()] = String(v);
        }
        logger.info(`Loaded cloud DB config from ${configPath}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new DatabaseException(`Failed to parse DatabaseConfig.json: ${msg}`);
    }
    return cloudConfigMap;
}

/**
 * Retrieves a cloud database configuration value by key.
 *
 * @param {CloudDbProperty} key - Configuration key
 * @returns {string} Configuration value
 * @throws {DatabaseException} If the key is not found in `DatabaseConfig.json`
 */
export function getCloudDbValue(key: CloudDbProperty): string {
    const config = loadCloudDbConfig();
    const value = config[key];
    if (value === undefined) {
        throw new DatabaseException(`Cloud DB property "${key}" not found in DatabaseConfig.json`);
    }
    return value;
}

async function connectToMySQL(): Promise<MySqlPool> {
    if (mysqlPool) return mysqlPool;

    try {
        const mysql = await import('mysql2/promise');
        const config = loadCloudDbConfig();

        const host =
            config[CloudDbProperty.HOSTNAME] ||
            getConfigValue(ConfigProperties.DB_HOST, 'localhost');
        const port = Number(
            config[CloudDbProperty.PORT] || getConfigValue(ConfigProperties.DB_PORT, '3306'),
        );
        const database =
            config[CloudDbProperty.SCHEMA] || getConfigValue(ConfigProperties.DB_NAME, '');
        const user = decodeBase64UTF8(
            config[CloudDbProperty.DBUSERNAME] || getConfigValue(ConfigProperties.DB_USER, ''),
        );
        const password = decodeBase64UTF8(
            config[CloudDbProperty.DBPASSWORD] || getConfigValue(ConfigProperties.DB_PASSWORD, ''),
        );

        mysqlPool = mysql.createPool({
            host,
            port,
            user,
            password,
            database,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
        }) as unknown as MySqlPool;
        logger.info(`MySQL pool created — ${host}:${port}/${database}`);
        return mysqlPool;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
            throw new DatabaseException('mysql2 is not installed. Run: npm install mysql2');
        }
        throw new DatabaseException(`MySQL connection failed: ${msg}`);
    }
}

function connectToSQLite(): SqliteDatabase {
    if (sqliteDb) return sqliteDb;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require('better-sqlite3');
        const dbPath = FrameworkConstants.TEST_DATA_DB;
        const db: SqliteDatabase = new Database(dbPath);
        sqliteDb = db;
        logger.info(`SQLite connected — ${dbPath}`);
        return db;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
            throw new DatabaseException(
                'better-sqlite3 is not installed. Run: npm install better-sqlite3',
            );
        }
        throw new DatabaseException(`SQLite connection failed: ${msg}`);
    }
}


/**
 * Returns a database connection appropriate for the current `RUN_MODE`.
 *
 * - `'remote'` → MySQL connection pool
 * - `'local'`  → SQLite database handle
 *
 * @returns {Promise<DatabaseConnection>} Active connection
 * @throws {DatabaseException} On invalid `RUN_MODE` or connection failure
 */
export async function getConnection(): Promise<DatabaseConnection> {
    const mode = getRunMode();
    if (mode === 'remote') return connectToMySQL();
    if (mode === 'local') return connectToSQLite();
    throw new DatabaseException(`Invalid RUN_MODE: "${mode}". Expected "local" or "remote".`);
}

/**
 * Executes a SQL query and returns the first row as a string-valued record.
 *
 * @param {string} query - SQL query to execute
 * @returns {Promise<Record<string, string>>} First row (empty object if none)
 */
export async function retrieveRowData(query: string): Promise<Record<string, string>> {
    const mode = getRunMode();
    if (mode === 'remote') {
        const pool = await connectToMySQL();
        const [rows] = await pool.execute(query);
        const rowArray = rows as Record<string, unknown>[];
        if (!rowArray || rowArray.length === 0) return {};
        const first = rowArray[0];
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(first)) result[k] = String(v ?? '');
        return result;
    }
    const db = connectToSQLite();
    const row = db.prepare(query).get();
    if (!row) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>))
        result[k] = String(v ?? '');
    return result;
}

/**
 * Gracefully closes both MySQL and SQLite connections (if open).
 * Logs warnings on close errors but does not throw.
 */
export async function closeConnection(): Promise<void> {
    if (mysqlPool) {
        try {
            await mysqlPool.end();
        } catch (err) {
            logger.warn(`Error closing MySQL pool: ${err instanceof Error ? err.message : String(err)}`);
        }
        mysqlPool = null;
        logger.info('MySQL pool closed');
    }
    if (sqliteDb) {
        try {
            sqliteDb.close();
        } catch (err) {
            logger.warn(`Error closing SQLite connection: ${err instanceof Error ? err.message : String(err)}`);
        }
        sqliteDb = null;
        logger.info('SQLite connection closed');
    }
}
