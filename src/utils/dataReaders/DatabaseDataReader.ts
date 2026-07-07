/**
 * @fileoverview Unified database reader supporting both MySQL (remote) and SQLite (local).
 *
 * {@link DatabaseDataReader} extends {@link BaseDataReader} and delegates database
 * connections to {@link databaseConnectionManager}, which routes to MySQL or SQLite
 * based on the configured `RUN_MODE`. SQL queries are loaded from the external
 * {@link SqlQueries} configuration file (`src/data/sqlQueries.json`).
 *
 * @module utils/dataReaders/DatabaseDataReader
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const reader = new DatabaseDataReader('./data/test.db', 'users');
 * const users = await reader.readAll<User>();
 * const admins = await reader.query<User>('SELECT * FROM users WHERE role = ?', ['admin']);
 * await reader.close();
 * ```
 */
import {BaseDataReader} from './BaseDataReader';
import {TypeCoercionHelper} from './TypeCoercionHelper';
import {FrameworkConstants} from '../../constants/frameworkConstants';
import {getConnection, closeConnection, isMySqlPool, isSqliteDb} from '../databaseConnectionManager';
import {DatabaseException} from '../../exceptions/frameworkExceptions';
import fs from 'fs';
import path from 'path';

/**
 * Structure of the `sqlQueries.json` configuration file.
 *
 * @interface SqlQueries
 * @property {Record<string, string>} selectQueries - Parameterised SELECT queries
 * @property {Record<string, string>} runnerListQueries - Full-table listing queries
 */
interface SqlQueries {
    selectQueries: Record<string, string>;
    runnerListQueries: Record<string, string>;
}

/**
 * Configuration options for the database reader.
 *
 * @interface DatabaseDataReaderOptions
 * @property {string} [arrayDelimiter='|'] - Delimiter for pipe-separated array columns
 */
interface DatabaseDataReaderOptions {
    arrayDelimiter?: string;
}

/**
 * Reads and queries databases (MySQL or SQLite) with automatic type coercion.
 *
 * Delegates all connections to {@link databaseConnectionManager}, which routes
 * to MySQL (remote) or SQLite (local) based on `RUN_MODE`.
 *
 * @class DatabaseDataReader
 * @extends {BaseDataReader}
 */
export class DatabaseDataReader extends BaseDataReader {

    /** @private Default table name for {@link readAll} / {@link parseData} */
    private readonly tableName: string;

    /** @private Coercion helper for type transformations */
    private readonly coercionHelper: TypeCoercionHelper;

    /**
     * @param {string} dbPath - File path to the database (used for SQLite local mode; metadata for remote)
     * @param {string} [tableName='todos'] - Default table to read
     * @param {DatabaseDataReaderOptions} [options] - Additional options
     */
    constructor(dbPath: string, tableName: string = 'todos', options?: DatabaseDataReaderOptions) {
        super(dbPath, 'db');
        this.tableName = tableName;
        this.coercionHelper = new TypeCoercionHelper(options?.arrayDelimiter || '|');
    }

    /**
     * Reads all rows from the specified table with type coercion.
     *
     * @template T - Record shape
     * @param {string} tableName - Table to query
     * @returns {Promise<T[]>} Coerced records
     */
    async readTable<T>(tableName: string): Promise<T[]> {
        const conn = await getConnection();
        let rows: unknown[];

        if (isMySqlPool(conn)) {
            const [result] = await conn.execute(`SELECT * FROM ${tableName}`);
            rows = result as unknown[];
        } else if (isSqliteDb(conn)) {
            rows = conn.prepare(`SELECT * FROM ${tableName}`).all();
        } else {
            throw new DatabaseException('Unknown database connection type');
        }

        return rows.map((row) => this.coercionHelper.transformRowToJson(row as Record<string, unknown>)) as T[];
    }

    /**
     * Executes an arbitrary SQL query with optional parameters.
     *
     * @template T - Record shape
     * @param {string} sql - SQL query string
     * @param {unknown[]} [params=[]] - Bound parameters
     * @returns {Promise<T[]>} Coerced result rows
     */
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
        const conn = await getConnection();
        let rows: unknown[];

        if (isMySqlPool(conn)) {
            const [result] = await conn.execute(sql, params.length > 0 ? params : undefined);
            rows = result as unknown[];
        } else if (isSqliteDb(conn)) {
            const stmt = conn.prepare(sql);
            rows = params.length > 0 ? stmt.all(...params) : stmt.all();
        } else {
            throw new DatabaseException('Unknown database connection type');
        }

