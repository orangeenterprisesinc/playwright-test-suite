import { z } from 'zod';
import { DEVICE_SCHEMA, type EmployeeSource, type RecordNode } from '../../utils/relay/exportEnvelope';
import { CleanupStepSchema } from './cleanupStep';

// The runtime check and the TypeScript type of a Journey B scenario file are this one
// definition. Codes, "HH:mm" times and record indexes only — journeyBFlow.ts derives
// dates, references, ids and display names. `.strict()` everywhere: a misspelt key fails
// at the first line of the test with its path, not as an undefined inside an assertion.
// Fields marked 4d have no consumer yet; they are the shape the last part fills.

const HHMM = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected "HH:mm"');
const Code = z.string().regex(/^[1-9]\d{3,}$/, 'a barcode code: 4+ digits, no leading zero');
const NODE_NAMES = Object.keys(DEVICE_SCHEMA.nodes) as [RecordNode, ...RecordNode[]];
const REFERENCE_PARTS = Object.values(DEVICE_SCHEMA.referenceParts) as [string, ...string[]];
const EMPLOYEE_SOURCES = Object.values(DEVICE_SCHEMA.employeeSource) as [EmployeeSource, ...EmployeeSource[]];
const CREW_CARD_CODES = ['employeeCode', 'crewCode', 'ranchCode', 'fieldCode', 'jobCode'] as const;

export const DeviceRecordJsonSchema = z
    .object({
        node: z.enum(NODE_NAMES).optional(), // records envelope only
        part: z.enum(REFERENCE_PARTS).optional(), // records envelope, card rows only
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
        /** Base64 image for the row's `<Signature>` slot — a `{constant}` token or a literal. */
        signature: z.string().optional(),
        // Grid rows (TimeCardQuestion): the parent card by record index — the flow turns it into the
        // parent's Reference — plus the question Name and the answer. A grid row mints no reference.
        parentRecord: z.number().int().nonnegative().optional(),
        question: z.string().min(1).optional(),
        response: z.string().optional(),
        /** The answer falls outside the question's required response; the flow checks that against the live question. */
        unexpected: z.literal(true).optional(),
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
        cardType: z.number().int().optional(),
        employeeSourceText: z.string().optional(), // 4d
        /** The raw EmployeeSource enum the API returns (13 Crew, 2 BarcodeBadge) — asserted by the spec. */
        employeeSourceCode: z.number().int().optional(),
        pieces: z.number().int().optional(), // 4d
        memoPattern: z.string().optional(), // 4d
    })
    .strict();

export const ExpectedEnvelopeJsonSchema = z
    .object({
        sections: z.array(z.string()).optional(),
        employeeSources: z.record(z.string(), z.number().int()).optional(),
        referenceParts: z.array(z.string()).optional(),
        /** Reference part → occurrences, e.g. `{ "CI": 3, "TO": 1, "CO": 2 }`. */
        referencePartCounts: z.record(z.string(), z.number().int()).optional(),
        absentTags: z.array(z.string()).optional(),
        /** Section node → element names that must not appear inside it (a time-out row carries no work context). */
        absentInSection: z.record(z.string(), z.array(z.string().min(1))).optional(),
        /** Sections that declare no LookupContents attribute (grid sections match on Reference and Name). */
        sectionsWithoutLookup: z.array(z.string().min(1)).optional(),
        gpsFixes: z.number().int().optional(),
        lookupContents: z.array(z.string()).optional(),
        employees: z.array(Code).optional(),
        /** Distinct `<Field>` / `<Job>` codes the envelope carries. */
        fields: z.array(Code).optional(),
        jobs: z.array(Code).optional(),
        /** `<Job>` code → occurrences. */
        jobOccurrences: z.record(Code, z.number().int()).optional(),
        /** `{code<i>}` tokens — mintRun substitutes the run's minted codes before the spec compares. */
        traceabilityCodes: z.array(z.string().min(1)).optional(),
        /** Non-empty `<Signature>` payloads, document order — `{constant}` tokens or literals. */
        signatures: z.array(z.string().min(1)).optional(),
        /** `<Response>` rows across the envelope — one per answered question. */
        answerRows: z.number().int().nonnegative().optional(),
    })
    .strict();

