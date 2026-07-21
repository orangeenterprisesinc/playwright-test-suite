/**
 * @fileoverview Minimal SQL Server client for test-data cleanup.
 *
 * Owns only the *connection and execution* mechanics — it runs whatever SQL a
 * caller passes, via `sqlcmd` (no driver dependency), using connection details
 * from configuration (server, database, auth). The actual cleanup statements
 * live in each spec's `afterEach` so they are visible and easy to debug.
 *
 * Connection config (env, loaded per TEST_ENV): `DB_SERVER`, `DB_CLIENT`,
 * `DB_MASTER`, `DB_TRUSTED` (+ `DB_USER`/`DB_PASSWORD` for SQL auth),
 * `SQLCMD_PATH`, and the `DB_CLEANUP` master switch.
 *
 * @module utils/db/sqlClient
 * @since 1.0.0
 */
import { spawnSync } from 'node:child_process';
import { ConfigProperties, getConfigBoolean, getConfigValue } from '../../enums/configProperties';
import { Logger } from '../logger';

const logger = new Logger('SqlClient');

/** Result of a {@link runSql} call. */
export interface SqlRunResult {
    /** True when sqlcmd ran and returned success. */
    ok: boolean;
    /** True when the call was skipped (cleanup disabled / unconfigured). */
    skipped: boolean;
    /** Combined stdout, trimmed (empty on skip). */
    output: string;
}

/** True when DB-based cleanup is enabled and the required config is present. */
export function isDbCleanupEnabled(): boolean {
    if (!getConfigBoolean(ConfigProperties.DB_CLEANUP, false)) return false;
    return Boolean(
        getConfigValue(ConfigProperties.DB_SERVER) &&
        getConfigValue(ConfigProperties.DB_CLIENT) &&
        getConfigValue(ConfigProperties.DB_MASTER),
    );
}

/**
 * Run a SQL batch against the configured SQL Server and return the result.
 *
 * The statement is passed as a single `sqlcmd -Q` argument (so it must use
 * single quotes for string literals — no embedded double quotes). No-ops with a
 * warning when cleanup is disabled or the DB is unreachable, so runs against
 * remote environments without SQL access still pass.
 *
 * @param query  the SQL batch to execute
 * @param label  short description for logs (e.g. the user name being removed)
 */
export function runSql(query: string, label = 'query'): SqlRunResult {
    if (!isDbCleanupEnabled()) {
        logger.info(`DB cleanup disabled or unconfigured — skipping ${label}`);
        return { ok: false, skipped: true, output: '' };
    }

    const args = [
        '-S', getConfigValue(ConfigProperties.DB_SERVER),
        '-d', getConfigValue(ConfigProperties.DB_CLIENT),
        '-C', // trust the self-signed cert used by local SQL Express
        '-b', // return a non-zero exit code if the SQL fails, so we can detect it
        '-l', '10', // login timeout (seconds)
    ];
    if (getConfigBoolean(ConfigProperties.DB_TRUSTED, true)) {
        args.push('-E'); // Windows integrated auth (no stored password)
    } else {
        args.push('-U', getConfigValue(ConfigProperties.DB_USER));
        args.push('-P', getConfigValue(ConfigProperties.DB_PASSWORD));
    }
    args.push('-Q', query);

    const sqlcmd = getConfigValue(ConfigProperties.SQLCMD_PATH, 'sqlcmd');
    const result = spawnSync(sqlcmd, args, { encoding: 'utf-8', timeout: 30_000 });

    if (result.error) {
        logger.warn(`sqlcmd not runnable ("${sqlcmd}") — skipping ${label}: ${result.error.message}`);
        return { ok: false, skipped: true, output: '' };
    }
    if (result.status !== 0) {
        logger.warn(`sqlcmd failed (exit ${result.status}) for ${label}: ${(result.stderr || result.stdout || '').trim()}`);
        return { ok: false, skipped: false, output: (result.stdout || '').trim() };
    }

    logger.info(`SQL ok: ${label}`);
    return { ok: true, skipped: false, output: (result.stdout || '').trim() };
}

/** Escape single quotes so a value stays inside a SQL string literal. */
export function sqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}
