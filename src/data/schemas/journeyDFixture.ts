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

// D10's rows. hourlyRate is mandatory: a job without one blocks the transfer ("No hourly rate
// available") while the commit still claims success.
const D10Job = Entity.extend({ paymentType: z.enum(['Time', 'Piece']), hourlyRate: z.number().positive() }).strict();

const D10Block = z
    .object({
        crew: Entity,
        picker: Entity,
        workJob: D10Job,
        exerciseJob: D10Job,
        breakJob: D10Job,
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
        d10: D10Block.optional(),
    })
    .strict();

export type JourneyDFixture = z.infer<typeof JourneyDFixtureSchema>;
export type JourneyD9Fixture = z.infer<typeof D9Block>;
export type JourneyD10Fixture = z.infer<typeof D10Block>;
