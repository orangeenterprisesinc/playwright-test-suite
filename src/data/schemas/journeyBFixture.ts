import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^[1-9]\d{3,}$/), name: z.string().min(1) }).strict();
const Job = Entity.extend({ paymentType: z.string() }).strict();

export const JourneyBFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        entities: z
            .object({
                ranch: Entity, field: Entity, field2: Entity,
                job: Job, job2: Job, mealJob: Job,
                crew: Entity,
                present: z.array(Entity).min(1),
                absentee: Entity,
                sticker: z.array(Entity).min(1),
            })
            .strict(),

        b4: z.object({ packHouseRoll: z.object({ alternateCode: z.string(), firstCode: z.string() }).strict() }).strict(),
    })
    .strict();

export type JourneyBFixture = z.infer<typeof JourneyBFixtureSchema>;
