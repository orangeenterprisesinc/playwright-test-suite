/**
 * @fileoverview Standalone database query execution utilities for development MySQL database.
 *
 * Provides convenient functions for querying single rows, multiple rows, and executing
 * DML statements against a development MySQL database. This module is independent and
 * does not rely on databaseConnectionManager.
 *
 * @module utils/databaseQueryExecutor
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { queryFirstRow, queryAllRows, executeUpdate, closeDevConnection } from '@utils/databaseQueryExecutor';
 *
 * const user = await queryFirstRow('SELECT * FROM users WHERE id = 1');
 * const all  = await queryAllRows('SELECT * FROM users');
 * const changed = await executeUpdate('UPDATE users SET active = 1 WHERE id = ?', [42]);
 * await closeDevConnection();
 * ```
 */
import fs from 'fs';
import path from 'path';
import {Logger} from './logger';
import {DatabaseException} from '../exceptions/frameworkExceptions';

/**
 * Represents a MySQL connection pool (from mysql2/promise).
 */
export interface MySqlPool {
    execute(sql: string, values?: unknown[]): Promise<[unknown[], unknown]>;
    end(): Promise<void>;
}

/**
 * Type guard: returns `true` when the connection is a MySQL pool (has `execute` method).
 *
 * @param {unknown} conn - Database connection to test
 * @returns {boolean} `true` if MySQL pool
 */
export function isMySqlPool(conn: unknown): conn is MySqlPool {
    return typeof (conn as Record<string, unknown>).execute === 'function';
}

const logger = new Logger('DatabaseQueryExecutor');
let devMysqlPool: MySqlPool | null = null;

/**
 * Loads dev database configuration from `src/data/devDb_config.json`.
 *
 * @returns {Record<string, string | number>} Parsed dev DB config, or empty object if file not found
 */
function loadDevDbConfig(): Record<string, string | number> {
    const configPath = path.resolve(__dirname, '..', 'data', 'devDb_config.json');
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Gets or creates a MySQL connection pool for the development database.
 *
 * Connection parameters are read from environment configuration:
 * - DEV_DB_HOST (default: 'localhost')
 * - DEV_DB_PORT (default: '3306')
 * - DEV_DB_NAME
 * - DEV_DB_USER
 * - DEV_DB_PASSWORD
 *
 * @returns {Promise<MySqlPool>} MySQL connection pool
 * @throws {DatabaseException} If mysql2 is not installed or connection fails
 */
export async function getDevConnection(): Promise<MySqlPool> {
    if (devMysqlPool) return devMysqlPool;

    try {
        const mysql = await import('mysql2/promise');
        const devDb = loadDevDbConfig();

        const host = (devDb.DEV_DB_HOST as string) || 'localhost';
        const port = devDb.DEV_DB_PORT ? Number(devDb.DEV_DB_PORT) : 3306;
        const database = (devDb.DEV_DB_NAME as string) || '';
        const user = (devDb.DEV_DB_USER as string) || '';
        const password = (devDb.DEV_DB_PASSWORD as string) || '';

        devMysqlPool = mysql.createPool({
            host,
            port,
            user,
            password,
            ...(database ? { database } : {}),
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
        }) as unknown as MySqlPool;
        logger.info(`Dev MySQL pool created — ${host}:${port}/${database || '(no default schema)'}`);
        return devMysqlPool;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Cannot find module') || msg.includes('MODULE_NOT_FOUND')) {
            throw new DatabaseException('mysql2 is not installed. Run: npm install mysql2');
        }
        throw new DatabaseException(`Dev MySQL connection failed: ${msg}`);
    }
}

/**
 * Executes a query and returns the first result row as a string-valued record.
 *
 * @param {string} query - SQL query
 * @returns {Promise<Record<string, string>>} First row (empty object if none)
 * @throws {DatabaseException} On query failure
 */
export async function queryFirstRow(query: string): Promise<Record<string, string>> {
    try {
        return await retrieveRowData(query);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Query failed: ${msg}`);
        throw new DatabaseException(`Query execution failed: ${msg}`);
    }
}

/**
 * Executes a query and returns all result rows as string-valued records.
 *
 * @param {string} query - SQL query
 * @returns {Promise<Record<string, string>[]>} Array of rows
 * @throws {DatabaseException} On query failure
 */
export async function queryAllRows(query: string): Promise<Record<string, string>[]> {
    try {
        const pool = await getDevConnection();
        const [rows] = await pool.execute(query);
        return (rows as Record<string, unknown>[]).map((row) => {
            const result: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) result[k] = String(v ?? '');
            return result;
        });
    } catch (err) {
        if (err instanceof DatabaseException) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Query failed: ${msg}`);
        throw new DatabaseException(`Query execution failed: ${msg}`);
    }
}

/**
 * Executes a DML statement (INSERT/UPDATE/DELETE) and returns the number of affected rows.
 *
 * @param {string} query - SQL DML statement
 * @param {unknown[]} [params=[]] - Bind parameters
 * @returns {Promise<number>} Number of affected rows
 * @throws {DatabaseException} On execution failure
 */
export async function executeUpdate(query: string, params: unknown[] = []): Promise<number> {
    try {
        const pool = await getDevConnection();
        const [result] = await pool.execute(query, params);
        return (result as { affectedRows?: number }).affectedRows ?? 0;
    } catch (err) {
        if (err instanceof DatabaseException) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Update failed: ${msg}`);
        throw new DatabaseException(`Update execution failed: ${msg}`);
    }
}

/**
 * Internal helper: Executes a query and returns the first row as a string-valued record.
 *
 * @param {string} query - SQL query to execute
 * @returns {Promise<Record<string, string>>} First row (empty object if none)
 * @throws {DatabaseException} On query failure
 */
export async function retrieveRowData(query: string): Promise<Record<string, string>> {
    const pool = await getDevConnection();
    const [rows] = await pool.execute(query);
    const rowArray = rows as Record<string, unknown>[];
    if (!rowArray || rowArray.length === 0) return {};
    const first = rowArray[0];
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(first)) result[k] = String(v ?? '');
    return result;
}

/**
 * Closes the development MySQL connection pool.
 * Logs warnings on close errors but does not throw.
 */
export async function closeDevConnection(): Promise<void> {
    if (devMysqlPool) {
        try {
            await devMysqlPool.end();
        } catch (err) {
            logger.warn(`Error closing Dev MySQL pool: ${err instanceof Error ? err.message : String(err)}`);
        }
        devMysqlPool = null;
        logger.info('Dev MySQL pool closed');
    }
}
