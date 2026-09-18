import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import type { Locator } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { relayConfig, type RelayConfig } from '@config/relay.config';
import { JOURNEY_B_FIXTURE as F, punchDay } from '@data/journey-b/fixture';
import { UNDEFINED_EMPLOYEE, type JourneyBScenario } from '@data/schemas/journeyBScenario';
import {
    annotateIfImportCircuitOpen,
    journeyBTestTimeoutMs,
    newImportDeadline,
    pullFromRelayInternet,
    type ImportFileResult,
} from '@utils/api/connectivityImportApi';
import { getCrew, setCrewNotifyUser, type CrewRecord } from '@utils/api/crewsApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import {
    assertTransferGrid as assertTransferGridScreen,
    deliverAndVerifyCards,
    transferGridRowFor,
    type ExpectedCard,
    type OfficeVerificationResult,
    type TransferGridResult,
} from '@utils/api/officeVerification';
import { getPreferences, putPreferences } from '@utils/api/preferencesApi';
import { ensureQuestion, type QuestionRecord } from '@utils/api/questionsApi';
import { ensureEmployee } from '@utils/api/setupEntitiesApi';
import { getCodeHistory, type CodeHistoryRow } from '@utils/api/stickerRollApi';
import { findByReferences, getTimeOutDetail, isoDay, listTimeCards, type OfficeTimeCard, type OfficeTimeOutDetail } from '@utils/api/timeCardsApi';
import { analyzeTransfer, type AnalyzeException, type AnalyzeResult } from '@utils/api/transferToJobCardsApi';
import { findNotifiableUser, type UserListItem } from '@utils/api/usersApi';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { substituteTokens } from '@utils/data/scenarioLoader';
import {
    buildCrewTimeInEnvelope,
    buildEnvelope,
    buildReference,
    DEVICE_SCHEMA,
    deviceIso,
    exportFileName,
    lineageDigits,
    lineagePrefix,
    punchMoment,
    type DeviceRecord,
    type EnvelopeCard,
} from '@utils/relay/exportEnvelope';
import { ackRetrieved, drainMailbox, pullFromRelay, sendToRelay, type PulledMessage, type SendResult } from '@utils/relay/relayClient';

// The Journey B flow: seed → questions → mint → pre-import cleanup (restore snapshots) →
// preconditions → build/attach/send → import + card asserts (deliverAndVerifyCards) → the spec
// asserts and calls cleanup(). Nothing here belongs in a spec; specs reach the relay, the importer
// and the office only through this module (ESLint enforces it). `pages` is optional: browserless
// workflows (b05/b07) import through single-folder / relay-internet and never open the office UI.

type ExpectedCardJson = JourneyBScenario['expected']['cards'][number];
type GridExpectation = NonNullable<JourneyBScenario['expected']['grid']>;

/** Facts about one built envelope, so a spec compares fields instead of grepping XML. */
export interface EnvelopeView {
    xml: string;
    /** One per card, document order — the importer's identity key. */
    references: string[];
    /** Per scenario record: its reference, or '' for a grid row (an answer row has none). */
    recordReferences: string[];
    fileName: string;
    prefix: string;
    /** `<X_Records>` section node names, document order. */
    sections: string[];
    /** Every distinct element name in the document. */
    tagNames: string[];
    /** Distinct element names inside each `<X_Records>` section, keyed by node. */
    sectionTags: Record<string, string[]>;
    /** Each section's `LookupContents` attribute, `null` when the section declares none. */
    sectionLookups: Record<string, string | null>;
    /** `<EmployeeSource>` text → occurrences. */
    employeeSources: Record<string, number>;
    /** `<Employee>` text values, document order (the grid's `<Employee><Code>` wrapper excluded). */
    employees: string[];
    /** Distinct `LookupContents` attribute values. */
    lookupContents: string[];
    /** The capture-screen part of each reference (`TI`, `CI`, …), reference order. */
    referenceParts: string[];
    /** Reference part → occurrences. */
    referencePartCounts: Record<string, number>;
    /** `<GpsReading>` occurrences. */
    gpsFixes: number;
    /** Distinct `<Field>` / `<Job>` code texts, document order. */
    fields: string[];
    jobs: string[];
    /** `<Job>` code → occurrences. */
    jobOccurrences: Record<string, number>;
    /** Non-empty `<TraceabilityCode>` texts, record order (the serializer emits an empty one on every other row). */
    traceabilityCodes: string[];
    /** Non-empty `<Signature>` payloads, document order. */
    signatures: string[];
    /** `<Response>` rows — one per answered question. */
    answerRows: number;
    /** `<NumOfPieces>` text → occurrences. */
    pieceCounts: Record<string, number>;
    /** The code-history grid's `<AlternateCode>` texts, document order. */
    alternateCodes: string[];
}

/** The capture-screen part of a reference (`0000001-260918-TI-ABCD-ui` → `TI`). */
export function referencePart(reference: string): string {
    return reference.split('-')[2] ?? '';
}

