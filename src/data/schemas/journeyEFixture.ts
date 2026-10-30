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

// E9 owns two jobs: one with its earning code typed, one with it cleared (the gap Test File flags).
const E9Block = z.object({ jobs: z.object({ coded: E2Job, nocode: E2Job }).strict() }).strict();

// E10 owns one job whose export identifier differs from its name (identifiers live in the scenario JSON).
const E10Block = z.object({ job: E2Job }).strict();

// E1 owns a department, its own crew and picker, and two jobs at different rates (the average sits between them).
const E1Block = z
    .object({
        department: z.object({ name: z.string().min(1) }).strict(),
        crew: Entity,
        picker: Entity,
        jobs: z.object({ high: E2Job, low: E2Job }).strict(),
    })
    .strict();

// E5 owns a minimum-wage record, a department, its own crew and picker, and one piece job (no hourly rate: a Piece job has none).
const E5Job = Entity.extend({ paymentType: z.literal('Piece'), pieceRate: z.number().positive() }).strict();
const E5Block = z
    .object({
        minimumWage: z.object({ name: z.string().min(1), rate: z.number().positive() }).strict(),
        department: z.object({ name: z.string().min(1) }).strict(),
        crew: Entity,
        picker: Entity,
        job: E5Job,
    })
    .strict();

const E3Block = E2Block.extend({
    rule: E13Rule.extend({ weeklyRegularHours: z.number().positive(), weeklyStartDay: z.number().int().positive() }).strict(),
}).strict();

export const JourneyEFixtureSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        e2: E2Block.optional(),
        e11: E11Block.optional(),
        e9: E9Block.optional(),
        e10: E10Block.optional(),
        e13: E13Block.optional(),
        e6: E6Block.optional(),
        // E3 has the same shape as E2: its own crew, picker and job.
        e3: E3Block.optional(),
        e1: E1Block.optional(),
        e5: E5Block.optional(),
    })
    .strict();

export type JourneyEFixture = z.infer<typeof JourneyEFixtureSchema>;
export type JourneyE2Fixture = z.infer<typeof E2Block>;
export type JourneyE1Fixture = z.infer<typeof E1Block>;
export type JourneyE5Fixture = z.infer<typeof E5Block>;
export type JourneyE11Fixture = z.infer<typeof E11Block>;
export type JourneyE9Fixture = z.infer<typeof E9Block>;
export type JourneyE10Fixture = z.infer<typeof E10Block>;
export type JourneyE6Fixture = z.infer<typeof E6Block>;
export { E2Block };
