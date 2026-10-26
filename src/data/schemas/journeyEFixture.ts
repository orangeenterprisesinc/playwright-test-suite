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

// E6's three own jobs; E2 JOB is never touched (E2/E8 own it).
const E6Block = z.object({ jobs: z.object({ jobA: E2Job, jobB: E2Job, jobC: E2Job }).strict() }).strict();

const E13Rule = z
    .object({
        name: z.string().min(1),
        overtimeDailyHours: z.number().positive(),
        doubleTimeDailyHours: z.number().positive(),
        wageOrder: z.string().min(1),
        agType: z.boolean(),
    })
    .strict();

const E13Block = z
    .object({
        rules: z.object({ ruleA: E13Rule, ruleB: E13Rule }).strict(),
        jobs: z
            .object({
                jobA: E2Job.extend({ rule: z.enum(['ruleA', 'ruleB']) }).strict(),
                jobB: E2Job.extend({ rule: z.enum(['ruleA', 'ruleB']) }).strict(),
            })
            .strict(),
    })
    .strict();

// E11 reuses E2's crew and picker; this block holds only its own job (earning codes live in the scenario JSON).
const E11Block = z.object({ job: E2Job }).strict();

export const JourneyEFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        e2: E2Block.optional(),
        e11: E11Block.optional(),
        e13: E13Block.optional(),
        e6: E6Block.optional(),
    })
    .strict();

export type JourneyEFixture = z.infer<typeof JourneyEFixtureSchema>;
export type JourneyE2Fixture = z.infer<typeof E2Block>;
export type JourneyE11Fixture = z.infer<typeof E11Block>;
export type JourneyE6Fixture = z.infer<typeof E6Block>;
export { E2Block };