export function envelopeView(xml: string, references: string[], fileName: string, prefix: string, recordReferences: string[] = references): EnvelopeView {
    const T = DEVICE_SCHEMA.tags;
    const texts = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]);
    const tally = (values: string[]) => {
        const out: Record<string, number> = {};
        for (const v of values) out[v] = (out[v] ?? 0) + 1;
        return out;
    };
    const sectionTags: Record<string, string[]> = {};
    const sectionLookups: Record<string, string | null> = {};
    // Opens only: the body-matching scan below swallows a NESTED section (the code-history grid
    // inside <Employee_Records>), and B7 asserts that grid's own LookupContents.
    for (const [, node, attrs] of xml.matchAll(new RegExp(`<(\\w+)${DEVICE_SCHEMA.recordsSuffix}([^>]*)>`, 'g'))) {
        sectionLookups[node] = new RegExp(`${DEVICE_SCHEMA.attributes.lookupContents}="([^"]*)"`).exec(attrs)?.[1] ?? null;
    }
    const sectionRe = new RegExp(`<(\\w+)${DEVICE_SCHEMA.recordsSuffix}([^>]*)>([\\s\\S]*?)</\\1${DEVICE_SCHEMA.recordsSuffix}>`, 'g');
    for (const [, node, , body] of xml.matchAll(sectionRe)) {
        sectionTags[node] = [...new Set([...body.matchAll(/<([A-Za-z_]\w*)[\s>]/g)].map((m) => m[1]))];
    }
    const referenceParts = references.map(referencePart);
    return {
        xml,
        references,
        recordReferences,
        fileName,
        prefix,
        sections: [...xml.matchAll(new RegExp(`<(\\w+)${DEVICE_SCHEMA.recordsSuffix}\\b`, 'g'))].map((m) => m[1]),
        tagNames: [...new Set([...xml.matchAll(/<([A-Za-z_]\w*)[\s>]/g)].map((m) => m[1]))],
        sectionTags,
        sectionLookups,
        employeeSources: tally(texts(T.employeeSource)),
        employees: texts(T.employee).filter((v) => v !== ''),
        lookupContents: [...new Set([...xml.matchAll(new RegExp(`${DEVICE_SCHEMA.attributes.lookupContents}="([^"]*)"`, 'g'))].map((m) => m[1]))],
        referenceParts,
        referencePartCounts: tally(referenceParts),
        gpsFixes: texts(T.gpsReading).length,
        fields: [...new Set(texts(T.field))],
        jobs: [...new Set(texts(T.job))],
        jobOccurrences: tally(texts(T.job)),
        traceabilityCodes: texts(T.traceabilityCode).filter((v) => v !== ''),
        signatures: texts(T.signature).filter((v) => v !== ''),
        answerRows: texts(T.response).length,
        pieceCounts: tally(texts(T.numOfPieces)),
        alternateCodes: texts(DEVICE_SCHEMA.grid.tags.alternateCode),
    };
}

export interface MintedRun {
    scenario: JourneyBScenario;
    prefix: string;
    /** `codes.prefix + lineageDigits(codes.length, codes.salt) + codes.suffixes[i]` — `{code<i>}` in the scenario. */
    codes: string[];
    /** `testInfo.retry` — `codes.attemptUnique` salts it into every minted value. */
    attempt: number;
    punchDate: Date;
    deviceAddress: string;
    fileName: string;
}

/** `codes.attemptUnique` salts the attempt in, so a retry never reuses an undeletable row's identity (B7). */
function saltOf(codes: JourneyBScenario['codes'], salt: string, attempt: number): string {
    return codes?.attemptUnique ? `${salt}${attempt}` : salt;
}

export function mintCodes(codes: JourneyBScenario['codes'], attempt = 0): string[] {
    const parts = codes?.parts ?? codes?.suffixes?.map((suffix) => ({ prefix: codes.prefix, suffix }));
    if (!codes || !parts?.length) return [];
    // From the lineage, not the clock: references are retry-stable, so a clock value would let an
    // earlier attempt's late import overwrite this attempt's code (seen 2026-09-17). `length` is
    // guaranteed by the schema's superRefine for the digit basis.
    const salt = saltOf(codes, codes.salt, attempt);
    const base = codes.basis === 'prefix' ? lineagePrefix(salt) : lineageDigits(codes.length!, salt);
    return parts.map((part) => `${part.prefix ?? codes.prefix ?? ''}${base}${part.suffix ?? ''}`);
}

/** Prefix, minted codes, fixture day, device address, file name — and `{prefix}` / `{code<i>}` / `{constant}` substituted into every string of the scenario. */
export function mintRun(scenario: JourneyBScenario, testInfo?: TestInfo): MintedRun {
    const attempt = testInfo?.retry ?? 0;
    const prefix = lineagePrefix(saltOf(scenario.codes, scenario.codes?.salt ?? '', attempt));
    const codes = mintCodes(scenario.codes, attempt);
    const tokens = { ...(scenario.constants ?? {}), prefix, ...Object.fromEntries(codes.map((code, i) => [`code${i}`, code])) };
    return {
        scenario: substituteTokens(scenario, tokens),
        prefix,
        codes,
        attempt,
        punchDate: punchDay(scenario.dayOffset),
        deviceAddress: relayConfig().from,
        fileName: exportFileName(prefix),
    };
}

function hhmm(time: string, day: Date): Date {
    const [h, m] = time.split(':').map(Number);
    return punchMoment(h, m, day);
}

/** The instant record `index` was sent with (its own time, else the scenario's punchTime, on the fixture day). */
export function recordMoment(run: MintedRun, index: number): Date {
    const record = run.scenario.records[index];
    const time = record?.time ?? run.scenario.punchTime;
    if (!record || !time) throw new Error(`${run.scenario.label}: record ${index} has no time and the scenario no punchTime`);
    return hhmm(time, run.punchDate);
}

