/**
 * @fileoverview Test-state preconditions — the data a workflow needs to already
 * exist before it can run.
 *
 * Journeys D and E cannot start from an empty database. D2 (exception review)
 * needs captured time cards; D4 (Transfer to Job Card) needs those time cards to
 * belong to a crew with jobs and fields; E1–E11 need committed job cards for a
 * whole week. That state is produced in the field, by journey B and C — which are
 * device workflows with no web surface, so they cannot be automated as a
 * prerequisite (see `docs/catalog/` and the reserved `tests/api/journey-b-field/`).
 *
 * Chaining specs to produce each other's data would be the wrong answer anyway:
 * it makes every D test depend on a B test passing, in order, in the same run.
 * Instead a D or E spec **declares** what it needs and a precondition supplies it
 * directly through SQL or the API:
 *
 * ```typescript
 * test('D4 · Transfer to Job Card', async ({ pages, given }) => {
 *   const crew = await given.crew({ name: 'QA Crew A' });
 *   await given.timeCards({ crew, date: '2026-07-01', employees: 5 });
 *   await pages.transferToJobCard.run(crew);
 * });
 * ```
 *
 * ## Status
 *
 * The contract, the run-scoped memoisation and the registry below are in place and
 * used. **The concrete seeders are not written yet** — the tables and required
 * columns for time cards, job cards, crews, fields and jobs have not been
 * confirmed against the PET Tiger schema, and inventing `INSERT` statements for
 * them would produce seeders that fail in ways that look like product bugs. Add
 * each one when its journey is automated, alongside a `CLEANUP_TARGETS` entry in
 * `src/data/shared/cleanupTargets.ts` so what it creates is also removed.
 *
 * Build them on the existing primitives rather than new machinery:
 * - `src/utils/db/sqlClient.ts` — `runSql(sql, label, params)`, both transports
 * - `src/utils/testData/` — run-unique name/value factories
 * - `src/utils/db/cleanupRegistry.ts` — removal of what a seeder creates
 *
 * @module preconditions
 * @since 1.0.0
 */
import { Logger } from '../utils/logger';

const logger = new Logger('Preconditions');

/**
 * Records created (or found) during this run, keyed by the seeder's cache key.
 *
 * Run-scoped rather than test-scoped on purpose: a ranch or crew is shared setup
 * that ten journey-D tests all need, and re-creating it per test would be ten
 * round-trips for one row. Test-*owned* data (the time cards a single transfer
 * test consumes) must NOT be memoised — pass a per-test key, or don't use
 * {@link ensure} for it at all.
 */
const ensured = new Map<string, Promise<unknown>>();

/**
 * Runs `create` once per `key` for the lifetime of the process, returning the same
 * result to every later caller.
 *
 * The promise — not the resolved value — is cached, so two tests asking for the
 * same record concurrently share one round-trip instead of racing to create
 * duplicates. A failure is evicted so the next caller retries rather than
 * inheriting a permanently poisoned entry.
 *
 * @param key stable identity of the record, e.g. `'crew:QA Crew A'`
 * @param create builds the record; called at most once per key
 *
 * @example
 * ```typescript
 * export function ensureCrew(name: string): Promise<Crew> {
 *   return ensure(`crew:${name}`, async () => {
 *     await runSql(`…INSERT…`, `seed crew ${name}`, { name });
 *     return { name };
 *   });
 * }
 * ```
 */
export async function ensure<T>(key: string, create: () => Promise<T>): Promise<T> {
    const existing = ensured.get(key);
    if (existing) return existing as Promise<T>;

    logger.info(`Ensuring ${key}`);
    const pending = create().catch((error: unknown) => {
        ensured.delete(key);
        throw error;
    });
    ensured.set(key, pending);
    return pending as Promise<T>;
}

/** Forgets everything {@link ensure} has cached — for tests that need a clean slate. */
export function resetEnsuredCache(): void {
    ensured.clear();
}

/** Cache keys currently held, for diagnostics. */
export function ensuredKeys(): string[] {
    return [...ensured.keys()];
}
