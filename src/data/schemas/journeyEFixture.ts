import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^[1-9]\d{3,}$/), name: z.string().min(1) }).strict();

// hourlyRate is mandatory: a job without one blocks the transfer ("No hourly rate available")
// while the commit still claims success.
const E2Job = Entity.extend({ paymentType: z.enum(['Time', 'Piece']), hourlyRate: z.number().positive() }).strict();

const E2Block = z
    .object({
        crew: Entity,
        picker: Entity,
        job: E2Job,
    })
    .strict();

export const JourneyEFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        e2: E2Block.optional(),
    })
    .strict();

export type JourneyEFixture = z.infer<typeof JourneyEFixtureSchema>;
export type JourneyE2Fixture = z.infer<typeof E2Block>;
export { E2Block };
