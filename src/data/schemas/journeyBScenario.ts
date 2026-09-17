import { z } from 'zod';
import { DEVICE_SCHEMA, type EmployeeSource, type RecordNode } from '../../utils/relay/exportEnvelope';
import { CleanupStepSchema } from './cleanupStep';

// The runtime check and the TypeScript type of a Journey B scenario file are this one
// definition. Codes, "HH:mm" times and record indexes only — journeyBFlow.ts derives
// dates, references, ids and display names. `.strict()` everywhere: a misspelt key fails
// at the first line of the test with its path, not as an undefined inside an assertion.
// Fields marked 4c/4d have no consumer yet; they are the shape the later parts fill.

const HHMM = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected "HH:mm"');
const Code = z.string().regex(/^[1-9]\d{3,}$/, 'a barcode code: 4+ digits, no leading zero');
const NODE_NAMES = Object.keys(DEVICE_SCHEMA.nodes) as [RecordNode, ...RecordNode[]];
const REFERENCE_PARTS = Object.values(DEVICE_SCHEMA.referenceParts) as [string, ...string[]];
const EMPLOYEE_SOURCES = Object.values(DEVICE_SCHEMA.employeeSource) as [EmployeeSource, ...EmployeeSource[]];
const CREW_CARD_CODES = ['employeeCode', 'crewCode', 'ranchCode', 'fieldCode', 'jobCode'] as const;

export const DeviceRecordJsonSchema = z
    .object({
        node: z.enum(NODE_NAMES).optional(), // records envelope only
        part: z.enum(REFERENCE_PARTS).optional(), // records envelope only
        employeeSource: z.enum(EMPLOYEE_SOURCES).optional(),
        employeeCode: Code.optional(),
        crewCode: Code.optional(),
        ranchCode: Code.optional(),
        fieldCode: Code.optional(),
        jobCode: Code.optional(),
        time: HHMM.optional(),
        gps: z.string().optional(),
        pieces: z.number().int().nonnegative().optional(), // 4d
        traceabilityCode: z.string().optional(), // a {code<i>} token or a literal
    })
    .strict();

export const ExpectedCardJsonSchema = z
    .object({
        // 0-based index into `records`; the flow mints references in record order and
        // copies the record's gps/traceabilityCode onto the expectation.
        record: z.number().int().nonnegative(),
        employeeCode: Code,
        fieldCode: Code.optional(),
        jobCode: Code.optional(),
        // The one card whose Time In side panel is opened; names come from fixture.json.
        panel: z.literal(true).optional(),
        cardType: z.number().int().optional(), // 4c
        employeeSourceText: z.string().optional(), // 4c/4d
        pieces: z.number().int().optional(), // 4d
        memoPattern: z.string().optional(), // 4d
    })
    .strict();

export const ExpectedEnvelopeJsonSchema = z
    .object({
        sections: z.array(z.string()).optional(),
        employeeSources: z.record(z.string(), z.number().int()).optional(),
        referenceParts: z.array(z.string()).optional(),
        absentTags: z.array(z.string()).optional(),
        gpsFixes: z.number().int().optional(),
        lookupContents: z.array(z.string()).optional(),
        employees: z.array(Code).optional(),
        /** Distinct `<Field>` / `<Job>` codes the envelope carries. */
        fields: z.array(Code).optional(),
        jobs: z.array(Code).optional(),
        /** `{code<i>}` tokens — mintRun substitutes the run's minted codes before the spec compares. */
        traceabilityCodes: z.array(z.string().min(1)).optional(),
    })
    .strict();

export const JourneyBScenarioSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.string().regex(/^B\d{1,2}$/),
        label: z.string().min(1),
        // Days back from today — one fixture day per workflow (workers=2 collision guard).
        dayOffset: z.number().int().max(0),
        // Crew envelope: its single punch moment. Records envelope: header time only.
        punchTime: HHMM.optional(),
        envelope: z.enum(['crew', 'records']),
        transport: z.enum(['relay-ui', 'single-folder', 'relay-echo']), // single-folder: 4d
        verification: z.enum(['office-ui', 'cards', 'none']), // cards: 4c, none: 4d
        cardType: z.number().int().nullable().optional(), // 4c (null = every type)
        codes: z
            .object({
                salt: z.string(),
                length: z.number().int().positive().optional(),
                prefix: z.string().optional(),
                suffixes: z.array(z.string()).optional(),
                attemptUnique: z.boolean().optional(),
            })
            .strict()
            .optional(), // attemptUnique: 4d
        // Seeded by the flow next to the crew; the `B<n> ` prefix keeps them out of the residue sweep (cleanupTargets.ts:44).
        extraEmployees: z.array(z.object({ code: Code, name: z.string().regex(/^B\d{1,2} /) }).strict()).optional(),
        preconditions: z.array(z.enum(['piecePaymentModule', 'undefinedEmployeeSet', 'requireJobInEmpPieceOut'])).optional(), // 4c/4d
        hooks: z
            .object({ beforeImport: z.enum(['codeHistorySnapshot']).optional(), afterImport: z.enum(['codeHistoryDelta']).optional() })
            .strict()
            .optional(),
        records: z.array(DeviceRecordJsonSchema).min(1),
        absentEmployees: z.array(Code).optional(),
        expected: z
            .object({
                envelope: ExpectedEnvelopeJsonSchema,
                cards: z.array(ExpectedCardJsonSchema).default([]),
                grid: z
                    .object({ status: z.string().min(1), issueGroup: z.string().optional(), texts: z.array(z.string()).optional() }) // texts: 4c/4d
                    .strict()
                    .optional(),
                relay: z.object({ subject: z.string().min(1) }).strict().optional(),
            })
            .strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        if (s.envelope === 'crew' && !s.punchTime) issue(['punchTime'], 'a crew envelope needs its punch moment');
        s.records.forEach((r, i) => {
            if (s.envelope === 'records' && (!r.node || !r.part)) issue(['records', i], 'a records envelope needs node and part on every record');
            if (s.envelope === 'crew') {
                for (const key of CREW_CARD_CODES) if (!r[key]) issue(['records', i, key], 'a crew card carries all five codes');
            }
        });
        s.expected.cards.forEach((c, i) => {
            if (c.record >= s.records.length) issue(['expected', 'cards', i, 'record'], `record index ${c.record} out of range (${s.records.length} records)`);
        });
        if (s.transport === 'relay-echo' && s.verification !== 'none') issue(['verification'], "relay-echo never reaches the office — use 'none'");
        if (s.transport === 'relay-echo' && !s.expected.relay) issue(['expected', 'relay'], 'relay-echo asserts the relay subject');
        if (s.verification === 'office-ui' && !s.expected.grid) issue(['expected', 'grid'], 'office-ui verification asserts the Transfer grid — add expected.grid');
        if (s.codes?.suffixes?.length && !s.codes.length) issue(['codes', 'length'], 'minted codes need their digit length');
        if (!!s.hooks?.beforeImport !== !!s.hooks?.afterImport) issue(['hooks'], 'codeHistorySnapshot and codeHistoryDelta bracket the import together');
    });

export type JourneyBScenario = z.infer<typeof JourneyBScenarioSchema>;
