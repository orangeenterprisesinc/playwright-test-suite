import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^[1-9]\d{3,}$/), name: z.string().min(1) }).strict();
// The string ensureOnScreen's JobSpec takes, not the numeric wire enum.
const Job = Entity.extend({ paymentType: z.enum(['Time', 'Piece']) }).strict();
const PieceJob = Entity.extend({ paymentType: z.literal('Piece'), pieceRate: z.number().positive(), hourlyRate: z.number().positive() }).strict();
// A rate-less job is blocked at transfer ("No hourly rate available").
const HourlyJob = Job.extend({ hourlyRate: z.number().positive() }).strict();

export const JourneyBFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        entities: z
            .object({
                ranch: Entity, field: Entity, field2: Entity,
                job: Job, job2: Job, mealJob: Job, pieceJob: PieceJob,
                crew: Entity,
                present: z.array(Entity).min(1),
                absentee: Entity,
                sticker: z.array(Entity).min(1),
            })
            .strict(),

        b4: z.object({ packHouseRoll: z.object({ alternateCode: z.string(), firstCode: z.string() }).strict() }).strict(),
        b9: z.object({ crew: Entity, workJob: HourlyJob, breakJob: HourlyJob }).strict(),
    })
    .strict();

export type JourneyBFixture = z.infer<typeof JourneyBFixtureSchema>;
