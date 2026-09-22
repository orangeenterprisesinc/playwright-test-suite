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
 * Every entity in `cleanupTargets.ts` is cleanable: the list and delete calls are
 * derived from its `listPath` / `idKey`, so a new entity is one table row. `track`
 * still throws for an unregistered entity.
 *
 * Cleanup can never fail a test: {@link drain} catches, because it runs after the
 * test body where an exception would mask the real result. The run-start and
 * run-end residue sweeps (`residueSweep.ts`) are the backstop for what per-test
 * cleanup cannot reach — timed-out bodies and killed runs.
 */
import type { APIRequestContext } from '@playwright/test';
import { CLEANUP_TARGETS, cleanupTarget, type CleanupTarget } from '../../data/static/shared/cleanupTargets';
import { Logger } from '../logger';
import { deleteById, listRows, runResidueSweep, type SweepSummary } from './residueSweep';

/** One record awaiting cleanup. */
interface TrackedRecord {
    entity: string;
    name: string;
}

/** Supplies the authenticated API context on first use, or `null` if there is none. */
export type SessionContextFactory = () => Promise<APIRequestContext | null>;

/**
 * Delete the one record of `target`'s kind whose name is exactly `name` (trimmed —
 * the app can pad a stored name). Resolves `false` when no live row carries it.
 */
export async function deleteByName(context: APIRequestContext, target: CleanupTarget, name: string): Promise<boolean> {
    const wanted = name.trim();
    const rows = await listRows(context, target);
    const row = rows.find((r) => String(r[target.nameKey ?? 'name'] ?? '').trim() === wanted);
    if (!row) return false;
    const id = Number(row[target.idKey]);
    if (!Number.isFinite(id)) {
        throw new Error(`${target.entity}: idKey '${target.idKey}' missing on '${wanted}'`);
    }
    const result = await deleteById(context, target, id);
    if (result.outcome === 'deleted' || result.outcome === 'notFound') return true;
    throw new Error(`DELETE ${target.listPath}/${String(id)} returned ${String(result.status)}: ${result.body}`);
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
        const target = cleanupTarget(entity);
        const context = await this.session?.();
        if (!context) {
            this.logger.warn(`No authenticated API context — leaving ${entity} '${name}' in place`);
            return;
        }

        const found = await deleteByName(context, target, name);
        this.logger.info(found ? `Deleted ${entity} '${name}' via the API` : `${entity} '${name}' was already gone`);
    }
}

/**
 * The end-of-run sweep: this run's own residue (by run id, whatever its age) plus
 * anything older than the age gate. Called once from global teardown, in the main
 * process; it logs in for itself.
 */
export async function sweepLeftovers(
    blockedEmployeeIds: readonly number[] = [],
    targets: readonly CleanupTarget[] = CLEANUP_TARGETS,
): Promise<SweepSummary> {
    return runResidueSweep({ phase: 'end', targets, ownRunId: process.env.RESIDUE_RUN_ID, blockedEmployeeIds });
}
