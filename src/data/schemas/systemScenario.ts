import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// System scenarios are value bags. Credentials and mailboxes are environment (src/config), never here.

export const LoginCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        /** Identical for a bad username, a bad password, or both — the app must not reveal which field was wrong. */
        invalidCredentialsErrorMessage: z.string().min(1),
        /** A username guaranteed not to exist. */
        wrongUsername: z.string().min(1).optional(),
        /** A password guaranteed not to match any account. */
        wrongPassword: z.string().min(1).optional(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .refine((c) => c.wrongUsername !== undefined || c.wrongPassword !== undefined, { message: 'a rejected-login case names at least one wrong credential' });

export type LoginCase = z.infer<typeof LoginCaseSchema>;

export const NotificationEmailScenarioSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        /** Plus-address tag: `local+<tag>-<clock>@domain` on EMAIL_TO's first address. */
        recipientTag: z.string().regex(/^[a-z0-9]+$/),
        /** Must be a prefix the residue sweep reclaims for notifications (cleanupTargets.ts); the flow appends uid(). */
        notificationNamePrefix: z.string().min(5),
        /** `{stamp}` is replaced by a short clock stamp per run. */
        subjectTemplate: z.string().includes('{stamp}'),
        expected: z
            .object({
                jobStatus: z.string().min(1),
                recipientStatus: z.string().min(1),
                recipients: z.number().int().positive(),
                failed: z.number().int().nonnegative(),
                minSuccessful: z.number().int().positive(),
            })
            .strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict();

export type NotificationEmailScenario = z.infer<typeof NotificationEmailScenarioSchema>;
