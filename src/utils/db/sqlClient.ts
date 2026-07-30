/**
 * @fileoverview Minimal SQL Server client for test-data cleanup.
 *
 * Owns only the *connection and execution* mechanics — it runs whatever SQL a
 * caller passes. The actual cleanup statements live in each spec's `afterEach`
 * so they are visible and easy to debug.
 *
 * **Two transports, chosen by `DB_TRUSTED`:**
 *
 * | `DB_TRUSTED` | Transport | Used by |
 * |---|---|---|
 * | `no`  | the `mssql` driver (pure JS, no CLI needed) | dev staging in GitHub-hosted CI |
 * | `yes` | the `sqlcmd` CLI with `-E` (Windows integrated auth) | local + self-hosted `e2e-local.yml` |
 *
 * The split is not arbitrary: `tedious` (which `mssql` wraps) cannot do true
 * Windows integrated auth — that needs the Windows-only native `msnodesqlv8` —
 * while a GitHub-hosted Linux runner has no `sqlcmd` and no Windows identity to
 * authenticate with. Each mode uses the mechanism that actually works for it.
 *
 * Connection config (env, loaded per TEST_ENV): `DB_SERVER`, `DB_CLIENT`,
 * `DB_MASTER`, `DB_TRUSTED` (+ `DB_USER`/`DB_PASSWORD` for SQL auth),
 * `SQLCMD_PATH` (trusted path only), and the `DB_CLEANUP` master switch.
 *
 * @module utils/db/sqlClient
 * @since 1.0.0
 */
import { spawnSync } from 'node:child_process';
import { ConnectionPool, type config as MssqlConfig } from 'mssql';
import { ConfigProperties, getConfigBoolean, getConfigValue } from '../../config/configProperties';
import { Logger } from '../logger';

const logger = new Logger('SqlClient');

/** Result of a {@link runSql} call. */
export interface SqlRunResult {
    /** True when the statement ran and returned success. */
    ok: boolean;
    /** True when the call was skipped (cleanup disabled / unconfigured). */
    skipped: boolean;
    /** Combined stdout (sqlcmd) or affected-row count (driver), trimmed. Empty on skip. */
    output: string;
}

/** Values bindable into a query via `@name` placeholders. */
export type SqlParams = Record<string, string | number>;

/** True when DB-based cleanup is enabled and the required config is present. */
export function isDbCleanupEnabled(): boolean {
    if (!getConfigBoolean(ConfigProperties.DB_CLEANUP, false)) return false;
    return Boolean(
        getConfigValue(ConfigProperties.DB_SERVER) &&
        getConfigValue(ConfigProperties.DB_CLIENT),
    );
}

/**
 * True when the `mssql` driver should be used instead of `sqlcmd`.
 *
 * Driven by `DB_TRUSTED`, which describes the *authentication* mode — and the
 * auth mode determines the only viable transport (see the table in the module
 * docs). Defaults to trusted, matching the historical local-first behaviour.
 */
function usesDriver(): boolean {
    return !getConfigBoolean(ConfigProperties.DB_TRUSTED, true);
}

/** A `DB_SERVER` value decomposed into what the driver needs. */
interface ServerTarget {
    server: string;
    port?: number;
    instanceName?: string;
}

/**
 * Translate a `sqlcmd`-style `DB_SERVER` into driver connection fields.
 *
 * `DB_SERVER` is written for `sqlcmd -S`, which accepts
 * `[tcp:]host[\INSTANCE][,port]` — e.g. `localhost,1433` or
 * `SQLBOX\SQLEXPRESS01`. The driver wants these as separate fields, so they have
 * to be pulled apart here rather than passed through.
 *
 * @param raw the raw `DB_SERVER` value
 */
function parseServer(raw: string): ServerTarget {
    let value = raw.trim().replace(/^tcp:/i, '');

    // Port comes last, after a comma. Only treat it as a port if it parses as
    // one, so a stray comma can't silently truncate the host.
    let port: number | undefined;
    const commaAt = value.lastIndexOf(',');
    if (commaAt !== -1) {
        const parsed = Number(value.slice(commaAt + 1).trim());
        if (Number.isInteger(parsed) && parsed > 0) {
            port = parsed;
            value = value.slice(0, commaAt);
        }
    }

    let instanceName: string | undefined;
    const slashAt = value.indexOf('\\');
    if (slashAt !== -1) {
        instanceName = value.slice(slashAt + 1).trim() || undefined;
        value = value.slice(0, slashAt);
    }

    // tedious rejects a port and an instance name together. An explicit port is
    // unambiguous, so it wins; a named instance without one is resolved via the
    // SQL Browser service instead.
    if (port !== undefined) instanceName = undefined;

    return {
        server: value.trim(),
        port: port ?? (instanceName ? undefined : 1433),
        instanceName,
    };
}

/** Escape single quotes so a value stays inside a SQL string literal. */
export function sqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Inline `@name` placeholders as escaped literals — the `sqlcmd` path's stand-in
 * for the driver's bound parameters.
 *
 * Longest names are substituted first, and a placeholder only matches when the
 * next character can't continue an identifier, so `@name` never clobbers part of
 * `@name2`. The replacement is passed as a function because a literal could
 * contain `$`, which `String.replace` would otherwise treat as a capture-group
 * reference.
 */
