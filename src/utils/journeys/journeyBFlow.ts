import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import type { ImportLogRow } from '@pages/connectivity/ImportLogPage';
import type { TransferRowView } from '@pages/processing/TransferToJobCardsPage';
import type { CodeHistoryRow } from '@pages/setup/EmployeePage';
import { relayConfig, type RelayConfig } from '@config/relay.config';
import { B9_PAID_BREAK, JOURNEY_B_FIXTURE as F, punchDay } from '@data/journey-b/fixture';
import { UNDEFINED_EMPLOYEE, type JourneyBScenario } from '@data/schemas/journeyBScenario';
import {
    annotateIfImportCircuitOpen,
    journeyBTestTimeoutMs,
    newImportDeadline,
    type ImportFileResult,
} from '@utils/api/connectivityImportApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import {
    assertTransferGrid as assertTransferGridScreen,
    deliverAndVerifyCards,
    pullFromRelayInternetUi,
    type ExpectedCard,
    type OfficeVerificationResult,
    type TransferGridResult,
} from '@utils/api/officeVerification';
import { getPreferences } from '@utils/api/preferencesApi';
import { ensureQuestion, type QuestionRecord } from '@utils/api/questionsApi';
import { ensureEmployee } from '@utils/api/setupEntitiesApi';
import { ensureCrewOnScreen, ensureJobOnScreen, type OnScreenDeps } from '@utils/fixtureRows/ensureOnScreen';
import { findByReferences, isoDay, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { findNotifiableUser, type UserListItem } from '@utils/api/usersApi';
import { runCleanup, type CleanupContext } from '@utils/cleanup/runCleanup';
import { currentScope, type CleanupScope } from '@utils/cleanup/cleanupScope';
import { substituteTokens } from '@utils/data/scenarioLoader';
import { withPreferencesLock } from '@utils/sync/preferencesLock';
import { previewClock, type PreviewClock } from '@utils/journeys/transferPreview';
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
// workflows (b07) import through relay-internet and never open the office UI.

// B9 adds its own crew and jobs on screen and the lock wait, so its test budget is larger.
const B9_EXTRA_TIMEOUT_MS = 300_000;
const CREW_NAMES = new Map([
    [F.crew.code, F.crew.name],
    [B9_PAID_BREAK.crew.code, B9_PAID_BREAK.crew.name],
]);

function crewNameOf(code: string | undefined): string | null {
    return code ? (CREW_NAMES.get(code) ?? F.crew.name) : null;
}

function crewIdOf(office: OfficeFixture, code: string | undefined): number {
    return office.b9 && code === B9_PAID_BREAK.crew.code ? office.b9.crew.id : office.crew.id;
}

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
    /** `testInfo.retry`. Every attempt mints its own reference prefix AND its own codes. */
    attempt: number;
    punchDate: Date;
    deviceAddress: string;
    fileName: string;
}

export function mintCodes(codes: JourneyBScenario['codes'], attempt = 0): string[] {
    const parts = codes?.parts ?? codes?.suffixes?.map((suffix) => ({ prefix: codes.prefix, suffix }));
    if (!codes || !parts?.length) return [];
    // From the lineage, not the clock. `attempt` is folded in unconditionally: B4 and B5
    // write these into EmployeeCodeHistory, which has no DELETE endpoint, so a retry that
    // reused attempt 1's codes would stack a second permanent row on the same employee.
    // `length` is guaranteed by the schema's superRefine for the digit basis.
    const base =
        codes.basis === 'prefix' ? lineagePrefix(codes.salt, attempt) : lineageDigits(codes.length!, codes.salt, attempt);
    return parts.map((part) => `${part.prefix ?? codes.prefix ?? ''}${base}${part.suffix ?? ''}`);
}

/** Prefix, minted codes, fixture day, device address, file name — and `{prefix}` / `{code<i>}` / `{constant}` substituted into every string of the scenario. */
export function mintRun(scenario: JourneyBScenario, testInfo?: TestInfo): MintedRun {
    const attempt = testInfo?.retry ?? 0;
    const prefix = lineagePrefix(scenario.codes?.salt ?? '', attempt);
    const codes = mintCodes(scenario.codes, attempt);
    const tokens = { ...(scenario.constants ?? {}), prefix, ...Object.fromEntries(codes.map((code, i) => [`code${i}`, code])) };
    return {
        scenario: substituteTokens(scenario, tokens),
        prefix,
        codes,
        attempt,
        punchDate: punchDay(scenario.dayOffset),
        deviceAddress: relayConfig().from,
        fileName: exportFileName(prefix, undefined, scenario.deviceFamily),
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
            deviceFamily: scenario.deviceFamily,
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
    return envelopeView(built.xml, built.references, exportFileName(prefix, undefined, scenario.deviceFamily), prefix, recordReferences);
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
            lineagePrefix(device.salt, run.attempt),
            scenario.records.flatMap((r, i) => (r.device === device.id ? [i] : [])),
        ),
    }));
}

/** Every prefix any attempt 0..`attempt` could have minted for this scenario, so the import wait still recognises a late earlier-attempt envelope as ours — without reusing its (attempt-scoped, soft-deleted-but-reserved) rows. */
export function lineagePrefixesThroughAttempt(scenario: JourneyBScenario, attempt: number): string[] {
    const prefixes: string[] = [];
    for (let a = 0; a <= attempt; a += 1) {
        prefixes.push(lineagePrefix(scenario.codes?.salt ?? '', a));
        for (const device of scenario.devices ?? []) prefixes.push(lineagePrefix(device.salt, a));
    }
    return prefixes;
}

