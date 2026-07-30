/**
 * @fileoverview The customer segments a workflow can apply to.
 *
 * From the Workflow Catalog: a workflow's `Segments` field names which kinds of
 * operation it applies to, or `all`. Combined with the module list, this is what
 * lets a customer scope be *derived* rather than hand-maintained — see
 * `src/config/scope.ts` and `config/scopes/`.
 *
 * @module data/shared/segments
 */

/** A kind of operation the product is sold into. */
export type Segment = 'grower' | 'perennial-grower' | 'pack-house' | 'nursery' | 'flc';

/** A workflow's declared segments — specific ones, or `all`. */
export type SegmentRequirement = Segment | 'all';

/** Every segment, for runtime validation and for expanding `all`. */
export const ALL_SEGMENTS: readonly Segment[] = [
    'grower',
    'perennial-grower',
    'pack-house',
    'nursery',
    'flc',
];

/** Expands a row's segments, replacing `all` with every segment. */
export function expandSegments(required: readonly string[]): Segment[] {
    if (required.includes('all')) return [...ALL_SEGMENTS];
    return required as Segment[];
}

/** Whether `value` is a known segment (or the `all` shorthand). */
export function isSegmentRequirement(value: string): value is SegmentRequirement {
    return value === 'all' || (ALL_SEGMENTS as readonly string[]).includes(value);
}
