/**
 * @fileoverview Per-test cleanup of the records a test created, over the app's API.
 *
 * A test registers what it made and the `cleanup` fixture removes it afterwards,
 * in reverse order of creation:
 *
 * ```typescript
 * const user = await createUser(...);
 * cleanup.track('user', user.name);   // removed in afterEach, even if the test fails
 * ```
 *
 * A test may also delete a record deliberately, as its own assertion step (the A1
 * end-to-end does exactly this). {@link CleanupRegistry.remove} does that and
 * un-tracks it, so the afterEach sweep does not try again.
 *
 * ## Why this is API-only
 *
 * Cleanup used to run `UPDATE … SET Deleted = 1` against the client database. That
 * only ever worked from a host that could reach SQL Server, which dev staging's
 * database deliberately is not — it is VPC-private, and opening it to GitHub's
 * runner IP ranges was rejected on security grounds. So on the environment the
 * suite actually runs against, SQL cleanup silently did nothing and every run left
 * its test users behind. WEBPET-1606 added `DELETE /users/{id}` to fix exactly
 * that, and the SQL transport is gone.
 *
 * An entity is cleanable once it appears in {@link API_CLEANUP}; `track` throws for
 * anything else, so a missing deleter surfaces immediately rather than as records
 * quietly accumulating.
 *
 * Cleanup can never fail a test: {@link drain} catches, because it runs after the
 * test body where an exception would mask the real result.
 */
import type { APIRequestContext } from '@playwright/test';
import { CLEANUP_TARGETS, cleanupTarget, type CleanupTarget } from '../../data/static/shared/cleanupTargets';
import { Logger } from '../logger';
import { createSessionRequestContext } from '../api/sessionContext';
import { deleteUserByName, userNamesWithPrefix } from '../api/usersApi';

/** One record awaiting cleanup. */
interface TrackedRecord {
    entity: string;
    name: string;
}

/** Supplies the authenticated API context on first use, or `null` if there is none. */
export type SessionContextFactory = () => Promise<APIRequestContext | null>;

/** How to remove one kind of record through the app's API. */
interface ApiCleanup {
    /** Remove the record with this exact name. */
    deleteByName(context: APIRequestContext, name: string): Promise<unknown>;
    /** Names of every live record whose name starts with `prefix` — for the sweep. */
    namesWithPrefix(context: APIRequestContext, prefix: string): Promise<string[]>;
}

/**
 * The delete call behind each entity in `cleanupTargets.ts`. Adding an entity there
 * without adding it here fails loudly on the first `track` — see {@link apiCleanup}.
 */
const API_CLEANUP: Record<string, ApiCleanup> = {
    user: { deleteByName: deleteUserByName, namesWithPrefix: userNamesWithPrefix },
};

/** The API cleanup for an entity, or an error naming what is missing. */
function apiCleanup(entity: string): ApiCleanup {
    const cleanup = API_CLEANUP[entity];
    if (!cleanup) {
        throw new Error(
            `'${entity}' is registered in cleanupTargets.ts but has no delete call in ` +
            `API_CLEANUP (src/utils/cleanup/cleanupRegistry.ts). Add one so records of ` +
            `this kind are actually removed.`,
        );
    }
    return cleanup;
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
     * @param session Supplies the authenticated API context, called only when a
     *   record is actually being removed — a test that creates nothing never opens
     *   one. Omit it and cleanup warns and skips.
     */
    constructor(private readonly session?: SessionContextFactory) {}

    /**
     * Register a record for removal after the test.
     *
     * Call this immediately after creating the record — before any assertion that
     * could fail — so a mid-test failure still cleans up.
     */
    track(entity: string, name: string): void {
        cleanupTarget(entity); // fail fast on an unregistered entity
        apiCleanup(entity);    // …and on one with no delete call
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

    /** Remove one record through its entity's delete call. */
    private async deleteRecord(entity: string, name: string): Promise<void> {
        cleanupTarget(entity);
        const context = await this.session?.();
        if (!context) {
            this.logger.warn(`No authenticated API context — leaving ${entity} '${name}' in place`);
            return;
        }

        await apiCleanup(entity).deleteByName(context, name);
        this.logger.info(`Deleted ${entity} '${name}' via the API`);
    }
}

/**
 * Sweep leftovers from earlier runs — every record whose name starts with the
 * configured test prefix, for every registered entity.
 *
 * Per-test cleanup already removes the happy-path records; this catches what an
 * interrupted or crashed run left behind, so test data never accumulates in a
 * shared environment. Called once from global teardown, in the main process, so it
 * builds and disposes its own API context.
 */
export async function sweepLeftovers(
    targets: readonly CleanupTarget[] = CLEANUP_TARGETS,
): Promise<void> {
    const logger = new Logger('CleanupSweep');
    if (!targets.length) return;

    const context = await createSessionRequestContext();
    if (!context) {
        logger.warn('No authenticated API context — skipping the leftover sweep');
        return;
    }

    try {
        for (const target of targets) {
            // A blank or near-blank prefix would match records no test created.
            if (target.prefix.trim().length < 3) {
                logger.warn(`Skipping sweep of ${target.entity}: prefix '${target.prefix}' is too broad`);
                continue;
            }

            try {
                const { deleteByName, namesWithPrefix } = apiCleanup(target.entity);
                const names = await namesWithPrefix(context, target.prefix);
                for (const name of names) await deleteByName(context, name);
                logger.info(`Swept ${names.length} leftover ${target.entity}(s) matching '${target.prefix}'`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`Sweep of ${target.entity} failed: ${message}`);
            }
        }
    } finally {
        await context.dispose().catch(() => undefined);
    }
}