/** Attach the envelope, push it to `to`, attach the relay's answer. The caller asserts `send.success`. */
export async function sendEnvelope(run: Pick<MintedRun, 'deviceAddress'>, envelope: EnvelopeView, to: string, testInfo: TestInfo, suffix = ''): Promise<SendResult> {
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
    const jobs = new Map<string, { office: { id: number }; name: string }>([
        [F.job.code, { office: office.job, name: F.job.name }],
        [F.job2.code, { office: office.job2, name: F.job2.name }],
        [F.mealJob.code, { office: office.mealJob, name: F.mealJob.name }],
    ]);
    if (office.pieceJob) jobs.set(F.pieceJob.code, { office: office.pieceJob, name: F.pieceJob.name });
    if (office.b9) {
        jobs.set(B9_PAID_BREAK.workJob.code, { office: office.b9.workJob, name: B9_PAID_BREAK.workJob.name });
        jobs.set(B9_PAID_BREAK.breakJob.code, { office: office.b9.breakJob, name: B9_PAID_BREAK.breakJob.name });
    }
    const ranches = new Map([[F.ranch.code, { office: office.ranch, name: F.ranch.name }]]);
    const employeeNames = new Map([...F.present, F.absentee, ...F.sticker, ...(scenario.extraEmployees ?? [])].map((e) => [e.code, e.name]));
    const bound = <V>(kind: string, map: Map<string, V>, code: string): V => {
        const hit = map.get(code);
        if (!hit) throw new Error(`${scenario.label}: ${kind} code '${code}' is not in the seeded fixture`);
        return hit;
    };
    return scenario.expected.cards.map((want) => {
        const employee = want.employeeCode === null ? null : bound('employee', office.employees, want.employeeCode);
        const field = want.fieldCode ? bound('field', fields, want.fieldCode) : undefined;
        const job = want.jobCode ? bound('job', jobs, want.jobCode) : undefined;
        const ranch = want.ranchCode ? bound('ranch', ranches, want.ranchCode) : undefined;
        // `null` in the scenario means "the card carries none": the grid cell must be blank. Omitted skips the cell.
        const nameOf = (code: string | null | undefined, hit?: { name: string }) => (code === null ? null : hit?.name);
        const ranchName = want.ranchCode === null ? null : ranch ? ranch.name : field || job ? F.ranch.name : undefined;
        const employeeName =
            want.employeeCode === null
                ? null
                : want.employeeCode === UNDEFINED_EMPLOYEE
                  ? UNDEFINED_EMPLOYEE_NAME
                  : employeeNames.get(want.employeeCode);
        return {
            employeeCode: want.employeeCode,
            reference: recordReferences[want.record],
            typeText: want.typeText,
            employeeName,
            // A record the device sends with no crew code (B7's device B) imports with no crew: its cell must be blank.
            crewName: crewNameOf(scenario.records[want.record]?.crewCode),
            ranchName,
            fieldName: nameOf(want.fieldCode, field),
            jobName: nameOf(want.jobCode, job),
            ...(want.panel ? { panel: true } : {}),
            officeIds: {
                employeeId: employee?.id ?? null,
                fieldId: want.fieldCode === null ? null : field?.office.id,
                jobId: want.jobCode === null ? null : job?.office.id,
            },
        };
    });
}

// The Undefined Employee's display name is not measured on dev (WEBPET-2843 leaves it unset); 1b confirms it live.
const UNDEFINED_EMPLOYEE_NAME = 'Undefined Employee';

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
    /** Live `minimumNumberOfPieces` / `maximumNumberOfPieces` — read only when the scenario names 'pieceLimits', else null. */
    pieceLimits: { minimum: number; maximum: number } | null;
}

const PREFERENCE_PRECONDITIONS = new Set(['undefinedEmployeeSet', 'requireJobInEmpPieceOut', 'stickerStartLocations', 'pieceLimits']);

// Read, never written: the crew-total split depends on these, and a moved value should fail by name, not as a wrong share.
function readPieceLimits(scenario: JourneyBScenario, preferences: Record<string, unknown>, testInfo: TestInfo): JourneyBGates['pieceLimits'] {
    if (!scenario.preconditions?.includes('pieceLimits')) return null;
    testInfo.annotations.push({
        type: 'preferences-read',
        description:
            `pieceOutIncludesOnlyTimeInEmployees=${String(preferences.pieceOutIncludesOnlyTimeInEmployees)}, ` +
            `distributeCrewPiecesByHours=${String(preferences.distributeCrewPiecesByHours)}, ` +
            `minimumNumberOfPieces=${String(preferences.minimumNumberOfPieces)}, maximumNumberOfPieces=${String(preferences.maximumNumberOfPieces)} (read, never written)`,
    });
    return { minimum: Number(preferences.minimumNumberOfPieces), maximum: Number(preferences.maximumNumberOfPieces) };
}

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
        return { modules, preferences: null, undefinedEmployeeId: 0, undefinedEmployeeRaw: undefined, requireJobInEmpPieceOut: false, pieceLimits: null };
    }
    const preferences = await getPreferences(sessionApi);
    return {
        modules,
        preferences,
        undefinedEmployeeId: Number(preferences.undefinedEmployee),
        undefinedEmployeeRaw: preferences.undefinedEmployee,
        requireJobInEmpPieceOut: preferences.requireJobInEmpPieceOut === true,
        pieceLimits: readPieceLimits(scenario, preferences, testInfo),
    };
}