/** {@link recordMoment} as the ISO stamp the row was sent with — and the office stores. */
export function recordStamp(run: MintedRun, index: number): string {
    return deviceIso(recordMoment(run, index));
}

/** The instant the office stored for a card. */
export function storedMoment(card: OfficeTimeCard): Date {
    return new Date(String(card.dateTime));
}

// Records with their references minted up front: a grid row names its parent card by Reference,
// so the parent's must exist before the envelope is built. Identical to what buildEnvelope would
// mint (same seq, moment, prefix and part) — it takes `record.reference` as given.
function toDeviceRecords(scenario: JourneyBScenario, punchDate: Date, prefix: string): { records: DeviceRecord[]; recordReferences: string[] } {
    const envelopeAt = scenario.punchTime ? hhmm(scenario.punchTime, punchDate) : undefined;
    const recordReferences: string[] = [];
    let cardSeq = 0;
    const records = scenario.records.map((r) => {
        const at = r.time ? hhmm(r.time, punchDate) : envelopeAt;
        const isGridRow = r.parentRecord !== undefined;
        let reference: string | undefined;
        if (!isGridRow) {
            cardSeq += 1;
            reference = buildReference(cardSeq, at ?? punchMoment(), prefix, r.part ?? '');
        }
        recordReferences.push(reference ?? '');
        return {
            // node is guaranteed by the schema's superRefine for a 'records' envelope.
            node: r.node!,
            part: r.part ?? '',
            employeeSource: r.employeeSource,
            employeeCode: r.employeeCode,
            crewCode: r.crewCode,
            ranchCode: r.ranchCode,
            fieldCode: r.fieldCode,
            jobCode: r.jobCode,
            at,
            gps: r.gps,
            pieces: r.pieces,
            traceabilityCode: r.traceabilityCode,
            signature: r.signature,
            reference,
            parentReference: isGridRow ? recordReferences[r.parentRecord!] : undefined,
            question: r.question,
            response: r.response,
        };
    });
    return { records, recordReferences };
}

function toCrewCards(scenario: JourneyBScenario): EnvelopeCard[] {
    // All five codes are guaranteed by the schema's superRefine for a 'crew' envelope.
    return scenario.records.map((r) => ({
        employeeCode: r.employeeCode!,
        crewCode: r.crewCode!,
        ranchCode: r.ranchCode!,
        fieldCode: r.fieldCode!,
        jobCode: r.jobCode!,
        gps: r.gps,
    }));
}

/** One device's envelope and the records it carries, by their index in `scenario.records`. */
export interface BuiltEnvelope {
    id: string;
    envelope: EnvelopeView;
    recordIndexes: number[];
}

function buildRecordsEnvelope(run: MintedRun, prefix: string, recordIndexes: number[]): EnvelopeView {
    const { scenario, punchDate, deviceAddress } = run;
    const at = scenario.punchTime ? hhmm(scenario.punchTime, punchDate) : undefined;
    const subset = recordIndexes.map((i) => scenario.records[i]);
    const { records, recordReferences } = toDeviceRecords({ ...scenario, records: subset }, punchDate, prefix);
    // The roll assignment's StartDateTime is its Time In's own moment — what puts it inside the
    // window the office's sticker rule searches (startOfDay(pieceOut) .. pieceOut).
    const codeHistory = (scenario.codeHistory ?? [])
        .filter((a) => recordIndexes.includes(a.record))
        .map((a) => ({
            employeeCode: a.employeeCode,
            scannedCode: a.scannedCode,
            alternateCode: a.alternateCode,
            // The roll's own tail, the same split the office applies.
            firstCode: a.scannedCode.slice(scenario.sticker!.rollCodeStartLocation - 1),
            at: hhmm(scenario.records[a.record].time ?? scenario.punchTime!, punchDate),
        }));
    const built = buildEnvelope({ deviceAddress, prefix, records, at, ...(codeHistory.length ? { codeHistory } : {}) });
    return envelopeView(built.xml, built.references, exportFileName(prefix), prefix, recordReferences);
}

export function buildScenarioEnvelope(run: MintedRun): EnvelopeView {
    const { scenario, prefix, punchDate, deviceAddress, fileName } = run;
    if (scenario.envelope === 'crew') {
        const at = scenario.punchTime ? hhmm(scenario.punchTime, punchDate) : undefined;
        const built = buildCrewTimeInEnvelope({ deviceAddress, prefix, cards: toCrewCards(scenario), at });
        return envelopeView(built.xml, built.references, fileName, prefix);
    }
    return buildRecordsEnvelope(run, prefix, scenario.records.map((_, i) => i));
}

/** Every envelope this scenario sends: one per `devices` entry, in declaration order, else one for the whole record list. */
export function buildScenarioEnvelopes(run: MintedRun): BuiltEnvelope[] {
    const { scenario } = run;
    if (!scenario.devices) {
        return [{ id: scenario.label, envelope: buildScenarioEnvelope(run), recordIndexes: scenario.records.map((_, i) => i) }];
    }
    return scenario.devices.map((device) => ({
        id: device.id,
        recordIndexes: scenario.records.flatMap((r, i) => (r.device === device.id ? [i] : [])),
        envelope: buildRecordsEnvelope(
            run,
            lineagePrefix(saltOf(scenario.codes, device.salt, run.attempt)),
            scenario.records.flatMap((r, i) => (r.device === device.id ? [i] : [])),
        ),
    }));
}

