import { z } from 'zod';

const Entity = z.object({ code: z.string().regex(/^9\d{3}$/), name: z.string().regex(/^CF /) }).strict();
const CrewBlock = z.object({ crew: Entity, employees: z.object({ one: Entity, two: Entity }).strict() }).strict();
const TimeJob = Entity.extend({ paymentType: z.literal('Time'), hourlyRate: z.number().positive() }).strict();

// hourlyRate is mandatory on the Time job: a rate-less job raises "No hourly rate available". A Piece job's Hourly Rate is read-only on the form.
export const ClientFeedbackFixtureSchema = z.object({
    _notes: z.array(z.string()).optional(),
    ranch: Entity,
    field: Entity,
    /** WEBPET-3701: kept Active = No by ensureFieldOnScreen; never activated, never deleted. */
    inactiveField: Entity,
    /** WEBPET-3893: the crew Preferences ▸ Defaults points at for the run; no members, never deleted. */
    allEmployeesCrew: Entity,
    jobs: z.object({
        hourly: Entity.extend({ paymentType: z.literal('Time'), hourlyRate: z.number().positive(), earningCodes: z.string().min(1).optional() }).strict(),
        piece: Entity.extend({ paymentType: z.literal('Piece'), pieceRate: z.number().positive(), earningCodes: z.string().min(1).optional() }).strict(),
        /** WEBPET-3941: designated as Paid Break Job for the run only. */
        paidBreak: TimeJob,
        /** WEBPET-3941: CF CREW C's Break Preparation Job for the run only. */
        breakPrep: TimeJob,
        /** WEBPET-3491: designated as the Meal Job preference for the run only (su has none). */
        meal: TimeJob.extend({ earningCodes: z.string().min(1).optional() }).strict(),
    }).strict(),
    crews: z.object({ A: CrewBlock, B: CrewBlock, C: CrewBlock, D: CrewBlock }).strict(),
}).strict();

export type ClientFeedbackFixture = z.infer<typeof ClientFeedbackFixtureSchema>;
export type CfCrewKey = keyof ClientFeedbackFixture['crews'];