        return rows.map((row) => this.coercionHelper.transformRowToJson(row as Record<string, unknown>)) as T[];
    }

    /**
     * Returns the names of all user-created tables in the database.
     *
     * @returns {Promise<string[]>} Table names
     */
    async getTableNames(): Promise<string[]> {
        const conn = await getConnection();

        if (isSqliteDb(conn)) {
            const rows = conn.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            ).all() as { name: string }[];
            return rows.map((row) => row.name);
        }

        if (isMySqlPool(conn)) {
            const [rows] = await conn.execute('SHOW TABLES');
            return (rows as Record<string, unknown>[]).map((row) => String(Object.values(row)[0]));
        }

        throw new DatabaseException('Unknown database connection type');
    }

    /**
     * Checks whether a table exists in the database.
     *
     * @param {string} tableName - Table name to check
     * @returns {Promise<boolean>} `true` if the table exists
     */
    async tableExists(tableName: string): Promise<boolean> {
        const conn = await getConnection();

        if (isSqliteDb(conn)) {
            const row = conn.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            ).get(tableName);
            return !!row;
        }

        if (isMySqlPool(conn)) {
            const [rows] = await conn.execute(
                'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
                [tableName],
            );
            return (rows as unknown[]).length > 0;
        }

        throw new DatabaseException('Unknown database connection type');
    }

    /** @override Checks database connectivity. */
    async isAvailable(): Promise<boolean> {
        try {
            await getConnection();
            return true;
        } catch {
            return false;
        }
    }

    /** Closes the database connection and releases resources. */
    async close(): Promise<void> {
        await closeConnection();
        this.logger.info('Database connection closed');
    }

    /**
     * Executes DDL statements to initialise or migrate the database schema.
     *
     * @param {string} schema - SQL DDL statements
     */
    async initializeSchema(schema: string): Promise<void> {
        const conn = await getConnection();

        if (isSqliteDb(conn)) {
            conn.exec(schema);
        } else if (isMySqlPool(conn)) {
            const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
            for (const stmt of statements) {
                await conn.execute(stmt);
            }
        } else {
            throw new DatabaseException('Unknown database connection type');
        }

        this.logger.info('Database schema initialized');
    }

    /**
     * Inserts an array of records into the specified table.
     * Uses transactions for SQLite; individual inserts for MySQL.
     *
     * @template T - Record shape
     * @param {string} tableName - Target table
     * @param {T[]} data - Records to insert
     */
    async insertData<T extends Record<string, unknown>>(tableName: string, data: T[]): Promise<void> {
        if (data.length === 0) return;

        const conn = await getConnection();
        const columns = Object.keys(data[0]);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

        if (isSqliteDb(conn)) {
            const insert = conn.prepare(sql);
            const insertMany = conn.transaction((...args: unknown[]) => {
                const rows = args[0] as T[];
                for (const row of rows) {
                    insert.run(...columns.map((col) => row[col]));
                }
            });
            insertMany(data);
        } else if (isMySqlPool(conn)) {
            for (const row of data) {
                await conn.execute(sql, columns.map((col) => row[col]));
            }
        } else {
            throw new DatabaseException('Unknown database connection type');
        }

        this.logger.info(`Inserted ${data.length} rows into ${tableName}`);
    }

    /**
     * Reads all rows from the default table and applies type coercion.
     *
     * Loads the SQL query from `src/data/sqlQueries.json` (`runnerListQueries.testCaseLists`).
     * Falls back to `SELECT * FROM ${tableName}` if the JSON file is missing or the key is absent.
     *
     * @protected
     * @template T - Record shape
     * @returns {Promise<T[]>} Parsed and coerced records
     */
    protected async parseData<T>(): Promise<T[]> {
        const conn = await getConnection();

        try {
            const query = this.resolveListQuery();
            this.logger.info(`Executing query: ${query}`);

            let rows: unknown[];
            if (isMySqlPool(conn)) {
                const [result] = await conn.execute(query);
                rows = result as unknown[];
            } else if (isSqliteDb(conn)) {
                rows = conn.prepare(query).all();
            } else {
                throw new DatabaseException('Unknown database connection type');
            }

            const jsonData = rows.map((row) =>
                this.coercionHelper.transformRowToJson(row as Record<string, unknown>),
            );
            this.logger.debug(`Converted ${jsonData.length} database rows to JSON format`);
            return jsonData as T[];
        } catch (error) {
            this.logger.error(`Failed to read from table '${this.tableName}': ${error}`);
            throw error;
        }
    }

    /**
     * Resolves the SQL query for listing all test cases.
     *
     * Attempts to load from `sqlQueries.json → runnerListQueries.testCaseLists`.
     * Falls back to a plain `SELECT * FROM ${tableName}` when the file or key is unavailable.
     *
     * @private
     * @returns {string} SQL query string
     */
    private resolveListQuery(): string {
        const queries = this.loadSqlQueries();
        if (queries?.runnerListQueries?.testCaseLists) {
            this.logger.info('Using query from sqlQueries.json → runnerListQueries.testCaseLists');
            return queries.runnerListQueries.testCaseLists;
        }
        this.logger.info(`sqlQueries.json not found or key missing — falling back to: SELECT * FROM ${this.tableName}`);
        return `SELECT * FROM ${this.tableName}`;
    }

    /**
     * Loads and parses the `sqlQueries.json` configuration file.
     *
     * @private
     * @returns {SqlQueries | null} Parsed queries or `null` if the file does not exist
     */
    private loadSqlQueries(): SqlQueries | null {
        const queriesPath = path.join(FrameworkConstants.DATA_DIR, 'sqlQueries.json');
        try {
            if (!fs.existsSync(queriesPath)) {
                this.logger.debug(`SQL queries file not found: ${queriesPath}`);
                return null;
            }
            const raw = fs.readFileSync(queriesPath, 'utf-8');
            return JSON.parse(raw) as SqlQueries;
        } catch (error) {
            this.logger.error(`Failed to load sqlQueries.json: ${error}`);
            return null;
        }
    }

}

export default DatabaseDataReader;