/** Attach the envelope, push it to `to`, attach the relay's answer. The caller asserts `send.success`. */
export async function sendEnvelope(run: MintedRun, envelope: EnvelopeView, to: string, testInfo: TestInfo, suffix = ''): Promise<SendResult> {
    await testInfo.attach(`device-export${suffix}.xml`, { body: envelope.xml, contentType: 'application/xml' });
    const send = await sendToRelay({ url: relayConfig().url, from: run.deviceAddress, to, xml: envelope.xml, fileName: envelope.fileName });
    await testInfo.attach(`relay-send${suffix}.txt`, {
        body: `file: ${envelope.fileName}\nsuccess: ${send.success}\nstatus: ${send.status}\n${send.body}`,
        contentType: 'text/plain',
    });
    return send;
}

/** Build, attach, push to `to`, attach the relay's answer. The caller asserts `send.success`. */
export async function buildAndSend(run: MintedRun, to: string, testInfo: TestInfo): Promise<{ envelope: EnvelopeView; send: SendResult }> {
    const envelope = buildScenarioEnvelope(run);
    return { envelope, send: await sendEnvelope(run, envelope, to, testInfo) };
}

function resolveExpectedCards(scenario: JourneyBScenario, office: OfficeFixture, recordReferences: string[]): ExpectedCard[] {
    const fields = new Map([
        [F.field.code, { office: office.field, name: F.field.name }],
        [F.field2.code, { office: office.field2, name: F.field2.name }],
    ]);
    const jobs = new Map([
        [F.job.code, { office: office.job, name: F.job.name }],
        [F.job2.code, { office: office.job2, name: F.job2.name }],
        [F.mealJob.code, { office: office.mealJob, name: F.mealJob.name }],
    ]);
    const ranches = new Map([[F.ranch.code, { office: office.ranch, name: F.ranch.name }]]);
    const employeeNames = new Map([...F.present, F.absentee, ...F.sticker, ...(scenario.extraEmployees ?? [])].map((e) => [e.code, e.name]));
    const bound = <V>(kind: string, map: Map<string, V>, code: string): V => {
        const hit = map.get(code);
        if (!hit) throw new Error(`${scenario.label}: ${kind} code '${code}' is not in the seeded fixture`);
        return hit;
    };
    return scenario.expected.cards.map((want) => {
        const employee = bound('employee', office.employees, want.employeeCode);
        const record = scenario.records[want.record];
        const field = want.fieldCode ? bound('field', fields, want.fieldCode) : undefined;
        const job = want.jobCode ? bound('job', jobs, want.jobCode) : undefined;
        const ranch = want.ranchCode ? bound('ranch', ranches, want.ranchCode) : undefined;
        // `null` in the scenario means "the office must store none" and travels as null.
        const contextId = (code: string | null | undefined, hit?: { office: { id: number } }) => (code === null ? null : hit?.office.id);
        return {
            employeeCode: want.employeeCode,
            employeeId: employee.id,
            reference: recordReferences[want.record],
            fieldId: contextId(want.fieldCode, field),
            jobId: contextId(want.jobCode, job),
            ...(want.ranchCode !== undefined ? { ranchId: contextId(want.ranchCode, ranch) } : {}),
            gps: record.gps,
            traceabilityCode: record.traceabilityCode,
            ...(want.panel ? { ranchName: F.ranch.name, fieldName: field?.name, jobName: job?.name, employeeName: employeeNames.get(want.employeeCode), crewName: F.crew.name } : {}),
        };
    });
}

// `scenario.questions` discovered-or-created by Name, then every answer row checked against the
// LIVE required response: an `unexpected` row must fall outside it, any other row inside — the rule
// unexpectedAnswer() used to derive answers from, now verified instead. No trimming: the flag
// detector compares the raw comma-separated list (clockout_answer_flag.go:129-139).
async function ensureQuestions(api: APIRequestContext, scenario: JourneyBScenario): Promise<Map<string, QuestionRecord>> {
    const live = new Map<string, QuestionRecord>();
    for (const spec of scenario.questions ?? []) live.set(spec.name, await ensureQuestion(api, spec));
    scenario.records.forEach((r, i) => {
        if (r.question === undefined) return;
        const question = live.get(r.question);
        if (!question) throw new Error(`${scenario.label}: records[${i}] answers '${r.question}', which is not in scenario.questions`);
        const satisfies = (question.requiredResponse ?? '').split(',').includes(r.response ?? '');
        if (r.unexpected && satisfies) {
            throw new Error(`${scenario.label}: records[${i}] is marked unexpected but '${r.response}' satisfies the live required response '${question.requiredResponse}' of '${r.question}'`);
        }
        if (!r.unexpected && !satisfies) {
            throw new Error(`${scenario.label}: records[${i}] answers '${r.response}' outside the live required response '${question.requiredResponse}' of '${r.question}' — mark it unexpected or fix the answer`);
        }
    });
    return live;
}

export interface ModuleGate {
    key: string;
    label: string;
    /** The live value `GET session/me` reports. */
    enabled: unknown;
}

