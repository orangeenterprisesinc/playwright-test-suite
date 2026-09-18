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

// A9 — piece-out and sticker-roll configuration. Nothing is created, so the case is: the module
// gate the workflow depends on, the screen's own names, the values typed into the single global
// Preferences record, and what the reopened screen, the stored record and the scan-device setup
// export must show afterwards. The `write` keys are also the DOM field ids (PreferencesPage.field
// resolves `#<id>`) and the API keys, which is why the spec needs no selector and no key of its own.
const BarcodeFunction = z.enum(['No', 'Yes', 'Optional']);

export const PieceOutConfigCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        modules: z
            .object({
                /** Asserted before anything is written — without it the section assertions pass vacuously. */
                required: z.object({ key: z.string().min(1), message: z.string().min(1) }).strict(),
                /** Annotated, never failed: a module the workflow records but does not depend on. */
                noteWhenOff: z
                    .array(z.object({ key: z.string().min(1), description: z.string().min(1) }).strict())
                    .default([]),
            })
            .strict(),
        screen: z
            .object({
                /** Must match `PreferencesPage`'s `PreferencesSection` union — `sectionHeading`/`gotoSection` take that literal type, not a bare string. */
                pocketSection: z.literal('Pocket'),
                stickerSection: z.literal('Traceability - Stickers'),
                /** Written by the import engine, never by an operator (A9-R8). */
                readOnlyField: z.string().min(1),
                /** The one control chosen by label instead of filled — a base-ui Select. */
                barcodeFunctionField: z.string().min(1),
                /** Wire value → the label the Select displays; they bear no resemblance to each other. */
                barcodeFunctionLabels: z
                    .object({ No: z.string().min(1), Yes: z.string().min(1), Optional: z.string().min(1) })
                    .strict(),
            })
            .strict(),
        write: z
            .object({
                pocket: z
                    .object({
                        defaultNumberOfTimeCardPieces: z.number().int().nonnegative(),
                        maximumNumberOfPieces: z.number().int().nonnegative(),
                        minimumNumberOfPieces: z.number().int().nonnegative(),
                    })
                    .strict(),
                stickers: z
                    .object({
                        stickerPrefix: z.string().min(1),
                        stickerBarcodeLength: z.number().int().positive(),
                        typicalDailyRollUsage: z.number().int().nonnegative(),
                        pieceTraceabilityBarcodeFunction: BarcodeFunction,
                    })
                    .strict(),
            })
            .strict(),
        device: z
            .object({
                /** Only pocket-class exports carry the piece section — 0 is PocketPDA. */
                pocketDeviceType: z.number().int().nonnegative(),
                missingMessage: z.string().min(1),
            })
            .strict(),
        expected: z
            .object({
                /** `PUT preferences` answers 204; some deployments answer 200. Both are a save. */
                savedStatuses: z.array(z.number().int()).min(1),
                export: z
                    .object({
                        /** Proves the selection landed on a file that carries the piece section. */
                        deviceTypeMarker: z.string().min(1),
                        /** Legacy `Preferen.Name` keys, not the web field ids. */
                        names: z
                            .object({
                                maximumPieces: z.string().min(1),
                                minimumPieces: z.string().min(1),
                                numberOfPieces: z.string().min(1),
                            })
                            .strict(),
                        /** Payment types as the EXPORT spells them — a label, not the numeric paymentType. */
                        piecePaymentTypes: z.array(z.string().min(1)).min(1),
                        jobSection: z.string().regex(/^\w+_Records$/),
                    })
                    .strict(),
            })
            .strict(),
        /** Pushed by the flow before the test body — what the workflow deliberately does NOT run, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).default([]),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const wire = s.write.stickers.pieceTraceabilityBarcodeFunction;
        if (!s.screen.barcodeFunctionLabels[wire]) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['screen', 'barcodeFunctionLabels'],
                message: `no label for the written wire value '${wire}'`,
            });
        }
        if (!s.cleanup.some((step) => step.kind === 'restore')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['cleanup'],
                message: 'A9 writes the shared Preferences record — it must declare a restore step',
            });
        }
    });

export type PieceOutConfigCase = z.infer<typeof PieceOutConfigCaseSchema>;