// Set on Preferences ▸ Traceability - Stickers. A value the screen already shows is left alone, so a
// repeat run saves nothing; the screen, reopened, is the proof either way.
async function setStickerStartLocations(
    pages: PageObjects,
    scenario: JourneyBScenario,
    gates: JourneyBGates,
    testInfo: TestInfo,
): Promise<void> {
    const { employeeCodeStartLocation, rollCodeStartLocation } = scenario.sticker!;
    const want = { employeeCodeStartLocation, rollCodeStartLocation };
    const before = gates.preferences ?? {};
    const saved = await withPreferencesLock(async () => {
        const prefs = pages.preferences;
        await prefs.gotoPreferences();
        await prefs.gotoSection('Traceability - Stickers');
        for (const [key, value] of Object.entries(want)) {
            if ((await prefs.displayedValue(key)) !== String(value)) await prefs.setValue(key, value);
        }
        const status = await prefs.saveIfDirty();
        // Reopened from the menu (a fresh load), so the value read is the stored one, not the one just typed.
        await prefs.gotoPreferences();
        await prefs.gotoSection('Traceability - Stickers');
        for (const [key, value] of Object.entries(want)) {
            expect(await prefs.displayedValue(key), `${scenario.label}: Preferences ▸ Traceability - Stickers must show ${key} after the save`).toBe(String(value));
        }
        return status !== null;
    });
    testInfo.annotations.push({
        type: 'preferences-arranged',
        description:
            `employeeCodeStartLocation ${String(before.employeeCodeStartLocation)} → ${employeeCodeStartLocation}, ` +
            `rollCodeStartLocation ${String(before.rollCodeStartLocation)} → ${rollCodeStartLocation}` +
            `${saved ? '' : ' (already set, nothing saved)'}; both restored after the run. assignRollsDaily is never sent.`,
    });
}

async function ensureB9RowsOnScreen(deps: OnScreenDeps): Promise<NonNullable<OfficeFixture['b9']>> {
    const B = B9_PAID_BREAK;
    const jobSpec = (j: typeof B.workJob) => ({ code: j.code, name: j.name, paymentType: j.paymentType, hourlyRate: j.hourlyRate });
    // The crew first, then its two jobs.
    const crew = await ensureCrewOnScreen(B.crew, deps);
    return { crew, workJob: await ensureJobOnScreen(jobSpec(B.workJob), deps), breakJob: await ensureJobOnScreen(jobSpec(B.breakJob), deps) };
}

// The crew's break rule set on Setup ▸ Crew, reopened from the menu and read back; then the window and
// auto-return gates, read and never written. Part A's gate (Create Break Card) is D10's measured config.
async function arrangeB9CrewRule(
    pages: PageObjects,
    sessionApi: APIRequestContext,
    scenario: JourneyBScenario,
    b9: NonNullable<OfficeFixture['b9']>,
    testInfo: TestInfo,
): Promise<void> {
    const rule = scenario.paidBreak!.crewRule;
    await pages.crew.gotoEditById(b9.crew.id, b9.crew.name);
    await pages.crew.setBreakAutomation({
        includeInTransfer: rule.includeInTransfer,
        timeEmployeesIncluded: rule.timeEmployeesIncluded,
        exerciseJob: null,
        createBreakCardFromTimeIn: rule.createBreakCardFromTimeIn,
        autoPaidBreakType: rule.autoPaidBreakType,
        autoReturnFromBreak: rule.autoReturnFromBreak,
        breakLengths: String(rule.breakLengthMinutes),
    });
    await pages.crew.gotoEditById(b9.crew.id, b9.crew.name);
    const form = await pages.crew.readCrewForm();
    expect(
        {
            createBreakCardFromTimeIn: (await pages.crew.createBreakCardSelect.innerText()).trim(),
            autoReturnFromBreak: form.autoReturnFromBreak,
            autoPaidBreakType: form.autoPaidBreakType,
            breakLengths: form.breakLengths,
            exerciseJob: form.exerciseJob,
        },
        `${scenario.label}: Setup ▸ Crew ▸ Break & Automation must show the rule after the save`,
    ).toEqual({
        createBreakCardFromTimeIn: rule.createBreakCardFromTimeIn,
        autoReturnFromBreak: rule.autoReturnFromBreak,
        autoPaidBreakType: rule.autoPaidBreakType,
        breakLengths: String(rule.breakLengthMinutes),
        exerciseJob: '',
    });

    const preferences = await getPreferences(sessionApi);
    if (!(Number(preferences.maximumDaysForTransferExport) >= Math.abs(scenario.dayOffset))) {
        throw new Error(`${scenario.label}: maximumDaysForTransferExport=${String(preferences.maximumDaysForTransferExport)} is below the fixture day ${scenario.dayOffset}.`);
    }
    const autoReturn = preferences.requireReturnFromBreakTimeIn;
    if (typeof autoReturn === 'string' && !/^FromPaidBreak/.test(autoReturn)) {
        throw new Error(`${scenario.label}: requireReturnFromBreakTimeIn=${autoReturn} does not return a worker from a paid break.`);
    }
    for (const key of ['paidBreakJob', 'requireReturnFromBreakTimeIn', 'defaultPaidBreakLength']) {
        testInfo.annotations.push({ type: 'preference-evidence', description: `${key}=${String(preferences[key])}` });
    }
}