/** What the environment must already be for the scenario to mean anything — read before anything is delivered. */
export interface JourneyBGates {
    /** One per `scenario.modules` entry, in declaration order. */
    modules: ModuleGate[];
    /** `GET preferences` verbatim when the scenario names a preference precondition, else null. */
    preferences: Record<string, unknown> | null;
    /** `preferences.undefinedEmployee` as a number — 0 when it is unset. */
    undefinedEmployeeId: number;
    /** The raw value, for the caller's remediation message. */
    undefinedEmployeeRaw: unknown;
    requireJobInEmpPieceOut: boolean;
}

const PREFERENCE_PRECONDITIONS = new Set(['undefinedEmployeeSet', 'requireJobInEmpPieceOut', 'stickerStartLocations']);

/**
 * The module flags and preferences the scenario declares. Modules are annotated, never failed here:
 * Piece Payment gates piece *payment*, not piece *capture*, and reads false on dev only because the
 * API reads PT_MODULES instead of TigerMaster (PET-12689). A spec that must fail on a gate calls this
 * itself and asserts — those assertions belong before the import, with their remediation prose.
 * {@link runJourneyBScenario} resolves the same gates when the spec does not pass them.
 */
export async function journeyBPreconditions(
    scenario: JourneyBScenario,
    opts: { sessionApi: APIRequestContext; testInfo: TestInfo },
): Promise<JourneyBGates> {
    const { sessionApi, testInfo } = opts;
    const modules: ModuleGate[] = [];
    if (scenario.modules?.length) {
        const meRes = await sessionApi.get('session/me');
        expect(meRes.ok(), `GET session/me failed with ${meRes.status()}`).toBe(true);
        const live = ((await meRes.json()) as { modules?: Record<string, unknown> }).modules ?? {};
        for (const wanted of scenario.modules) modules.push({ key: wanted.key, label: wanted.label, enabled: live[wanted.key] });
        testInfo.annotations.push({
            type: 'module-gate-asserted',
            description: `${modules.map((m) => `${m.label} → ${m.enabled}`).join(' · ')} (from PT_MODULES, not TigerMaster)`,
        });
        for (const [i, wanted] of scenario.modules.entries()) {
            if (wanted.noteWhenOff && !modules[i].enabled) testInfo.annotations.push({ type: 'environment-gate', description: wanted.noteWhenOff });
        }
    }
    if (!(scenario.preconditions ?? []).some((p) => PREFERENCE_PRECONDITIONS.has(p))) {
        return { modules, preferences: null, undefinedEmployeeId: 0, undefinedEmployeeRaw: undefined, requireJobInEmpPieceOut: false };
    }
    const preferences = await getPreferences(sessionApi);
    return {
        modules,
        preferences,
        undefinedEmployeeId: Number(preferences.undefinedEmployee),
        undefinedEmployeeRaw: preferences.undefinedEmployee,
        requireJobInEmpPieceOut: preferences.requireJobInEmpPieceOut === true,
    };
}

async function setStickerStartLocations(api: APIRequestContext, scenario: JourneyBScenario, gates: JourneyBGates, testInfo: TestInfo): Promise<void> {
    const { employeeCodeStartLocation, rollCodeStartLocation } = scenario.sticker!;
    const before = gates.preferences ?? {};
    await putPreferences(api, { employeeCodeStartLocation, rollCodeStartLocation });
    testInfo.annotations.push({
        type: 'preferences-arranged',
        description:
            `employeeCodeStartLocation ${String(before.employeeCodeStartLocation)} → ${employeeCodeStartLocation}, ` +
            `rollCodeStartLocation ${String(before.rollCodeStartLocation)} → ${rollCodeStartLocation}; ` +
            'both restored after the run. assignRollsDaily is never sent.',
    });
}

export interface JourneyBRunOptions {
    sessionApi: APIRequestContext;
    pages?: PageObjects;
    testInfo: TestInfo;
    gates?: JourneyBGates;
}

/** `hooks.beforeImport: codeHistorySnapshot` / `afterImport: codeHistoryDelta` — one row set per expected employee, before and after the import. */
export interface CodeHistoryBracket {
    employeeIds: number[];
    before: CodeHistoryRow[][];
    after: CodeHistoryRow[][];
}

/** `preconditions: ['crewNotifyUser']` — the user the fixture crew was pointed at, and the crew read back after the import. */
export interface CrewNotifyPrecondition {
    user: UserListItem;
    crew: CrewRecord;
}

/** One device's envelope and what became of it. */
export interface DeviceDelivery {
    id: string;
    envelope: EnvelopeView;
    send: SendResult;
    /** The import run this device's file was pulled into; null when no pull carried it. */
    runId: number | null;
    /** This device's own file in that run, when it was pulled. */
    file: ImportFileResult | null;
}

export interface JourneyBRun extends MintedRun {
    office: OfficeFixture;
    envelope: EnvelopeView;
    send: SendResult;
    /** `null` when the relay rejected the envelope — nothing was imported. */
    importRun: OfficeVerificationResult | null;
    cards: OfficeTimeCard[];
    expectedCards: ExpectedCard[];
    /** `null` unless the scenario names both code-history hooks. */
    codeHistory: CodeHistoryBracket | null;
    /** `null` unless the scenario names the crewNotifyUser precondition. */
    crewNotify: CrewNotifyPrecondition | null;
    /** One per envelope sent; a single-envelope scenario has exactly one. */
    deliveries: DeviceDelivery[];
    /** Per scenario record: its reference across every device ('' for a grid row). */
    recordReferences: string[];
    /** The fixture day as `YYYY-MM-DD` — the window every office read uses. */
    day: string;
    gates: JourneyBGates;
    label: string;
    testInfo: TestInfo;
    sessionApi: APIRequestContext;
    /** The scenario's `cleanup` steps, 'after' phase. Call it in the spec's `finally`. */
    cleanup(): Promise<void>;
}