function applyParams(query: string, params: SqlParams): string {
    let out = query;
    for (const key of Object.keys(params).sort((a, b) => b.length - a.length)) {
        const value = params[key];
        const literal = typeof value === 'number' ? String(value) : `'${sqlLiteral(value)}'`;
        out = out.replace(new RegExp(`@${key}(?![A-Za-z0-9_])`, 'g'), () => literal);
    }
    return out;
}

/** Flatten a driver error (and its wrapped tedious cause) into one log line. */
function describeDriverError(error: unknown): string {
    const err = error as { message?: string; code?: string; originalError?: { message?: string } };
    const cause = err?.originalError?.message;
    const parts = [err?.code, err?.message, cause !== err?.message ? cause : undefined];
    const described = parts.filter(Boolean).join(' — ');
    return described || String(error);
}

/**
 * Run a batch through the `mssql` driver with properly bound parameters.
 *
 * Opens a connection, runs the batch, and closes it again on every call —
 * deliberately not a shared pool. `runSql` is called from Playwright **worker**
 * processes (a spec's `afterEach`) as well as the main process
 * (`globalTeardown`), and a pool left open in a worker keeps that process alive
 * and can hang the run. Connect-per-call mirrors the one-process-per-call model
 * `sqlcmd` already had. Cleanup is a handful of calls per run, so the extra
 * handshake costs nothing worth optimising — please don't turn this into a
 * cached pool.
 */
async function runViaDriver(query: string, label: string, params: SqlParams): Promise<SqlRunResult> {
    const target = parseServer(getConfigValue(ConfigProperties.DB_SERVER));

    const settings: MssqlConfig = {
        server: target.server,
        database: getConfigValue(ConfigProperties.DB_CLIENT),
        user: getConfigValue(ConfigProperties.DB_USER),
        password: getConfigValue(ConfigProperties.DB_PASSWORD),
        connectionTimeout: 15_000,
        requestTimeout: 30_000,
        pool: { max: 1, min: 0, idleTimeoutMillis: 1_000 },
        options: {
            // Mirrors `sqlcmd -C`: encrypt the connection, but accept the
            // self-signed certificate dev SQL Server instances ship with.
            encrypt: true,
            trustServerCertificate: true,
            ...(target.instanceName ? { instanceName: target.instanceName } : {}),
        },
    };
    if (target.port !== undefined) settings.port = target.port;

    const pool = new ConnectionPool(settings);
    try {
        await pool.connect();

        const request = pool.request();
        for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
        }

        const result = await request.query(query);
        const affected = result.rowsAffected.reduce((sum, n) => sum + n, 0);
        logger.info(`SQL ok: ${label} (${affected} row(s) affected)`);
        return { ok: true, skipped: false, output: String(affected) };
    } catch (error) {
        logger.warn(`SQL failed for ${label}: ${describeDriverError(error)}`);
        return { ok: false, skipped: false, output: '' };
    } finally {
        // Never let a close failure mask the result we already have.
        await pool.close().catch(() => undefined);
    }
}

/**
 * Run a batch through the `sqlcmd` CLI using Windows integrated auth.
 *
 * The statement is passed as a single `sqlcmd -Q` argument, so parameters are
 * inlined as escaped literals ({@link applyParams}) — the CLI has no bound-
 * parameter facility. No-ops with a warning when `sqlcmd` isn't runnable, so
 * runs on hosts without it still pass.
 */
function runViaSqlcmd(query: string, label: string, params: SqlParams): SqlRunResult {
    const args = [
        '-S', getConfigValue(ConfigProperties.DB_SERVER),
        '-d', getConfigValue(ConfigProperties.DB_CLIENT),
        '-C', // trust the self-signed cert used by local SQL Express
        '-b', // return a non-zero exit code if the SQL fails, so we can detect it
        '-l', '10', // login timeout (seconds)
        '-E', // Windows integrated auth (no stored password)
        '-Q', applyParams(query, params),
    ];

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

/**
 * Run a SQL batch against the configured SQL Server and return the result.
 *
 * Never throws — cleanup runs in `afterEach` and teardown, where an exception
 * would mask the actual test result. Failures are logged and reported in the
 * returned {@link SqlRunResult}.
 *
 * Prefer `@name` placeholders with `params` over interpolating values into the
 * query: the driver binds them properly, and the `sqlcmd` path escapes them.
 *
 * @param query  the SQL batch to execute, using `@name` placeholders for values
 * @param label  short description for logs (e.g. the user name being removed)
 * @param params values to bind to the query's placeholders
 *
 * @example
 * ```typescript
 * await runSql(
 *     'UPDATE dbo.Users SET Deleted = 1 WHERE Name LIKE @name AND Deleted = 0;',
 *     name,
 *     { name },
 * );
 * ```
 */
export async function runSql(
    query: string,
    label = 'query',
    params: SqlParams = {},
): Promise<SqlRunResult> {
    if (!isDbCleanupEnabled()) {
        logger.info(`DB cleanup disabled or unconfigured — skipping ${label}`);
        return { ok: false, skipped: true, output: '' };
    }

    return usesDriver()
        ? runViaDriver(query, label, params)
        : runViaSqlcmd(query, label, params);
}
