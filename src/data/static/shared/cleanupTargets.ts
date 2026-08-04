/**
 * @fileoverview Every entity the suite creates and cleans up, and the name prefix
 * its generated records carry.
 *
 * The catalog's journey A creates ten kinds of record, so cleanup is table-driven
 * rather than a hand-written delete per spec. This table backs two things:
 *
 * 1. `src/utils/cleanup/cleanupRegistry.ts` — per-test cleanup of the records a
 *    test created, by name.
 * 2. `src/fixtures/lifecycle/global-teardown.ts` — an end-of-run sweep by name
 *    prefix, which catches whatever an interrupted run left behind.
 *
 * Removal goes through the app's own API. Adding a row here is half the job: the
 * matching delete call goes in `API_CLEANUP` in `cleanupRegistry.ts`, and a row
 * without one fails the first `cleanup.track()` rather than leaking records.
 */

/** One kind of record the suite creates. */
export interface CleanupTarget {
    /** Key used by specs and the registry, e.g. `'user'`. */
    entity: string;
    /**
     * Prefix every generated record of this kind carries, used by the end-of-run
     * sweep. Must match what the corresponding factory in `src/data/generated/`
     * produces, or the sweep silently stops matching.
     */
    prefix: string;
}

/**
 * The entities the suite creates today, plus the journey-A records it will create
 * as those workflows are automated. An entry is harmless before its workflow
 * exists — the sweep simply matches nothing — and having it here means the spec
 * author cannot forget the cleanup half.
 */
export const CLEANUP_TARGETS: readonly CleanupTarget[] = [
    // A1 — File ▸ Administration ▸ Users
    { entity: 'user', prefix: 'QA User ' },
];

/** Looks up a target by entity key, throwing if it is not registered. */
export function cleanupTarget(entity: string): CleanupTarget {
    const target = CLEANUP_TARGETS.find((t) => t.entity === entity);
    if (!target) {
        const known = CLEANUP_TARGETS.map((t) => t.entity).join(', ');
        throw new Error(`No cleanup target registered for '${entity}'. Known entities: ${known}`);
    }
    return target;
}