export async function runJourneyBScenario(scenario: JourneyBScenario, opts: JourneyBRunOptions): Promise<JourneyBRun> {
    const { sessionApi, pages, testInfo } = opts;
    // The Internet pull drains the whole mailbox in one request — one import deadline beyond the project timeout.
    testInfo.setTimeout(journeyBTestTimeoutMs(testInfo));
    if (scenario.transport === 'relay-echo') throw new Error(`${scenario.label}: transport 'relay-echo' runs through runRelayEcho`);

    // The envelope references records by code and the importer's FKs are nullable, so
    // without this the import "succeeds" while linking nothing.
    const office = await seedOfficeFixture(sessionApi);
    for (const extra of scenario.extraEmployees ?? []) office.employees.set(extra.code, await ensureEmployee(sessionApi, extra));
    const gates = opts.gates ?? (await journeyBPreconditions(scenario, { sessionApi, testInfo }));
    // The configured fallback owner joins the employee map under its own name, so a scenario names
    // it exactly like a barcode — expected cards and the cleanup sweep both resolve it.
    if (gates.undefinedEmployeeId > 0) {
        office.employees.set(UNDEFINED_EMPLOYEE, { id: gates.undefinedEmployeeId, code: UNDEFINED_EMPLOYEE, name: UNDEFINED_EMPLOYEE, created: false });
    }
    await ensureQuestions(sessionApi, scenario);
    const run = mintRun(scenario, testInfo);
    const day = isoDay(run.punchDate);
    const snapshots = new Map<string, unknown>();
    let cards: OfficeTimeCard[] = [];
    const cleanup = () => runCleanup(run.scenario.cleanup, sessionApi, testInfo, { phase: 'after', office, cards, snapshots });

    // `restore` steps snapshot here — before any precondition changes what they guard.
    await runCleanup(run.scenario.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots });
    const notifyUser = run.scenario.preconditions?.includes('crewNotifyUser') ? await findNotifiableUser(sessionApi) : null;
    if (notifyUser) await setCrewNotifyUser(sessionApi, office.crew.id, notifyUser.usersCounter);
    if (run.scenario.preconditions?.includes('stickerStartLocations')) await setStickerStartLocations(sessionApi, run.scenario, gates, testInfo);

    const built = buildScenarioEnvelopes(run);
    const recordReferences = run.scenario.records.map(() => '');
    for (const device of built) {
        device.recordIndexes.forEach((globalIndex, i) => {
            recordReferences[globalIndex] = device.envelope.recordReferences[i];
        });
    }
    const expectedCards = resolveExpectedCards(run.scenario, office, recordReferences);
    const base = { ...run, office, envelope: built[0].envelope, gates, day, recordReferences, label: run.scenario.label, testInfo, sessionApi, cleanup };
    const absentEmployeeIds = (run.scenario.absentEmployees ?? []).map((code) => {
        const hit = office.employees.get(code);
        if (!hit) throw new Error(`${run.scenario.label}: absent employee code '${code}' is not seeded`);
        return hit.id;
    });

    let deliveries: DeviceDelivery[];
    let importRun: OfficeVerificationResult | null = null;
    let before: CodeHistoryRow[][] | null = null;
    let after: CodeHistoryRow[][] | null = null;
    const hookEmployeeIds = [...new Set(expectedCards.map((c) => c.employeeId))];
    const codeHistorySnapshot = () => Promise.all(hookEmployeeIds.map((id) => getCodeHistory(sessionApi, id)));

    if (run.scenario.verification === 'none') {
        // Every device in turn — one sync must land before the next, or the code-history grid and the
        // piece-outs race inside a single import and the reconciliation fails on processing order alone.
        // One deadline for the whole flow: both pulls and the reference poll share it.
        const deadline = newImportDeadline();
        annotateIfImportCircuitOpen(testInfo);
        deliveries = [];
        for (const device of built) {
            const send = await sendEnvelope(run, device.envelope, relayConfig().office, testInfo, `-${device.id}`);
            expect(send.success, `relay rejected the ${device.id} export: ${send.body}`).toBe(true);
            const { pull, run: pulledRun } = await pullFromRelayInternet(sessionApi, { deadline, testInfo });
            await testInfo.attach(`import-run-${device.id}.json`, { body: JSON.stringify({ pull, run: pulledRun }, null, 2), contentType: 'application/json' });
            expect(['ok', 'no-data'], `relay pull could not run for ${device.id}: ${pull.status} ${pull.message}`).toContain(pull.status);
            // Our file only, never the run: one office mailbox is shared by every worker, so a pull
            // routinely drains sibling specs' envelopes too. An absent file means a peer's pull took
            // it; the reference poll still proves ownership, exactly as importViaInternetUi does.
            const file = pulledRun?.files?.find((f) => String((f as { filename?: string }).filename ?? '') === device.envelope.fileName) ?? null;
            if (!file) {
                testInfo.annotations.push({
                    type: 'peer-drained',
                    description:
                        `${device.envelope.fileName} (${device.id}) was not in run ${pulledRun?.runId ?? 'n/a'} - a parallel ` +
                        'worker pull drained it into that run instead.',
                });
            }
            deliveries.push({ id: device.id, envelope: device.envelope, send, runId: pulledRun?.runId ?? null, file });
        }
        const references = built.flatMap((d) => d.envelope.references);
        cards = await findByReferences(sessionApi, references, {
            from: day,
            to: day,
            cardType: run.scenario.cardType ?? undefined,
            deadline,
            testInfo,
        });
        await testInfo.attach(`time-cards-${run.scenario.label}.json`, { body: JSON.stringify(cards, null, 2), contentType: 'application/json' });
    } else {
        const send = await sendEnvelope(run, built[0].envelope, relayConfig().office, testInfo);
        deliveries = [{ id: built[0].id, envelope: built[0].envelope, send, runId: null, file: null }];
        if (!send.success) {
            return { ...base, deliveries, send, importRun: null, cards, expectedCards: [], codeHistory: null, crewNotify: null };
        }
        if (!pages && (run.scenario.verification === 'office-ui' || (run.scenario.transport === 'relay-ui' && process.env.IMPORT_TRANSPORT !== 'single-folder'))) {
            throw new Error(`${run.scenario.label}: this scenario drives the office UI — destructure { pages } in the spec`);
        }
        before = run.scenario.hooks?.beforeImport === 'codeHistorySnapshot' ? await codeHistorySnapshot() : null;
        importRun = await deliverAndVerifyCards({
            sessionApi,
            pages,
            testInfo,
            xml: built[0].envelope.xml,
            fileName: built[0].envelope.fileName,
            label: run.scenario.label,
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            expected: expectedCards,
            absentEmployeeIds,
            punchDate: run.punchDate,
            ...(run.scenario.cardType !== undefined ? { cardType: run.scenario.cardType } : {}),
            ...(run.scenario.transport === 'single-folder' ? { via: 'single-folder' as const } : {}),
            // The scenario's `timeCards` step already swept the fixture day — one live cleanup path.
            sweep: false,
        });
        cards = importRun.cards;
        after = run.scenario.hooks?.afterImport === 'codeHistoryDelta' ? await codeHistorySnapshot() : null;
    }

    const codeHistory = before && after ? { employeeIds: hookEmployeeIds, before, after } : null;
    const crewNotify = notifyUser ? { user: notifyUser, crew: await getCrew(sessionApi, office.crew.id) } : null;
    // Named gates: what the workflow proves it does NOT assert, recorded on every run that imported.
    for (const gate of run.scenario.annotations ?? []) {
        const { whenDeviceFileMatches, ...annotation } = gate;
        if (whenDeviceFileMatches) {
            const delivery = deliveries.find((d) => d.id === whenDeviceFileMatches.device);
            if (!delivery?.file || !new RegExp(whenDeviceFileMatches.pattern).test(JSON.stringify(delivery.file))) continue;
        }
        testInfo.annotations.push(annotation);
    }
    return { ...base, deliveries, send: deliveries[0].send, importRun, cards, expectedCards, codeHistory, crewNotify };
}
// (`JourneyBRun.send` keeps its meaning — the first envelope's relay answer — so b01–b04/b10–b12 are unchanged.)

