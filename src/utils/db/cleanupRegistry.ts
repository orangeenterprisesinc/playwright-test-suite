/**
 * @fileoverview Per-test cleanup of the records a test created.
 *
 * A test registers what it made and the `cleanup` fixture removes it afterwards,
 * in reverse order of creation:
 *
 * ```typescript
 * const user = await createUser(...);
 * cleanup.track('user', user.name);   // removed in afterEach, even if the test fails
 * ```
 *
 * This replaces each spec hand-writing its own `UPDATE … SET Deleted = 1`. With one
 * screen that was fine; across the catalog's nine journey-A entities it would be
 * nine near-identical statements copied into nine specs, and any one of them
 * getting the database or the soft-delete flag wrong leaks records into a shared
 * dev database. The statement now lives here once, driven by
 * `src/data/static/shared/cleanupTargets.ts`.
 *
 * A test may also delete a record deliberately, as its own assertion step (the A1
 * end-to-end does exactly this). {@link CleanupRegistry.remove} does that and
 * un-tracks it, so the afterEach sweep does not try again.
 *
 * All of it is a no-op when `DB_CLEANUP` is off or the DB is unreachable —
 * `runSql` reports `skipped` and logs, rather than failing the run.
 */
import { ConfigProperties, getConfigValue } from '../../config/configProperties';
import { CLEANUP_TARGETS, cleanupTarget, type CleanupTarget } from '../../data/static/shared/cleanupTargets';
import { Logger } from '../logger';
import { runSql } from './sqlClient';

/** One record awaiting cleanup. */
interface TrackedRecord {
    entity: string;
    name: string;
}

/**
 * Collects the records a single test created and removes them afterwards.
 *
 * One instance per test, supplied by the `cleanup` fixture.
 */
export class CleanupRegistry {
    private readonly logger = new Logger('CleanupRegistry');
    private readonly tracked: TrackedRecord[] = [];

    /**
     * Register a record for removal after the test.
     *
     * Call this immediately after creating the record — before any assertion that
     * could fail — so a mid-test failure still cleans up.
     */
    track(entity: string, name: string): void {
        cleanupTarget(entity); // fail fast on an unregistered entity
        this.tracked.push({ entity, name });
    }

    /** Stop tracking a record without deleting it. */
    untrack(entity: string, name: string): void {
        const index = this.tracked.findIndex((r) => r.entity === entity && r.name === name);
        if (index >= 0) this.tracked.splice(index, 1);
    }

    /**
     * Delete a record now and stop tracking it — for a test whose own steps include
     * deleting the record, where the deletion is the thing being verified.
     */
    async remove(entity: string, name: string): Promise<void> {
        await this.deleteRecord(entity, name);
        this.untrack(entity, name);
    }

    /**
     * Delete everything still tracked, newest first, and clear the registry. Called
     * by the `cleanup` fixture after each test; safe to call twice.
     */
    async drain(): Promise<void> {
        while (this.tracked.length) {
            const record = this.tracked.pop()!;
            try {
                await this.deleteRecord(record.entity, record.name);
            } catch (error) {
                // One record failing to delete must not mask the test result or
                // abandon the rest of the queue; the end-of-run sweep is the backstop.
                const message = error instanceof Error ? error.message : String(error);
                this.logger.warn(`Could not clean up ${record.entity} '${record.name}': ${message}`);
            }
        }
    }

    /** How many records are still tracked — for assertions and diagnostics. */
    get pending(): number {
        return this.tracked.length;
    }

    /**
     * Soft-delete one record in the client database.
     *
     * `Deleted = 1` is a true delete as far as the app is concerned: the record
     * leaves every list and its unique Name/Initials/Barcode become reusable.
     *
     * The name is bound as `@name` rather than interpolated — `sqlClient` binds it
     * as a real parameter on the driver path and escapes it on the sqlcmd path.
     * `LIKE` (not `=`) matches the historical behaviour for names the app may pad.
     */
    private async deleteRecord(entity: string, name: string): Promise<void> {
        const target = cleanupTarget(entity);
        const clientDb = getConfigValue(ConfigProperties.DB_CLIENT);

        await runSql(
            `USE [${clientDb}]; SET NOCOUNT ON; ` +
            `UPDATE ${target.table} SET Deleted = 1 ` +
            `WHERE ${target.nameColumn} LIKE @name AND Deleted = 0;`,
            `cleanup ${entity} '${name}'`,
            { name },
        );
    }
}

/**
 * Sweep leftovers from earlier runs — every record whose name starts with the
 * configured test prefix, for every registered entity.
 *
 * Per-test cleanup already removes the happy-path records; this catches what an
 * interrupted or crashed run left behind, so test data never accumulates in a
 * shared database. Called once from global teardown.
 */
export async function sweepLeftovers(
    targets: readonly CleanupTarget[] = CLEANUP_TARGETS,
): Promise<void> {
    const logger = new Logger('CleanupSweep');
    const clientDb = getConfigValue(ConfigProperties.DB_CLIENT);

    for (const target of targets) {
        const pattern = `${target.prefix}%`;
        try {
            await runSql(
                `USE [${clientDb}]; SET NOCOUNT ON; ` +
                `UPDATE ${target.table} SET Deleted = 1 ` +
                `WHERE ${target.nameColumn} LIKE @pattern AND Deleted = 0;`,
                `leftover-sweep ${target.entity} ${pattern}`,
                { pattern },
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`Sweep of ${target.entity} (${target.table}) failed: ${message}`);
        }
    }
}
