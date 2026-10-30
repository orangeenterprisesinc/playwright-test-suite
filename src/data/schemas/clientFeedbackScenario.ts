import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Client-feedback suite (tests/web/client-feedback/<area>/): one ticket, one scenario file.

const Text = z.string().min(1);
const Annotation = z.object({ type: Text, description: Text }).strict();

export const ClientFeedbackBase = z.object({
    _notes: z.array(z.string()).optional(),
    ticket: z.string().regex(/^(WEBPET|PET)-\d+$/),
    customer: Text.optional(),
    screen: z.object({ menuPath: z.array(Text).min(1), url: Text, tab: Text.optional() }).strict(),
    fixtureDay: z.number().int().optional(),
    annotations: z.array(Annotation).default([]),
    cleanup: z.array(CleanupStepSchema).default([]),
});

export const TjcPiecesColumnCaseSchema = ClientFeedbackBase.extend({
    ticket: z.literal('WEBPET-3311'),
    expected: z.object({ pickerEntry: Text, columnHeader: Text }).strict(),
}).strict();
export type TjcPiecesColumnCase = z.infer<typeof TjcPiecesColumnCaseSchema>;