export function assertExpectedCards(run: JourneyBRun, expected: ExpectedCardJson[]): void {
    const byReference = new Map(run.cards.map((c) => [String(c.reference ?? ''), c]));
    for (const want of expected) {
        const reference = run.recordReferences[want.record];
        const card = byReference.get(reference);
        expect(card, `no imported card for record ${want.record} (${reference}, employee ${want.employeeCode})`).toBeDefined();
        expect(card!.employeeCounter, `record ${want.record} must bind to employee ${want.employeeCode}`).toBe(
            run.office.employees.get(want.employeeCode)!.id,
        );
        if (want.cardType !== undefined) expect(Number(card!.cardType), `cardType of record ${want.record}`).toBe(want.cardType);
        if (want.employeeSourceText !== undefined) {
            expect(String(card!.employeeSourceText ?? ''), `employee source of record ${want.record}`).toBe(want.employeeSourceText);
        }
        if (want.pieces !== undefined) expect(Number(card!.numOfPieces ?? 0), `pieces of record ${want.record}`).toBe(want.pieces);
        if (want.memoPattern !== undefined) expect(String(card!.memo ?? ''), `memo of record ${want.record}`).toMatch(new RegExp(want.memoPattern, 'i'));
    }
}

/** One imported record: the office card, the scenario's expectation as written, and the same expectation bound to office ids. */
export interface ImportedRecord {
    index: number;
    card: OfficeTimeCard;
    expected: ExpectedCardJson;
    bound: ExpectedCard;
}

export function cardOf(run: JourneyBRun, index: number): ImportedRecord {
    const reference = run.recordReferences[index] ?? '';
    const card = run.cards.find((c) => String(c.reference ?? '') === reference);
    const expected = run.scenario.expected.cards.find((c) => c.record === index);
    const bound = run.expectedCards.find((c) => c.reference === reference);
    if (!reference || !card || !expected || !bound) {
        throw new Error(`${run.label}: record ${index} (${reference || 'no reference'}) has no imported card or no expected card`);
    }
    return { index, card, expected, bound };
}

export interface AnswerRow {
    questionName: string;
    response: string;
    unexpected: boolean;
}

