import { z } from 'zod';
import { CleanupStepSchema } from './cleanupStep';

// Journey A scenarios are value bags: what the spec types into a setup screen, what it compares
// against, and what it cleans up. Run-unique names come from src/data/generated through
// src/utils/journeys/journeyAFlow.ts — a file holds no minted value, only the `{userName}` token.

export const UserSetupCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        /** The New User form values the case types; name, initials, email and password come from the factory. */
        user: z
            .object({
                role: z.string().min(1),
                firstName: z.string().optional(),
                middleName: z.string().optional(),
                lastName: z.string().optional(),
                title: z.string().optional(),
                additionalAccess: z.array(z.string().min(1)).optional(),
                accessToReverse: z.enum(['All', 'None', 'User']).optional(),
            })
            .strict(),
        /** Reference data about the Users screen for cases that assert it (none today). */
        screen: z
            .object({ roles: z.array(z.string().min(1)).min(1), messages: z.record(z.string(), z.string().min(1)) })
            .strict()
            .optional(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict();

export type UserSetupCase = z.infer<typeof UserSetupCaseSchema>;
