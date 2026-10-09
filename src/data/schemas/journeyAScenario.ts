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
                /** Written by the import engine, never by an operator. */
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

// A5 — employee setup. The offsets feed runUniqueCode() in the flow (Barcode, Export Identifier, NFC and
// RFID must be run-unique and distinct); the rest is typed into the form, then compared on reload, on the
// wire and in the scan-device setup export.
export const EmployeeSetupCaseSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        employee: z
            .object({
                codeOffset: z.number().int().nonnegative(),
                exportIdentifierOffset: z.number().int().nonnegative(),
                nfcCodeOffset: z.number().int().nonnegative(),
                rfidCodeOffset: z.number().int().nonnegative(),
                department: z.string().min(1),
                crew: z.string().min(1),
                hourlyRate: z.string().min(1),
                gender: z.string().min(1),
                /** ISO, as the `type=date` input holds it and the wire stores it. */
                dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                defaultRanch: z.string().min(1),
                defaultField: z.string().min(1),
                defaultJob: z.string().min(1),
                waivedFirstMeal: z.boolean(),
                waivedSecondMeal: z.boolean(),
            })
            .strict(),
        device: z
            .object({
                /** 0 is PocketPDA — the same selection rule as A9. */
                pocketDeviceType: z.number().int().nonnegative(),
                missingMessage: z.string().min(1),
            })
            .strict(),
        expected: z
            .object({
                /** The Pay Period trigger's text; the form defaults to it and the case never touches it. */
                payPeriod: z.string().min(1),
                wire: z
                    .object({
                        rate: z.number(),
                        payPeriod: z.number().int(),
                        gender: z.number().int(),
                        nonNullKeys: z.array(z.string().min(1)).min(1),
                    })
                    .strict(),
                export: z
                    .object({
                        section: z.string().regex(/^\w+_Records$/),
                        crew: z.string().min(1),
                        defaultJob: z.string().min(1),
                    })
                    .strict(),
            })
            .strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const e = s.employee;
        const offsets = [e.codeOffset, e.exportIdentifierOffset, e.nfcCodeOffset, e.rfidCodeOffset];
        if (new Set(offsets).size !== offsets.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['employee'],
                message: 'the four code offsets must be distinct, or two identifiers of one employee would collide',
            });
        }
    });

export type EmployeeSetupCase = z.infer<typeof EmployeeSetupCaseSchema>;
