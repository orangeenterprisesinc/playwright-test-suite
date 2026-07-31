/**
 * @fileoverview Resolves email recipients for a run from a per-context routing
 * table, so one suite can mail different people depending on where and why it ran.
 *
 * @deprecated Only the deprecated email reporter uses this. Slack posts to a
 * single channel and needs no routing table.
 *
 * The daily cron on `dry-run` goes to the whole team; a push to `main`, the
 * `dev-qe` branch, and laptop runs go to one person. That is a routing decision,
 * not a delivery one, so it lives in an editable CSV rather than in code:
 * `config/notifications/recipients.csv` (override with `EMAIL_RECIPIENTS_FILE`).
 *
 * ## The scope vocabulary
 *
 * A row's `scope` is one of:
 * - `<branch>:<trigger>` — most specific, e.g. `dry-run:scheduled`
 * - `<branch>` — any trigger on that branch, e.g. `main`
 * - `<trigger>` — that trigger on any branch, e.g. `manual`
 * - `default` — nothing else matched
 *
 * The trigger tokens are exactly the strings {@link ../reporting/runSummary}'s
 * `resolveTrigger()` already produces (`push`, `scheduled`, `manual`,
 * `external dispatch`, `ci`, `local run`) — deliberately, so there is no second
 * vocabulary to keep in sync with the reporters.
 *
 * ## Failure behaviour
 *
 * Routing must never be able to silence a report that used to send. A missing,
 * unreadable, or non-matching table falls back to the legacy `EMAIL_TO`
 * environment variable, which is what every workflow still sets. The one way to
 * send nothing is an explicit empty `recipients` cell — a deliberate mute, which
 * is why that case is distinguished from "no row".
 */
import path from 'node:path';
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import { CsvDataReader } from '../../data/readers/CsvDataReader';
import { Logger } from '../../utils/logger';

const logger = new Logger('Recipients');

const DEFAULT_RECIPIENTS_FILE = path.join('config', 'notifications', 'recipients.csv');

/** The `default` catch-all scope key. */
const DEFAULT_SCOPE = 'default';

/**
 * One parsed row. `recipients` is `string | null` because the CSV reader coerces
 * an empty cell to `null` (see `TypeCoercionHelper.transformRowToJson`) — and that
 * null is meaningful here: it is the explicit mute.
 */
interface RecipientRow {
    scope?: string | null;
    recipients?: string | null;
}

/** Outcome of a lookup, so the caller can tell "mute" from "no match". */
interface Resolution {
    /** Comma-joined addresses; `''` means send to nobody. */
    to: string;
    /** Which row matched, for the log line. `null` when nothing matched. */
    matchedScope: string | null;
}

/** Resolves the recipient list for the current run. */
export async function resolveRecipients(branch: string, trigger: string): Promise<string> {
    const fallback = getConfigValue(ConfigProperties.EMAIL_TO);
    const file = getConfigValue(ConfigProperties.EMAIL_RECIPIENTS_FILE, DEFAULT_RECIPIENTS_FILE);

    const rows = await readTable(file);
    if (!rows) {
        // readTable has already logged why. Fall back rather than go silent.
        return fallback;
    }

    const resolution = matchScope(rows, branch, trigger);
    if (!resolution) {
        logger.warn(
            `No row in ${file} matched branch='${branch}' trigger='${trigger}' and there is no '${DEFAULT_SCOPE}' row — ` +
                `falling back to EMAIL_TO`,
        );
        return fallback;
    }

    if (!resolution.to) {
        logger.info(`Scope '${resolution.matchedScope}' has an empty recipient list — sending to nobody, by configuration`);
        return '';
    }

    logger.info(`Recipients resolved from scope '${resolution.matchedScope}' (branch='${branch}', trigger='${trigger}')`);
    return resolution.to;
}

/**
 * Reads and normalises the table. Returns `null` — never throws and never an
 * empty array for a real failure — so the caller can tell "could not read" from
 * "read fine, nothing matched".
 */
async function readTable(file: string): Promise<Map<string, string> | null> {
    const reader = new CsvDataReader(file);

    if (!(await reader.isAvailable())) {
        logger.warn(`Recipient table '${file}' not found — falling back to EMAIL_TO`);
        return null;
    }

    let rows: RecipientRow[];
    try {
        rows = await reader.readAll<RecipientRow>();
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Could not read '${file}' (${msg}) — falling back to EMAIL_TO`);
        return null;
    }

    const table = new Map<string, string>();
    for (const row of rows) {
        const scope = (row.scope ?? '').toString().trim();
        // The CSV reader does not enable papaparse's `comments` option, so a
        // '#' line arrives as an ordinary row — filter it here instead.
        if (!scope || scope.startsWith('#')) continue;

        const key = scope.toLowerCase();
        if (table.has(key)) {
            logger.warn(`Duplicate scope '${scope}' in '${file}' — keeping the first occurrence`);
            continue;
        }
        table.set(key, normaliseAddresses(row.recipients));
    }

    if (table.size === 0) {
        logger.warn(`Recipient table '${file}' has no usable rows — falling back to EMAIL_TO`);
        return null;
    }

    return table;
}

/**
 * Walks the precedence chain, most specific first:
 * `branch:trigger` → `branch` → `trigger` → `default`.
 */
function matchScope(table: Map<string, string>, branch: string, trigger: string): Resolution | null {
    const b = branch.trim().toLowerCase();
    const t = trigger.trim().toLowerCase();

    const candidates = [b && t ? `${b}:${t}` : '', b, t, DEFAULT_SCOPE];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const hit = table.get(candidate);
        if (hit !== undefined) return { to: hit, matchedScope: candidate };
    }

    return null;
}

/**
 * Splits a recipients cell on commas, trims, drops blanks, de-duplicates
 * case-insensitively, and re-joins. Keeps the original casing of the first
 * occurrence — mail servers ignore case in the domain but users read these.
 */
function normaliseAddresses(raw: string | null | undefined): string {
    if (raw === null || raw === undefined) return '';

    const seen = new Set<string>();
    const addresses: string[] = [];

    for (const part of raw.toString().split(',')) {
        const address = part.trim();
        if (!address) continue;
        const key = address.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        addresses.push(address);
    }

    return addresses.join(',');
}