export interface JourneyBRunOptions {
    sessionApi: APIRequestContext;
    pages?: PageObjects;
    testInfo: TestInfo;
    gates?: JourneyBGates;
    /** Override the ambient scope — for tests/tools, which run outside the fixture. */
    scope?: CleanupScope;
}

/** `hooks.beforeImport: codeHistorySnapshot` / `afterImport: codeHistoryDelta` — one row set per expected employee, before and after the import. */
export interface CodeHistoryBracket {
    employeeIds: number[];
    before: CodeHistoryRow[][];
    after: CodeHistoryRow[][];
}

/** `preconditions: ['crewNotifyUser']` — the user the fixture crew was pointed at, and the Notify User the crew form shows after the import. */
export interface CrewNotifyPrecondition {
    user: UserListItem;
    shown: string;
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
    /** The Transfer-grid rows {@link assertImportedRows} read, by reference — what {@link cardOf} hands back. */
    rows: Map<string, TransferRowView>;
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
    /** The scenario's `cleanup` steps, 'after' phase. The scope runs it in teardown; call it only to clean up early. */
    cleanup(): Promise<void>;
}

export async function runJourneyBScenario(scenario: JourneyBScenario, opts: JourneyBRunOptions): Promise<JourneyBRun> {
    const { sessionApi, pages, testInfo } = opts;
    // The Internet pull drains the whole mailbox in one request — one import deadline beyond the project timeout.
    testInfo.setTimeout(journeyBTestTimeoutMs(testInfo) + (scenario.fixtureRowsOnScreen?.includes('b9') ? B9_EXTRA_TIMEOUT_MS : 0));
    if (scenario.transport === 'relay-echo') throw new Error(`${scenario.label}: transport 'relay-echo' runs through runRelayEcho`);

    // Minted and registered BEFORE anything is created. `mintRun` is pure over
    // (scenario, testInfo), and `ctx` is mutable, so whatever has been filled in by
    // the time a seed step throws is exactly what teardown sees.
    const run = mintRun(scenario, testInfo);
    const ctx: CleanupContext = { phase: 'after', snapshots: new Map<string, unknown>(), cards: [] };
    const cleanupSteps = run.scenario.cleanup;
    const scope = opts.scope ?? currentScope(testInfo);
    ctx.ui = scope?.ui;
    const registration = scope?.add(`${run.scenario.label} cleanup`, (api) => runCleanup(cleanupSteps, api, testInfo, ctx));
    const cleanup = async (): Promise<void> => {
        await runCleanup(cleanupSteps, sessionApi, testInfo, ctx);
        registration?.complete();
    };

    // The envelope references records by code and the importer's FKs are nullable, so
    // without this the import "succeeds" while linking nothing.
    const office = await seedOfficeFixture(sessionApi);
    ctx.office = office;
    for (const extra of scenario.extraEmployees ?? []) office.employees.set(extra.code, await ensureEmployee(sessionApi, extra));
    if (scenario.fixtureRowsOnScreen?.includes('pieceJob')) {
        if (!pages) throw new Error(`${scenario.label}: fixtureRowsOnScreen drives the New Job form — destructure { pages } in the spec`);
        office.pieceJob = await ensureJobOnScreen({ ...F.pieceJob }, { api: sessionApi, pages, testInfo });
    }
    if (scenario.fixtureRowsOnScreen?.includes('b9')) {
        if (!pages) throw new Error(`${scenario.label}: fixtureRowsOnScreen drives the New Crew and New Job forms — destructure { pages } in the spec`);
        office.b9 = await ensureB9RowsOnScreen({ api: sessionApi, pages, testInfo });
    }
    const gates = opts.gates ?? (await journeyBPreconditions(scenario, { sessionApi, testInfo }));
    // The configured fallback owner joins the employee map under its own name, so a scenario names
    // it exactly like a barcode — expected cards and the cleanup sweep both resolve it.
    if (gates.undefinedEmployeeId > 0) {
        office.employees.set(UNDEFINED_EMPLOYEE, { id: gates.undefinedEmployeeId, code: UNDEFINED_EMPLOYEE, name: UNDEFINED_EMPLOYEE, created: false });
    }
    await ensureQuestions(sessionApi, scenario);
    const day = isoDay(run.punchDate);
    const snapshots = ctx.snapshots!;
    let cards: OfficeTimeCard[] = [];

    // `restore` steps snapshot here — before any precondition changes what they guard.
    await runCleanup(cleanupSteps, sessionApi, testInfo, { phase: 'before', office, snapshots });
    const notifyUser = run.scenario.preconditions?.includes('crewNotifyUser') ? await findNotifiableUser(sessionApi) : null;
    if (notifyUser) {
        if (!pages) throw new Error(`${run.scenario.label}: the crew's Notify User is set on Setup ▸ Crew — destructure { pages } in the spec`);
        await pages.crew.gotoEditById(office.crew.id, office.crew.name);
        await pages.crew.setNotifyUser(notifyUser.name);
    }
    if (run.scenario.preconditions?.includes('stickerStartLocations')) {
        if (!pages) throw new Error(`${run.scenario.label}: the sticker start locations are set on Preferences — destructure { pages } in the spec`);
        await setStickerStartLocations(pages, run.scenario, gates, testInfo);
    }
    if (office.b9 && pages && run.scenario.paidBreak) await arrangeB9CrewRule(pages, sessionApi, run.scenario, office.b9, testInfo);

    const built = buildScenarioEnvelopes(run);
    const recordReferences = run.scenario.records.map(() => '');
    for (const device of built) {
        device.recordIndexes.forEach((globalIndex, i) => {
            recordReferences[globalIndex] = device.envelope.recordReferences[i];
        });
    }
    const expectedCards = resolveExpectedCards(run.scenario, office, recordReferences);
    const base = { ...run, office, envelope: built[0].envelope, gates, day, recordReferences, label: run.scenario.label, testInfo, sessionApi, cleanup, rows: new Map<string, TransferRowView>() };
    const absentEmployeeIds = (run.scenario.absentEmployees ?? []).map((code) => {
        const hit = office.employees.get(code);
        if (!hit) throw new Error(`${run.scenario.label}: absent employee code '${code}' is not seeded`);
        return hit.id;
    });

    let deliveries: DeviceDelivery[];
    let importRun: OfficeVerificationResult | null = null;
    let before: CodeHistoryRow[][] | null = null;
    let after: CodeHistoryRow[][] | null = null;
    const hookEmployees = new Map<number, string>();
    for (const c of expectedCards) {
        if (c.officeIds?.employeeId != null && c.employeeName) hookEmployees.set(c.officeIds.employeeId, c.employeeName);
    }
    const hookEmployeeIds = [...hookEmployees.keys()];
    // Each employee's Code Badge History as the Setup form shows it; the form is left without saving.
    const codeHistorySnapshot = async (): Promise<CodeHistoryRow[][]> => {
        if (!pages) throw new Error(`${run.scenario.label}: the code-history hooks read the Employee form — destructure { pages } in the spec`);
        const rows: CodeHistoryRow[][] = [];
        for (const [id, name] of hookEmployees) {
            await pages.employee.gotoEditById(id, name);
            rows.push(await pages.employee.readCodeHistory());
        }
        return rows;
    };

    if (run.scenario.verification === 'none') {
        if (!pages) throw new Error(`${run.scenario.label}: Trigger Import runs on Connectivity ▸ Import ▸ Internet — destructure { pages } in the spec`);
        // Every device in turn — one sync must land before the next, or the code-history grid and the
        // piece-outs race inside a single import and the reconciliation fails on processing order alone.
        // One deadline for the whole flow: both pulls and the reference poll share it.
        const deadline = newImportDeadline();
        annotateIfImportCircuitOpen(testInfo);
        deliveries = [];
        for (const device of built) {
            const send = await sendEnvelope(run, device.envelope, relayConfig().office, testInfo, `-${device.id}`);
            expect(send.success, `relay rejected the ${device.id} export: ${send.body}`).toBe(true);
            const { pull, run: pulledRun } = await pullFromRelayInternetUi(pages, sessionApi, { deadline, testInfo, label: device.id });
            await testInfo.attach(`import-run-${device.id}.json`, { body: JSON.stringify({ pull, run: pulledRun }, null, 2), contentType: 'application/json' });
            // A peer worker's drain still holding the lease (`warning` + `already-running`, WEBPET-2996)
            // ingests our envelope into its own run — the reference poll below still proves ownership.
            const peerDrain = pull.status === 'warning' && pull.reason === 'already-running';
            expect(
                ['ok', 'no-data'].includes(pull.status) || peerDrain,
                `relay pull could not run for ${device.id}: ${pull.status} ${pull.message}`,
            ).toBe(true);
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
        cards = ctx.cards = await findByReferences(sessionApi, references, {
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
        if (!pages && (run.scenario.verification === 'office-ui' || run.scenario.transport === 'relay-ui' || run.scenario.transport === 'single-folder-ui')) {
            throw new Error(`${run.scenario.label}: this scenario drives the office UI — destructure { pages } in the spec`);
        }
        before = run.scenario.hooks?.beforeImport === 'codeHistorySnapshot' ? await codeHistorySnapshot() : null;
        importRun = await deliverAndVerifyCards({
            sessionApi,
            pages,
            testInfo,
            xml: built[0].envelope.xml,
            fileName: built[0].envelope.fileName,
            lineagePrefixes: lineagePrefixesThroughAttempt(run.scenario, run.attempt),
            label: run.scenario.label,
            crewId: crewIdOf(office, run.scenario.records[0]?.crewCode),
            ranchId: office.ranch.id,
            expected: expectedCards,
            absentEmployeeIds,
            punchDate: run.punchDate,
            ...(run.scenario.cardType !== undefined ? { cardType: run.scenario.cardType } : {}),
            ...(run.scenario.transport === 'single-folder-ui' ? { via: 'single-folder-ui' as const } : {}),
            // The scenario's `timeCards` step already swept the fixture day — one live cleanup path.
            sweep: false,
        });
        cards = ctx.cards = importRun.cards;
        after = run.scenario.hooks?.afterImport === 'codeHistoryDelta' ? await codeHistorySnapshot() : null;
    }

    const codeHistory = before && after ? { employeeIds: hookEmployeeIds, before, after } : null;
    let crewNotify: CrewNotifyPrecondition | null = null;
    if (notifyUser && pages) {
        // The crew form reopened after the import: the user it shows is the stored one.
        await pages.crew.gotoEditById(office.crew.id, office.crew.name);
        await expect
            .poll(() => pages.crew.readNotifyUser(), { message: `${run.scenario.label}: the crew's Notify User never loaded`, timeout: 30_000 })
            .not.toBe('');
        crewNotify = { user: notifyUser, shown: await pages.crew.readNotifyUser() };
    }
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

const BLANK_CELLS = ['', '—'];

function expectCell(actual: string, want: string | null | undefined, what: string): void {
    if (want === undefined) return;
    if (want === null) expect(BLANK_CELLS, `${what} must be blank, the card carries none`).toContain(actual);
    else expect(actual, what).toContain(want);
}

/** The id the reference poll captured for a record — for cleanup and detail reads, never an assertion. */
function cardByRecord(run: JourneyBRun, index: number): OfficeTimeCard {
    const reference = run.recordReferences[index] ?? '';
    const card = run.cards.find((c) => String(c.reference ?? '') === reference);
    if (!reference || !card) throw new Error(`${run.label}: record ${index} (${reference || 'no reference'}) has no imported card`);
    return card;
}

/**
 * The import proved on Transfer to Job Cards: the crew-scoped candidate set equals this run's
 * references (set equality is the count and the absentee proof), then every expected card's cells
 * are compared with the fixture's display names. The rows are kept on `run.rows` for {@link cardOf}.
 */
export async function assertImportedRows(pages: PageObjects, run: JourneyBRun): Promise<void> {
    // verification 'none' (B7) imports through the API relay pull and has no importRun: its polled cards are the delivery proof.
    if (!run.importRun && run.scenario.verification !== 'none') throw new Error(`${run.label}: nothing was imported — the relay answered: ${run.send.body}`);
    const transfer = pages.transferToJobCards;
    await openCrewTransferCandidates(pages, run, { scopeAnalyze: run.scenario.paidBreak !== undefined });
    for (const [i, bound] of run.expectedCards.entries()) {
        const want = run.scenario.expected.cards[i];
        const record = run.scenario.records[want.record];
        const at = `record ${want.record} (${bound.reference})`;
        const row = await transfer.readRow(bound.reference);
        run.rows.set(bound.reference, row);

        expectCell(row.employee, bound.employeeName, `Employee of ${at}`);
        expectCell(row.crew, bound.crewName, `Crew of ${at}`);
        expectCell(row.ranch, bound.ranchName, `Ranch of ${at}`);
        expectCell(row.field, bound.fieldName, `Field of ${at}`);
        expectCell(row.job, bound.jobName, `Job of ${at}`);
        expect(row.type, `Type of ${at}`).toBe(bound.typeText);
        if (want.employeeSourceText !== undefined) expect(row.employeeSelection, `Employee Selection of ${at}`).toBe(want.employeeSourceText);
        // A Time In / Time Out lists no pieces, so `pieces: 0` in a scenario is not a cell to compare.
        if (want.pieces) expect(Number(row.pieces.replace(/,/g, '')), `Pieces of ${at}`).toBe(want.pieces);
        if (record.traceabilityCode) expect(row.traceability, `Traceability of ${at}`).toBe(record.traceabilityCode);
        // programCreated has no column. The import stamps it, and the grid marks a hand-edited row, so "not
        // manually edited" is its on-screen proxy.
        expect(row.manuallyEdited, `${at} should be an untouched imported row`).toBe(false);

        if (record.gps && (run.importRun?.transport ?? 'device-import') === 'device-import') {
            let gps: string | null = null;
            if (bound.typeText === 'Time In') {
                await transfer.openRow(cardByRecord(run, want.record).timeCardCounter);
                gps = (await transfer.readTimeInPanel()).gps;
                await transfer.cancelPanel();
            }
            if (gps === null) {
                run.testInfo.annotations.push({
                    type: 'gps-not-rendered-in-panel',
                    description:
                        `${at}: no screen shows the GPS fix the device sent (no grid column; the Time In panel field is module-gated ` +
                        'on dev, and a piece-out opens no such panel). The API read that used to prove it is retired.',
                });
            } else {
                expect(gps, `GPS Reading of ${at}`).toBe(record.gps);
            }
        }
    }
}

/**
 * The row's Date and Time cells as a minute-precision wall-clock stamp (`2026-10-13T07:00`). The device
 * sends wall time with no offset and the office stores it verbatim, so the screen shows the sent minute back.
 */
export function displayedStamp(row: TransferRowView): string {
    const date = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(row.date.trim());
    const time = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)$/i.exec(row.time.trim());
    if (!date || !time) throw new Error(`Transfer row ${row.reference} shows date '${row.date}' and time '${row.time}', not "M/D/YY[YY]" and "h:mm[:ss] AM"`);
    const two = (n: string | number) => String(n).padStart(2, '0');
    const year = date[3].length === 2 ? 2000 + Number(date[3]) : Number(date[3]);
    const hour = (Number(time[1]) % 12) + (time[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${year}-${two(date[1])}-${two(date[2])}T${two(hour)}:${time[2]}`;
}

/** One imported record: its Transfer-grid row, the scenario's expectation as written, and the same expectation bound to display names. */
export interface ImportedRecord {
    index: number;
    reference: string;
    /** From the reference poll — for cleanup and detail reads. */
    timeCardCounter: number;
    row: TransferRowView;
    expected: ExpectedCardJson;
    bound: ExpectedCard;
}

/** Needs {@link assertImportedRows} to have run first: the row is the one it read. */
export function cardOf(run: JourneyBRun, index: number): ImportedRecord {
    const reference = run.recordReferences[index] ?? '';
    const row = run.rows.get(reference);
    const expected = run.scenario.expected.cards.find((c) => c.record === index);
    const bound = run.expectedCards.find((c) => c.reference === reference);
    if (!reference || !row || !expected || !bound) {
        throw new Error(`${run.label}: record ${index} (${reference || 'no reference'}) has no Transfer row or no expected card — call assertImportedRows first`);
    }
    return { index, reference, timeCardCounter: cardByRecord(run, index).timeCardCounter, row, expected, bound };
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

/**
 * The Questions grid of record `index`'s Time Out panel on Transfer to Job Cards, left through Cancel.
 * Needs the grid open — call {@link assertImportedRows} first. The grid may print a question's name or
 * its text; either maps back to the scenario's name, and anything else is returned raw so a mismatch shows it.
 */
export async function timeOutAnswersOnScreen(
    pages: PageObjects,
    run: JourneyBRun,
    index: number,
): Promise<Array<{ questionName: string; response: string }>> {
    const transfer = pages.transferToJobCards;
    await transfer.openRow(cardByRecord(run, index).timeCardCounter, 'Time Out');
    try {
        const questions = run.scenario.questions ?? [];
        return (await transfer.readTimeOutQuestions()).map(({ question, response }) => ({
            questionName: questions.find((q) => q.name === question || q.questionText === question)?.name ?? question,
            response,
        }));
    } finally {
        await transfer.timeOutPanel.getByRole('button', { name: /^Cancel$/i }).click();
        await transfer.timeOutPanel.waitFor({ state: 'hidden', timeout: 15_000 });
    }
}

/** The Code Badge History rows an employee's Setup form shows — B7 reads them back after the import. The form is left without saving. */
export async function codeHistoryOf(pages: PageObjects, run: JourneyBRun, expectedCode: string | null): Promise<CodeHistoryRow[]> {
    if (expectedCode === null) throw new Error(`${run.label}: the expected card names no employee`);
    const id = run.office.employees.get(expectedCode)?.id;
    if (id === undefined) throw new Error(`${run.label}: employee code '${expectedCode}' is not in the seeded office fixture`);
    await pages.employee.gotoEditById(id, memberName(run, expectedCode));
    return pages.employee.readCodeHistory();
}

/** A card's Memo as View ▸ Time Cards' Edit sheet shows it, left through Cancel. */
export async function memoOnScreen(pages: PageObjects, run: JourneyBRun, reference: string): Promise<string> {
    const view = pages.viewTimeCards;
    await view.openFromMenu();
    await view.scopeToDay(run.day);
    await view.applyFilter();
    // The grid carries a Memo column, so the row itself is the proof; no sheet to open.
    return view.readCell(await view.rowByReference(reference), 'Memo');
}

/** The Internet Import Log row of one delivered file (Source Webmail) — its Status and Run, as the office reads them. */
export async function importLogRowFor(pages: PageObjects, delivery: DeviceDelivery): Promise<ImportLogRow> {
    const log = pages.importLog;
    await log.goto();
    await log.filterBySource('Webmail');
    await log.filterByFile(delivery.envelope.fileName);
    return log.readRow(delivery.envelope.fileName);
}

/**
 * The Employee cell of every View ▸ Job Cards row of `crewName` on `day`, plus the screen's own "shown" count.
 * The crew chip lists only crews that own a loaded row, so an empty day (or none for this crew) has nothing to pick and answers empty.
 */
export async function jobCardEmployeesOnScreen(
    pages: PageObjects,
    day: string,
    crewName: string,
): Promise<{ employees: string[]; shown: number }> {
    const view = pages.viewJobCards;
    await view.openFromMenu();
    await view.scopeToDay(day);
    await view.applyFilter();
    if ((await view.readCounts()).records.loaded === 0) return { employees: [], shown: 0 };
    // filterByCrew clicks the crew's option with no timeout, so a crew that owns no loaded row (B8, day -17: chip read "No results.")
    // hung until the 24 min test timeout. The grid's own rows answer that case first.
    if ((await view.rowsForCrew(crewName).count()) === 0) return { employees: [], shown: 0 };
    try {
        await view.filterByCrew(crewName);
    } catch (error) {
        if ((await view.rowsForCrew(crewName).count()) === 0) return { employees: [], shown: 0 };
        throw error;
    }
    const rows = view.rowsForCrew(crewName);
    const employees: string[] = [];
    for (let i = 0; i < (await rows.count()); i += 1) employees.push(await view.readCell(rows.nth(i), 'Employee'));
    return { employees, shown: (await view.readCounts()).records.shown };
}

/** An Issues-panel group's affected count by leading-text pattern; a missing group fails naming every group the panel did show. */
export async function issueGroupCount(pages: PageObjects, run: JourneyBRun, leadingPattern: string): Promise<number> {
    const transfer = pages.transferToJobCards;
    try {
        return await transfer.issueGroupAffectedCount(leadingPattern);
    } catch (error) {
        const seen = await transfer.issueGroupTexts().catch(() => [] as string[]);
        throw new Error(`${run.label}: no Issues group matches /^${leadingPattern}/; the panel showed ${JSON.stringify(seen)}. ${String(error)}`);
    }
}

export function memberName(run: JourneyBRun, code: string): string {
    const hit = [...F.present, F.absentee, ...F.sticker, ...(run.scenario.extraEmployees ?? [])].find((e) => e.code === code);
    if (!hit) throw new Error(`${run.label}: employee code '${code}' has no fixture name`);
    return hit.name;
}

/**
 * Transfer to Job Cards for the run's day, analyzed, then narrowed by the Work Crew column filter —
 * never an employee-level scope, which hides a crew piece-out row (WEBPET-2139). Throws, naming both
 * sets, unless the screen offers exactly this run's references. Never selects, never transfers.
 */
export async function openCrewTransferCandidates(pages: PageObjects, run: JourneyBRun, opts: { scopeAnalyze?: boolean } = {}): Promise<string[]> {
    const transfer = pages.transferToJobCards;
    const own = run.recordReferences.filter((r) => r !== '');
    const crewName = crewNameOf(run.scenario.records.find((r) => r.crewCode)?.crewCode) ?? F.crew.name;

    await transfer.openFromMenu();
    await transfer.scopeToDay(run.day);
    // Time Card Crew scopes the analyze itself; the Work Crew filter below only hides rows.
    if (opts.scopeAnalyze) await transfer.scopeToTimeCardCrew(crewName);
    await transfer.analyzeCandidates({ expected: own.length });
    // Rows imported for the Undefined Employee carry no fixture crew (device B ships no crew code), so the Work Crew
    // chip hides them (B7 saw 1 of 3). Those runs scope by the day alone and require every one of their references.
    const crewless = run.scenario.expected.cards.some((c) => c.employeeCode === UNDEFINED_EMPLOYEE);
    if (!crewless) await transfer.filterByCrew(crewName);
    // The filter re-renders asynchronously; a miss falls through to the guard below, which names both sets.
    await expect
        .poll(async () => [...(await transfer.candidateReferences())].sort(), { timeout: 30_000 })
        .toEqual(crewless ? expect.arrayContaining([...own].sort()) : [...own].sort())
        .catch(() => undefined);

    const candidates = await transfer.candidateReferences();
    const outsiders = crewless ? [] : candidates.filter((r) => !own.includes(r));
    const missing = own.filter((r) => !candidates.includes(r));
    if (crewless ? missing.length > 0 : candidates.length !== own.length || outsiders.length) {
        throw new Error(
            `${run.label}: the crew-scoped screen offered ${candidates.length} candidate(s) ${JSON.stringify(candidates)}` +
                (outsiders.length ? `, of which ${JSON.stringify(outsiders)} are not this run's` : '') +
                `. This run imported ${JSON.stringify(own)}.`,
        );
    }
    return crewless ? candidates.filter((r) => own.includes(r)) : candidates;
}

export interface PaidBreakPreview {
    /** The crew-scoped candidate references, roster-guarded against this run's own. */
    candidates: string[];
    /** The Job Cards preview as clock times, chronological. */
    segments: PreviewClock[];
    /** Every Issues group's text, read before the tab switch. */
    issueGroups: string[];
}

/**
 * B9: Transfer to Job Cards opened from the menu, scoped to the day and the Time Card Crew, analyzed, narrowed and
 * roster-guarded; nothing may block; then the Job Cards tab's pre-commit preview. Never selects, never transfers.
 */
export async function previewPaidBreakDay(pages: PageObjects, run: JourneyBRun): Promise<PaidBreakPreview> {
    const want = run.scenario.paidBreak;
    if (!want) throw new Error(`${run.label}: previewPaidBreakDay needs the scenario's paidBreak block`);
    const transfer = pages.transferToJobCards;
    const candidates = await openCrewTransferCandidates(pages, run, { scopeAnalyze: true });
    await expect.poll(() => transfer.blockingCount(), { message: `${run.label}: nothing may block the day` }).toBe(0);
    const issueGroups = await transfer.issueGroupTexts();
    await transfer.openJobCardsTab();
    await expect
        .poll(async () => (await transfer.previewSegments()).length, {
            message: `${run.label}: the preview must propose ${want.segments.length} job cards`,
            timeout: 60_000,
        })
        .toBe(want.segments.length);
    return { candidates, segments: previewClock(await transfer.previewSegments()), issueGroups };
}

export async function assertTransferGrid(pages: PageObjects, run: JourneyBRun, grid: GridExpectation): Promise<TransferGridResult> {
    if (!run.importRun) throw new Error(`${run.label}: nothing was imported — the relay answered: ${run.send.body}`);
    return assertTransferGridScreen({
        pages,
        testInfo: run.testInfo,
        cards: run.cards,
        expected: run.expectedCards,
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

/** B1: push into the scratch mailbox and pull straight back. Drains first, acks in cleanup(). Never the office queue. */
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
