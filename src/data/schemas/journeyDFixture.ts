import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^[1-9]\d{3,}$/), name: z.string().min(1) }).strict();

// D9's own rows. `paymentType` is the string ensureOnScreen's JobSpec takes, not the numeric enum
// the D6 block carries.
const D9Block = z
    .object({
        crew: Entity,
        pickerOne: Entity,
        pickerTwo: Entity,
        pickerThree: Entity,
        job: Entity.extend({ paymentType: z.enum(['Time', 'Piece']), pieceRate: z.number().positive() }).strict(),
    })
    .strict();

// Journey D owns its own crew, pickers and job so a recalculate day never shares an employee-day
// with any other journey under workers=2; ranch/field are Journey B's, reused read-only.
export const JourneyDFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        entities: z
            .object({
                crew: Entity,
                pickerOne: Entity,
                pickerTwo: Entity,
                job: Entity.extend({ paymentType: z.number().int() }).strict(),
            })
            .strict(),
        d9: D9Block.optional(),
    })
    .strict();

export type JourneyDFixture = z.infer<typeof JourneyDFixtureSchema>;
export type JourneyD9Fixture = z.infer<typeof D9Block>;
