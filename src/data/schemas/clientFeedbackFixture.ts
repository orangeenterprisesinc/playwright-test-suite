import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^9\d{3}$/), name: z.string().regex(/^CF /) }).strict();
const CrewBlock = z.object({ crew: Entity, employees: z.object({ one: Entity, two: Entity }).strict() }).strict();

// hourlyRate is mandatory on the Time job: a rate-less job raises "No hourly rate available". A Piece job's Hourly Rate is read-only on the form.
export const ClientFeedbackFixtureSchema = z.object({
    _notes: z.array(z.string()).optional(),
    ranch: Entity,
    field: Entity,
    jobs: z.object({
        hourly: Entity.extend({ paymentType: z.literal('Time'), hourlyRate: z.number().positive() }).strict(),
        piece: Entity.extend({ paymentType: z.literal('Piece'), pieceRate: z.number().positive() }).strict(),
    }).strict(),
    crews: z.object({ A: CrewBlock, B: CrewBlock, C: CrewBlock, D: CrewBlock }).strict(),
}).strict();

export type ClientFeedbackFixture = z.infer<typeof ClientFeedbackFixtureSchema>;
export type CfCrewKey = keyof ClientFeedbackFixture['crews'];