const QuestionSpecJsonSchema = z
    .object({ name: z.string().min(1), requiredResponse: z.string().min(1), allowedResponses: z.string().min(1), questionText: z.string().min(1) })
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
        verification: z.enum(['office-ui', 'cards', 'none']), // none: 4d
        cardType: z.number().int().nullable().optional(), // null = every type (an envelope mixing Time-Ins and Time-Outs)
        /** Literal strings the file refers to as `{name}` — substituted everywhere, like `{prefix}`; a minted value wins on a clash. */
        constants: z.record(z.string().regex(/^\w+$/), z.string()).optional(),
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
        /** Clock-out questions the answer rows link against — discovered-or-created by Name before the envelope is built. */
        questions: z.array(QuestionSpecJsonSchema).optional(),
        preconditions: z.array(z.enum(['crewNotifyUser', 'piecePaymentModule', 'undefinedEmployeeSet', 'requireJobInEmpPieceOut'])).optional(), // all but crewNotifyUser: 4d
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
                    .object({
                        status: z.string().min(1),
                        issueGroup: z.string().optional(),
                        texts: z.array(z.string()).optional(), // 4d
                        /** Case-insensitive pattern no issue group may match — the spec compiles and asserts it. */
                        absentIssueGroupPattern: z.string().min(1).optional(),
                    })
                    .strict()
                    .optional(),
                relay: z.object({ subject: z.string().min(1) }).strict().optional(),
                /** Stored-instant gaps between two card records, in ms. */
                intervals: z
                    .array(z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), ms: z.number().int() }).strict())
                    .optional(),
            })
            .strict(),
        /** Named gates the flow annotates after the import — what the workflow proves it does NOT assert, and why. */
        annotations: z.array(z.object({ type: z.string().min(1), description: z.string().min(1) }).strict()).optional(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
        const isCard = (i: number) => i < s.records.length && s.records[i].parentRecord === undefined;
        if (s.envelope === 'crew' && !s.punchTime) issue(['punchTime'], 'a crew envelope needs its punch moment');
        s.records.forEach((r, i) => {
            const isGridRow = r.parentRecord !== undefined;
            if (s.envelope === 'records' && (!r.node || (!r.part && !isGridRow))) issue(['records', i], 'a records envelope needs node and part on every card row');
            if (s.envelope === 'crew') {
                for (const key of CREW_CARD_CODES) if (!r[key]) issue(['records', i, key], 'a crew card carries all five codes');
            }
            if (isGridRow) {
                if (r.parentRecord! >= i || !isCard(r.parentRecord!)) issue(['records', i, 'parentRecord'], 'a grid row names an EARLIER card record as its parent');
                if (!r.question || r.response === undefined) issue(['records', i], 'a grid row carries question and response');
                if (r.question && !(s.questions ?? []).some((q) => q.name === r.question)) issue(['records', i, 'question'], `'${r.question}' is not in scenario.questions`);
            } else if (r.question !== undefined || r.response !== undefined || r.unexpected) {
                issue(['records', i], 'question/response/unexpected belong to a grid row (parentRecord)');
            }
        });
        s.expected.cards.forEach((c, i) => {
            if (c.record >= s.records.length) issue(['expected', 'cards', i, 'record'], `record index ${c.record} out of range (${s.records.length} records)`);
            else if (!isCard(c.record)) issue(['expected', 'cards', i, 'record'], 'a grid row imports no card');
        });
        (s.expected.intervals ?? []).forEach((gap, i) => {
            for (const key of ['from', 'to'] as const) if (!isCard(gap[key])) issue(['expected', 'intervals', i, key], 'an interval spans two card records');
        });
        if (s.expected.grid?.absentIssueGroupPattern && s.verification !== 'office-ui') issue(['expected', 'grid', 'absentIssueGroupPattern'], 'issue groups are read from the Transfer grid — needs office-ui verification');
        if (s.transport === 'relay-echo' && s.verification !== 'none') issue(['verification'], "relay-echo never reaches the office — use 'none'");
        if (s.transport === 'relay-echo' && !s.expected.relay) issue(['expected', 'relay'], 'relay-echo asserts the relay subject');
        if (s.verification === 'office-ui' && !s.expected.grid) issue(['expected', 'grid'], 'office-ui verification asserts the Transfer grid — add expected.grid');
        if (s.codes?.suffixes?.length && !s.codes.length) issue(['codes', 'length'], 'minted codes need their digit length');
        if (!!s.hooks?.beforeImport !== !!s.hooks?.afterImport) issue(['hooks'], 'codeHistorySnapshot and codeHistoryDelta bracket the import together');
    });

export type JourneyBScenario = z.infer<typeof JourneyBScenarioSchema>;

// B15 — the office pushes setup TO a device; no envelope is built, so this is a value bag: the
// name prefixes and code offsets the flow mints from, the export section each entity lands in, cleanup.
const ScopedEntityJsonSchema = z
    .object({
        /** Must be a prefix the residue sweep reclaims for the entity (cleanupTargets.ts); the flow refuses any other. */
        prefix: z.string().min(5),
        /** Added to the run token so the entities of one run never share a barcode. */
        codeOffset: z.number().int().positive(),
        /** The `<X_Records>` block the office serializes this entity into. */
        section: z.string().regex(/^\w+_Records$/),
    })
    .strict();

export const DeviceSyncScenarioSchema = z
    .object({
        _notes: z.array(z.string()).optional(),
        workflow: z.string().regex(/^B\d{1,2}$/),
        label: z.string().min(1),
        entities: z.object({ ranch: ScopedEntityJsonSchema, field: ScopedEntityJsonSchema, crew: ScopedEntityJsonSchema }).strict(),
        device: z.object({ prefix: z.string().min(5) }).strict(),
        cleanup: z.array(CleanupStepSchema).default([]),
    })
    .strict()
    .superRefine((s, ctx) => {
        const offsets = Object.values(s.entities).map((e) => e.codeOffset);
        if (new Set(offsets).size !== offsets.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entities'], message: 'codeOffsets must be distinct' });
    });

export type DeviceSyncScenario = z.infer<typeof DeviceSyncScenarioSchema>;
