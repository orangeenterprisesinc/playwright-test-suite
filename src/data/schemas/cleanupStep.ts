import { z } from 'zod';

// One cleanup format for every scenario file; executed by src/utils/cleanup/runCleanup.ts.
export const CleanupStepSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('delete'), entity: z.string().min(1), name: z.string().min(1) }).strict(),
    z.object({
        kind: z.literal('timeCards'),
        employeeCodes: z.array(z.string().min(1)).min(1),
        dayOffset: z.number().int().max(0),
        cardTypes: z.array(z.number().int()).optional(),
    }).strict(),
    // Named snapshot/restore pair implemented in runCleanup (4c/4d register the first).
    z.object({ kind: z.literal('restore'), target: z.string().min(1) }).strict(),
    z.object({ kind: z.literal('unremovable'), entity: z.string().min(1), reason: z.string().min(1), ticket: z.string().optional() }).strict(),
    // Rule only: an entity with a UI delete and no API delete. Zero instances today.
    z.object({ kind: z.literal('ui-delete'), page: z.string().min(1), action: z.string().min(1) }).strict(),
]);
