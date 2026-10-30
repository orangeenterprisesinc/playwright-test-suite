import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Client-feedback suite (tests/web/client-feedback/<area>/): one ticket, one scenario file.

const Text = z.string().min(1);
const Annotation = z.object({ type: Text, description: Text }).strict();

const Clock = z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }).strict();
const CfCrew = z.enum(['A', 'B', 'C', 'D']);
const CfDayOffset = z.number().int().min(-21).max(0); // maximumDaysForTransferExport = 21 on dev
const CfSeed = z.object({
    employees: z.array(z.enum(['one', 'two'])).min(1),
    job: z.enum(['hourly', 'piece']).default('hourly'),
    timeIn: Clock,
    timeOut: Clock.optional(),
    pieceOut: z.object({ at: Clock, pieces: z.number().int().positive().max(5) }).strict().optional(), // maximumNumberOfPieces 5 on dev
}).strict();
export type CfSeedSpec = z.infer<typeof CfSeed>;

export const ClientFeedbackBase = z.object({
    _notes: z.array(z.string()).optional(),
    ticket: z.string().regex(/^(WEBPET|PET)-\d+$/),
    customer: Text.optional(),
    screen: z.object({ menuPath: z.array(Text).min(1), url: Text, tab: Text.optional() }).strict(),
    fixtureCrew: CfCrew.optional(),
    dayOffset: CfDayOffset.optional(),
    seed: CfSeed.optional(),
    annotations: z.array(Annotation).default([]),
    cleanup: z.array(CleanupStepSchema).default([]),
});

export const TjcPiecesColumnCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3311'),
    expected: z.object({ pickerEntry: Text, columnHeader: Text }).strict(),
}).strict();
export type TjcPiecesColumnCase = z.infer<typeof TjcPiecesColumnCaseSchema>;

export const TjcTotalsLoadCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3064'),
    fixtureCrew: CfCrew,
    dayOffset: CfDayOffset,
    seed: CfSeed,
    expected: z.object({
        caption: Text,
        loadWithinMs: z.number().int().positive(),
        labels: z.array(Text).length(5),
        exact: z.record(Text, Text),
        positive: z.array(Text).min(1),
        unavailableText: Text,
    }).strict(),
}).strict();
export type TjcTotalsLoadCase = z.infer<typeof TjcTotalsLoadCaseSchema>;
