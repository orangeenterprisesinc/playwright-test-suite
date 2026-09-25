import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^[1-9]\d{3,}$/), name: z.string().min(1) }).strict();

// Journey C owns its crew and workers so a pack-house day never shares an employee-day with
// Journey B under workers=2; ranch/field/job are Journey B's, read-only.
export const JourneyCFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        entities: z
            .object({
                crew: Entity,
                /** The table of three (C6: "three to five under a supervisor"). */
                tableWorkers: z.array(Entity).min(3).max(5),
                /** Named on the table's Supervisor field; a crew member like the rest. */
                supervisor: Entity,
                /** The fixed table under `crew` that C6-002 captures against (see fixture.json notes). */
                table: z.object({ name: z.string().min(1).max(50) }).strict(),
            })
            .strict(),
    })
    .strict();

export type JourneyCFixture = z.infer<typeof JourneyCFixtureSchema>;
