import { z } from 'zod';
import { DEVICE_SCHEMA, type EmployeeSource, type RecordNode } from '../../utils/relay/exportEnvelope';
import { CleanupStepSchema } from './cleanupStep';

// The runtime check and the TypeScript type of a Journey B scenario file are this one
// definition. Codes, "HH:mm" times and record indexes only — journeyBFlow.ts derives
// dates, references, ids and display names. `.strict()` everywhere: a misspelt key fails
// at the first line of the test with its path, not as an undefined inside an assertion.
// Every field below has a consumer; nothing is reserved for a later part.

const HHMM = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected "HH:mm"');
const Code = z.string().regex(/^[1-9]\d{3,}$/, 'a barcode code: 4+ digits, no leading zero');
const NODE_NAMES = Object.keys(DEVICE_SCHEMA.nodes) as [RecordNode, ...RecordNode[]];
const REFERENCE_PARTS = Object.values(DEVICE_SCHEMA.referenceParts) as [string, ...string[]];
const EMPLOYEE_SOURCES = Object.values(DEVICE_SCHEMA.employeeSource) as [EmployeeSource, ...EmployeeSource[]];
const CREW_CARD_CODES = ['employeeCode', 'crewCode', 'ranchCode', 'fieldCode', 'jobCode'] as const;

/** The configured fallback owner (`preferences.undefinedEmployee`); the flow puts it in the employee map under this code. */
export const UNDEFINED_EMPLOYEE = 'undefinedEmployee';
const Token = z.string().regex(/^\{\w+\}$/, 'a {token} minted from `codes`');
const CodeOrToken = z.union([Code, Token]);
const EmployeeRef = z.union([Code, z.literal(UNDEFINED_EMPLOYEE)]);