/** The answer rows the scenario attaches to card record `record`, in document order. */
export function answersOf(scenario: JourneyBScenario, record: number): AnswerRow[] {
    return scenario.records
        .filter((r) => r.parentRecord === record)
        .map((r) => ({ questionName: r.question!, response: r.response ?? '', unexpected: r.unexpected === true }));
}

/** The import lands the card before its answer rows; a read straight after the reference poll saw 2 of 3 (2026-09-14). */
export const ANSWER_ROWS_SETTLE_MS = 30_000;

/** The Time Out detail of record `index` — the only route that hydrates the imported answers and signature. */
export function timeOutDetailOf(run: JourneyBRun, index: number): Promise<OfficeTimeOutDetail> {
    return getTimeOutDetail(run.sessionApi, cardOf(run, index).card.timeCardCounter);
}

/** The code-history rows an employee carries — B7 reads them back after the import. */
export function codeHistoryOf(run: JourneyBRun, employeeCode: string): Promise<CodeHistoryRow[]> {
    const id = run.office.employees.get(employeeCode)?.id;
    if (id === undefined) throw new Error(`${run.label}: employee code '${employeeCode}' is not in the seeded office fixture`);
    return getCodeHistory(run.sessionApi, id);
}

/** Office cards of one type the fixture day holds for an employee — B6's WEBPET-1409 synthesis guard. */
export async function cardsForEmployee(run: JourneyBRun, employeeCode: string, cardType: number): Promise<OfficeTimeCard[]> {
    const id = run.office.employees.get(employeeCode)?.id;
    if (id === undefined) throw new Error(`${run.label}: employee code '${employeeCode}' is not in the seeded office fixture`);
    const cards = await listTimeCards(run.sessionApi, { from: run.day, to: run.day, cardType });
    return cards.filter((c) => Number(c.employeeCounter) === id);
}

/** The Transfer analyze payload for the run's fixture day — the exceptions, and the body for the caller's message. */
export async function analyzeTransferExceptions(run: JourneyBRun): Promise<AnalyzeResult> {
    const analyze = await analyzeTransfer(run.sessionApi, { from: run.day, to: run.day });
    expect(analyze.ok, `POST transfer-to-job-cards/analyze failed with ${analyze.status}`).toBe(true);
    await testInfoAttach(run, `transfer-to-job-cards-analyze-${run.label}.json`, analyze.raw);
    return analyze;
}

function testInfoAttach(run: JourneyBRun, name: string, body: unknown): Promise<void> {
    return run.testInfo.attach(name, { body: JSON.stringify(body, null, 2), contentType: 'application/json' });
}

/** The Transfer grid row for record `index`, or `null` when the analyze flag is off (annotated). */
export async function openTransferGridRow(pages: PageObjects, run: JourneyBRun, index: number): Promise<Locator | null> {
    return transferGridRowFor({ pages, testInfo: run.testInfo, cards: run.cards, card: cardOf(run, index).card, punchDate: run.punchDate, label: run.label });
}

export type { AnalyzeException };

export async function assertTransferGrid(pages: PageObjects, run: JourneyBRun, grid: GridExpectation): Promise<TransferGridResult> {
    if (!run.importRun) throw new Error(`${run.label}: nothing was imported — the relay answered: ${run.send.body}`);
    return assertTransferGridScreen({
        pages,
        testInfo: run.testInfo,
        cards: run.cards,
        expected: run.expectedCards,
        transport: run.importRun.transport,
        punchDate: run.punchDate,
        label: run.label,
        grid,
    });
}

export interface RelayEchoRun extends MintedRun {
    relay: RelayConfig;
    envelope: EnvelopeView;
    /** `null` when DEVICE_RELAY_URL is unset — the spec's own assertion names it. */
    send: SendResult | null;
    /** `null` when nothing was queued or the push failed. */
    pulled: PulledMessage | null;
    /** Acknowledges the pulled message so nothing accumulates on the relay. */
    cleanup(): Promise<void>;
}

/** B1-002: push into the scratch mailbox and pull straight back. Drains first, acks in cleanup(). Never the office queue. */
export async function runRelayEcho(scenario: JourneyBScenario, opts: { testInfo: TestInfo }): Promise<RelayEchoRun> {
    const relay = relayConfig();
    const run = mintRun(scenario, opts.testInfo);
    const envelope = buildScenarioEnvelope(run);
    if (!relay.url) return { ...run, relay, envelope, send: null, pulled: null, cleanup: async () => undefined };

    // Anything left by an interrupted run would be pulled instead of ours.
    const cleared = await drainMailbox(relay.url, relay.smoke);
    if (cleared) console.log(`[relay] drained ${cleared} stale message(s) from ${relay.smoke}`);

    const send = await sendToRelay({ url: relay.url, from: run.deviceAddress, to: relay.smoke, xml: envelope.xml, fileName: envelope.fileName });
    const pulled = send.success ? await pullFromRelay(relay.url, relay.smoke) : null;
    await opts.testInfo.attach('relay-roundtrip.txt', {
        body:
            `mailbox: ${relay.smoke}\nfrom: ${run.deviceAddress}\nfile: ${envelope.fileName}\n` +
            `messageId: ${pulled?.messageId ?? 'none'}\nbytes: ${envelope.xml.length}`,
        contentType: 'text/plain',
    });
    return {
        ...run,
        relay,
        envelope,
        send,
        pulled,
        cleanup: async () => {
            if (pulled) await ackRetrieved(relay.url, relay.smoke, pulled.messageId);
        },
    };
}
