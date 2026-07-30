/**
 * @fileoverview Every entity the suite creates, and how to clean it up.
 *
 * PET Tiger soft-deletes: a record is removed by setting `Deleted = 1`, which also
 * frees its unique Name/Initials/Barcode so a re-run can create the same test
 * record again. There is no UI or API delete for users at all, and the catalog's
 * journey A creates nine more kinds of record — so cleanup has to be table-driven
 * rather than a hand-written statement per spec.
 *
 * This table backs two things:
 *
 * 1. `src/utils/db/cleanupRegistry.ts` — per-test cleanup of the records a test
 *    created, by name.
 * 2. `src/fixtures/global-teardown.ts` — an end-of-run sweep by name prefix, which
 *    catches whatever an interrupted run left behind.
 *
 * Every entry is scoped to the **client** database. The shared `TigerMaster` is
 * deliberately left untouched: test records there are keyed by an email/identifier
 * that is unique per run, so a leftover row never blocks re-creation, whereas
 * writing to a shared master database from a test run could affect other clients.
 *
 * @module data/shared/cleanupTargets
 */

/** How to find and soft-delete one kind of record. */
export interface CleanupTarget {
    /** Key used by specs and the registry, e.g. `'user'`. */
    entity: string;
    /** Table in the client database, schema-qualified. */
    table: string;
    /** Column holding the human-readable name a test generates. */
    nameColumn: string;
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
    { entity: 'user', table: 'dbo.Users', nameColumn: 'Name', prefix: 'QA User ' },
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