export const DeviceRecordJsonSchema = z
    .object({
        node: z.enum(NODE_NAMES).optional(), // records envelope only
        part: z.enum(REFERENCE_PARTS).optional(), // records envelope, card rows only
        employeeSource: z.enum(EMPLOYEE_SOURCES).optional(),
        employeeCode: CodeOrToken.optional(),
        crewCode: Code.optional(),
        ranchCode: Code.optional(),
        fieldCode: Code.optional(),
        jobCode: Code.optional(),
        time: HHMM.optional(),
        gps: z.string().optional(),
        pieces: z.number().int().nonnegative().optional(),
        /** Which `devices[]` entry sends this record — required exactly when the scenario declares devices. */
        device: z.string().min(1).optional(),
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
        employeeCode: EmployeeRef,
        /** `null` asserts the office stored NO field for this card (the record carried none). */
        fieldCode: Code.nullable().optional(),
        jobCode: Code.nullable().optional(),
        /** `null` asserts no ranch; omitted keeps the derived rule (a card with a field or job carries the run's ranch). */
        ranchCode: Code.nullable().optional(),
        // The one card whose Time In side panel is opened; names come from fixture.json.
        panel: z.literal(true).optional(),
        cardType: z.number().int().optional(),
        employeeSourceText: z.string().optional(),
        /** The raw EmployeeSource enum the API returns (13 Crew, 2 BarcodeBadge) — asserted by the spec. */
        employeeSourceCode: z.number().int().optional(),
        pieces: z.number().int().optional(),
        memoPattern: z.string().optional(),
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
        employees: z.array(CodeOrToken).optional(),
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
        /** `<X_Records>` sections the envelope must NOT carry. */
        absentSections: z.array(z.string().min(1)).optional(),
        /** Section node → its `LookupContents`, `null` when it declares none. */
        sectionLookups: z.record(z.string(), z.string().nullable()).optional(),
        /** `<NumOfPieces>` text → occurrences. */
        pieceCounts: z.record(z.string(), z.number().int()).optional(),
        /** The code-history grid's `<AlternateCode>` texts, document order. */
        alternateCodes: z.array(z.string().min(1)).optional(),
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
        transport: z.enum(['relay-ui', 'single-folder', 'relay-internet', 'relay-echo']),
        // 'none': the flow delivers, imports and polls; the spec owns every assertion (B7).
        verification: z.enum(['office-ui', 'cards', 'none']),
        cardType: z.number().int().nullable().optional(), // null = every type (an envelope mixing Time-Ins and Time-Outs)
        /** Literal strings the file refers to as `{name}` — substituted everywhere, like `{prefix}`; a minted value wins on a clash. */
        constants: z.record(z.string().regex(/^\w+$/), z.string()).optional(),
        codes: z
            .object({
                salt: z.string(),
                /** `lineageDigits(length, salt)` (default) or the 4-char `lineagePrefix(salt)`. */
                basis: z.enum(['digits', 'prefix']).optional(),
                length: z.number().int().positive().optional(),
                prefix: z.string().optional(),
                suffixes: z.array(z.string()).optional(),
                /** One code per entry — `prefix + base + suffix` — exposed as `{code<i>}` in declaration order. */
                parts: z.array(z.object({ prefix: z.string().optional(), suffix: z.string().optional() }).strict()).optional(),
                /** Salt the attempt in: a retry must not reuse an undeletable row's identity (B7's EmployeeCodeHistory has no DELETE). */
                attemptUnique: z.boolean().optional(),
            })
            .strict()
            .optional(),
        // Seeded by the flow next to the crew; the `B<n> ` prefix keeps them out of the residue sweep (cleanupTargets.ts:44).
        extraEmployees: z.array(z.object({ code: Code, name: z.string().regex(/^B\d{1,2} /) }).strict()).optional(),
        /** Module flags this workflow records; `noteWhenOff` is annotated when the live value is falsy. */
        modules: z
            .array(z.object({ key: z.string().min(1), label: z.string().min(1), noteWhenOff: z.string().min(1).optional() }).strict())
            .optional(),
        /** More than one envelope: one per device, records grouped by their `device` key, delivered in order. */
        devices: z.array(z.object({ id: z.string().min(1), salt: z.string() }).strict()).min(2).optional(),
        /** `RunTrackingEmpCodeStartLoc` / `RunTrackingRollCodeStartLoc`, 1-based — the office extracts `code[emp-1 .. roll-2]` as the alternate code. */
        sticker: z
            .object({ employeeCodeStartLocation: z.number().int().positive(), rollCodeStartLocation: z.number().int().positive() })
            .strict()
            .optional(),
        /** Roll assignments the Time In screen exports alongside its flat row; `record` names the card whose moment they share. */
        codeHistory: z
            .array(
                z
                    .object({
                        device: z.string().min(1).optional(),
                        record: z.number().int().nonnegative(),
                        employeeCode: Code,
                        scannedCode: z.string().min(1),
                        alternateCode: z.string().min(1),
                    })
                    .strict(),
            )
            .optional(),
        /** Clock-out questions the answer rows link against — discovered-or-created by Name before the envelope is built. */
        questions: z.array(QuestionSpecJsonSchema).optional(),
        preconditions: z.array(z.enum(['crewNotifyUser', 'undefinedEmployeeSet', 'requireJobInEmpPieceOut', 'stickerStartLocations'])).optional(),
        hooks: z
            .object({ beforeImport: z.enum(['codeHistorySnapshot']).optional(), afterImport: z.enum(['codeHistoryDelta']).optional() })
            .strict()
            .optional(),
        records: z.array(DeviceRecordJsonSchema).min(1),
        absentEmployees: z.array(Code).optional(),
        expected: z
            .object({
                envelope: ExpectedEnvelopeJsonSchema.optional(),
                /** Per-device envelope expectations, when the scenario sends more than one. */
                devices: z
                    .array(
                        z
                            .object({
                                device: z.string().min(1),
                                envelope: ExpectedEnvelopeJsonSchema,
                                /** The terminal status this device's import file must reach. */
                                importStatus: z.string().min(1).optional(),
                            })
                            .strict(),
                    )
                    .optional(),
                cards: z.array(ExpectedCardJsonSchema).default([]),
                /** A card type the fixture day must NOT hold for an expected employee (B6's WEBPET-1409 guard). */
                absentCardType: z.number().int().optional(),
                /** `POST transfer-to-job-cards/analyze` exception codes B5 selects between. */
                analyze: z
                    .object({ blockingCode: z.string().min(1), warningCode: z.string().min(1), undefinedEmployeeCode: z.string().min(1) })
                    .strict()
                    .optional(),
                /** `{code<i>}` pairs: the prefix the office extracts, and the sticker it extracts it from. */
                stickerPrefixes: z.array(z.object({ prefix: z.string().min(1), sticker: z.string().min(1) }).strict()).optional(),
                grid: z
                    .object({
                        status: z.string().min(1).optional(),
                        issueGroup: z.string().optional(),
                        /** Texts the card's own grid row must contain (Type, Employee Selection …). */
                        texts: z.array(z.string().min(1)).optional(),
                        absentIssueGroupPattern: z.string().min(1).optional(),
                    })
                    .strict()
                    .optional(),
                relay: z.object({ subject: z.string().min(1) }).strict().optional(),
                intervals: z
                    .array(z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), ms: z.number().int() }).strict())
                    .optional(),
            })
            .strict(),
        /** Named gates the flow annotates after the import — what the workflow proves it does NOT assert, and why. */
        annotations: z
            .array(
                z
                    .object({
                        type: z.string().min(1),
                        description: z.string().min(1),
                        /** Push only when this device's import file carries a message matching `pattern`. */
                        whenDeviceFileMatches: z.object({ device: z.string().min(1), pattern: z.string().min(1) }).strict().optional(),
                    })
                    .strict(),
            )
            .optional(),
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
        const deviceIds = new Set((s.devices ?? []).map((d) => d.id));
        if (s.devices) {
            s.records.forEach((r, i) => {
                if (!r.device || !deviceIds.has(r.device)) issue(['records', i, 'device'], 'a multi-device scenario names the sending device on every record');
                if (r.parentRecord !== undefined) issue(['records', i], 'grid rows and multiple devices are not combined — a grid row names its parent by record index within one envelope');
            });
            if (!s.expected.devices?.length) issue(['expected', 'devices'], 'a multi-device scenario expects one envelope block per device');
            for (const [i, want] of (s.expected.devices ?? []).entries()) {
                if (!deviceIds.has(want.device)) issue(['expected', 'devices', i, 'device'], `'${want.device}' is not in scenario.devices`);
            }
        } else if (!s.expected.envelope) {
            issue(['expected', 'envelope'], 'a single-envelope scenario expects an envelope block');
        }
        (s.codeHistory ?? []).forEach((a, i) => {
            if (!isCard(a.record)) issue(['codeHistory', i, 'record'], 'a roll assignment shares a card record’s moment');
            if (s.devices && (!a.device || !deviceIds.has(a.device))) issue(['codeHistory', i, 'device'], 'a multi-device scenario names the sending device on every roll assignment');
            if (!s.sticker) issue(['codeHistory', i], 'the roll’s FirstCode is split at sticker.rollCodeStartLocation — add a sticker block');
        });
        if (s.codes?.suffixes?.length && s.codes.parts?.length) issue(['codes', 'parts'], 'use suffixes or parts, not both');
        if ((s.codes?.suffixes?.length || s.codes?.parts?.length) && s.codes.basis !== 'prefix' && !s.codes.length) {
            issue(['codes', 'length'], 'minted codes need their digit length');
        }
        if (s.preconditions?.includes('stickerStartLocations') && !s.sticker) issue(['sticker'], "precondition 'stickerStartLocations' writes the two values in the sticker block");
        if (s.expected.cards.some((c) => c.employeeCode === UNDEFINED_EMPLOYEE) && !s.preconditions?.includes('undefinedEmployeeSet')) {
            issue(['preconditions'], "a card expected on the Undefined Employee needs the 'undefinedEmployeeSet' precondition");
        }
        if (s.transport === 'relay-echo' && s.verification !== 'none') issue(['verification'], "relay-echo never reaches the office — use 'none'");
        if (s.verification === 'none' && s.transport === 'relay-ui') issue(['verification'], "verification 'none' is the flow's own deliver-and-poll path — use 'relay-internet' or 'relay-echo'");
        if (s.transport === 'relay-internet' && s.verification !== 'none') issue(['verification'], "the API relay pull does not assert the links itself — use 'none'");
        if (s.transport === 'relay-echo' && !s.expected.relay) issue(['expected', 'relay'], 'relay-echo asserts the relay subject');
        if (s.verification === 'office-ui' && !s.expected.grid?.status) issue(['expected', 'grid'], 'office-ui verification asserts the Transfer grid — add expected.grid.status');
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
