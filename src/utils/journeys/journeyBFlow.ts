import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { relayConfig, type RelayConfig } from '@config/relay.config';
import { JOURNEY_B_FIXTURE as F, punchDay } from '@data/journey-b/fixture';
import type { JourneyBScenario } from '@data/schemas/journeyBScenario';
import { journeyBTestTimeoutMs } from '@utils/api/connectivityImportApi';
import { seedOfficeFixture, type OfficeFixture } from '@utils/api/officeFixture';
import {
    assertTransferGrid as assertTransferGridScreen,
    deliverAndVerifyCards,
    type ExpectedCard,
    type OfficeVerificationResult,
} from '@utils/api/officeVerification';
import type { OfficeTimeCard } from '@utils/api/timeCardsApi';
import { runCleanup } from '@utils/cleanup/runCleanup';
import {
    buildCrewTimeInEnvelope,
    buildEnvelope,
    DEVICE_SCHEMA,
    exportFileName,
    lineagePrefix,
    punchMoment,
    type DeviceRecord,
    type EnvelopeCard,
} from '@utils/relay/exportEnvelope';
import { ackRetrieved, drainMailbox, pullFromRelay, sendToRelay, type PulledMessage, type SendResult } from '@utils/relay/relayClient';

// The Journey B flow: seed → mint → pre-import cleanup → build/attach/send → import + card
// asserts (deliverAndVerifyCards) → the spec asserts and calls cleanup(). Nothing here
// belongs in a spec; specs reach the relay, the importer and the office only through this
// module (ESLint enforces it). `pages` is optional: browserless workflows (b05/b07, 4d)
// import through single-folder and never open the office UI.

type ExpectedCardJson = JourneyBScenario['expected']['cards'][number];
type GridExpectation = NonNullable<JourneyBScenario['expected']['grid']>;

/** Facts about one built envelope, so a spec compares fields instead of grepping XML. */
export interface EnvelopeView {
    xml: string;
    references: string[];
    fileName: string;
    prefix: string;
    /** `<X_Records>` section node names, document order. */
    sections: string[];
    /** Every distinct element name in the document. */
    tagNames: string[];
    /** `<EmployeeSource>` text → occurrences. */
    employeeSources: Record<string, number>;
    /** `<Employee>` text values, document order (the grid's `<Employee><Code>` wrapper excluded). */
    employees: string[];
    /** Distinct `LookupContents` attribute values. */
    lookupContents: string[];
    /** The capture-screen part of each reference (`TI`, `CI`, …), reference order. */
    referenceParts: string[];
    /** `<GpsReading>` occurrences. */
    gpsFixes: number;
}

export function envelopeView(xml: string, references: string[], fileName: string, prefix: string): EnvelopeView {
    const T = DEVICE_SCHEMA.tags;
    const texts = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map((m) => m[1]);
    const employeeSources: Record<string, number> = {};
    for (const s of texts(T.employeeSource)) employeeSources[s] = (employeeSources[s] ?? 0) + 1;
    return {
        xml,
        references,
        fileName,
        prefix,
        sections: [...xml.matchAll(new RegExp(`<(\\w+)${DEVICE_SCHEMA.recordsSuffix}\\b`, 'g'))].map((m) => m[1]),
        tagNames: [...new Set([...xml.matchAll(/<([A-Za-z_]\w*)[\s>]/g)].map((m) => m[1]))],
        employeeSources,
        employees: texts(T.employee).filter((v) => v !== ''),
        lookupContents: [...new Set([...xml.matchAll(new RegExp(`${DEVICE_SCHEMA.attributes.lookupContents}="([^"]*)"`, 'g'))].map((m) => m[1]))],
        referenceParts: references.map((r) => r.split('-')[2] ?? ''),
        gpsFixes: texts(T.gpsReading).length,
    };
}

export interface MintedRun {
    scenario: JourneyBScenario;
    prefix: string;
    punchDate: Date;
    deviceAddress: string;
    fileName: string;
}

/** Prefix, fixture day, device address, file name — and `{prefix}` substituted into every string of the scenario. */
export function mintRun(scenario: JourneyBScenario): MintedRun {
    const prefix = lineagePrefix(scenario.codes?.salt ?? '');
    return {
        scenario: substituteTokens(scenario, { prefix }),
        prefix,
        punchDate: punchDay(scenario.dayOffset),
        deviceAddress: relayConfig().from,
        fileName: exportFileName(prefix),
    };
}

export function substituteTokens<T>(value: T, tokens: Record<string, string>): T {
    if (typeof value === 'string') {
        return value.replace(/\{(\w+)\}/g, (whole, key: string) => tokens[key] ?? whole) as unknown as T;
    }
    if (Array.isArray(value)) return value.map((v) => substituteTokens(v, tokens)) as unknown as T;
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substituteTokens(v, tokens)]),
        ) as T;
    }
    return value;
}

function hhmm(time: string, day: Date): Date {
    const [h, m] = time.split(':').map(Number);
    return punchMoment(h, m, day);
}

function toDeviceRecords(scenario: JourneyBScenario, punchDate: Date): DeviceRecord[] {
    // node/part are guaranteed by the schema's superRefine for a 'records' envelope.
    return scenario.records.map((r) => ({
        node: r.node!,
        part: r.part!,
        employeeSource: r.employeeSource,
        employeeCode: r.employeeCode,
        crewCode: r.crewCode,
        ranchCode: r.ranchCode,
        fieldCode: r.fieldCode,
        jobCode: r.jobCode,
        at: r.time ? hhmm(r.time, punchDate) : undefined,
        gps: r.gps,
        pieces: r.pieces,
        traceabilityCode: r.traceabilityCode,
    }));
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

export function buildScenarioEnvelope(run: MintedRun): EnvelopeView {
    const { scenario, prefix, punchDate, deviceAddress, fileName } = run;
    const at = scenario.punchTime ? hhmm(scenario.punchTime, punchDate) : undefined;
    const built =
        scenario.envelope === 'crew'
            ? buildCrewTimeInEnvelope({ deviceAddress, prefix, cards: toCrewCards(scenario), at })
            : buildEnvelope({ deviceAddress, prefix, records: toDeviceRecords(scenario, punchDate), at });
    return envelopeView(built.xml, built.references, fileName, prefix);
}

/** Build, attach, push to `to`, attach the relay's answer. The caller asserts `send.success`. */
export async function buildAndSend(run: MintedRun, to: string, testInfo: TestInfo): Promise<{ envelope: EnvelopeView; send: SendResult }> {
    const envelope = buildScenarioEnvelope(run);
    await testInfo.attach('device-export.xml', { body: envelope.xml, contentType: 'application/xml' });
    const send = await sendToRelay({ url: relayConfig().url, from: run.deviceAddress, to, xml: envelope.xml, fileName: envelope.fileName });
    await testInfo.attach('relay-send.txt', {
        body: `file: ${envelope.fileName}\nsuccess: ${send.success}\nstatus: ${send.status}\n${send.body}`,
        contentType: 'text/plain',
    });
    return { envelope, send };
}

function resolveExpectedCards(scenario: JourneyBScenario, office: OfficeFixture, references: string[]): ExpectedCard[] {
    const fields = new Map([
        [F.field.code, { office: office.field, name: F.field.name }],
        [F.field2.code, { office: office.field2, name: F.field2.name }],
    ]);
    const jobs = new Map([
        [F.job.code, { office: office.job, name: F.job.name }],
        [F.job2.code, { office: office.job2, name: F.job2.name }],
        [F.mealJob.code, { office: office.mealJob, name: F.mealJob.name }],
    ]);
    const employeeNames = new Map([...F.present, F.absentee, ...F.sticker].map((e) => [e.code, e.name]));
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
        return {
            employeeCode: want.employeeCode,
            employeeId: employee.id,
            reference: references[want.record],
            fieldId: field?.office.id,
            jobId: job?.office.id,
            // Transport fidelity: what the device record carried must come back on the card.
            gps: record.gps,
            traceabilityCode: record.traceabilityCode,
            ...(want.panel
                ? {
                      ranchName: F.ranch.name,
                      fieldName: field?.name,
                      jobName: job?.name,
                      employeeName: employeeNames.get(want.employeeCode),
                      crewName: F.crew.name,
                  }
                : {}),
        };
    });
}

export interface JourneyBRunOptions {
    sessionApi: APIRequestContext;
    pages?: PageObjects;
    testInfo: TestInfo;
}

export interface JourneyBRun extends MintedRun {
    office: OfficeFixture;
    envelope: EnvelopeView;
    send: SendResult;
    /** `null` when the relay rejected the envelope — nothing was imported. */
    importRun: OfficeVerificationResult | null;
    cards: OfficeTimeCard[];
    expectedCards: ExpectedCard[];
    label: string;
    testInfo: TestInfo;
    /** The scenario's `cleanup` steps, 'after' phase. Call it in the spec's `finally`. */
    cleanup(): Promise<void>;
}

export async function runJourneyBScenario(scenario: JourneyBScenario, opts: JourneyBRunOptions): Promise<JourneyBRun> {
    const { sessionApi, pages, testInfo } = opts;
    // The Internet pull drains the whole mailbox in one request — one import deadline beyond the project timeout.
    testInfo.setTimeout(journeyBTestTimeoutMs(testInfo));
    if (scenario.transport === 'relay-echo') throw new Error(`${scenario.label}: transport 'relay-echo' runs through runRelayEcho`);
    if (scenario.verification === 'none') throw new Error(`${scenario.label}: verification 'none' (import without office read) arrives with 4d`);

    // The envelope references records by code and the importer's FKs are nullable, so
    // without this the import "succeeds" while linking nothing.
    const office = await seedOfficeFixture(sessionApi);
    const run = mintRun(scenario);
    const snapshots = new Map<string, unknown>();
    let cards: OfficeTimeCard[] = [];
    const cleanup = () => runCleanup(run.scenario.cleanup, sessionApi, testInfo, { phase: 'after', office, cards, snapshots });

    await runCleanup(run.scenario.cleanup, sessionApi, testInfo, { phase: 'before', office, snapshots });
    const { envelope, send } = await buildAndSend(run, relayConfig().office, testInfo);
    const base = { ...run, office, envelope, send, label: run.scenario.label, testInfo, cleanup };
    if (!send.success) return { ...base, importRun: null, cards, expectedCards: [] };

    const expectedCards = resolveExpectedCards(run.scenario, office, envelope.references);
    const absentEmployeeIds = (run.scenario.absentEmployees ?? []).map((code) => {
        const hit = office.employees.get(code);
        if (!hit) throw new Error(`${run.scenario.label}: absent employee code '${code}' is not seeded`);
        return hit.id;
    });
    if (!pages && (run.scenario.verification === 'office-ui' || process.env.IMPORT_TRANSPORT !== 'single-folder')) {
        throw new Error(`${run.scenario.label}: this scenario drives the office UI — destructure { pages } in the spec`);
    }
    const importRun = await deliverAndVerifyCards({
        sessionApi,
        pages,
        testInfo,
        xml: envelope.xml,
        fileName: envelope.fileName,
        label: run.scenario.label,
        crewId: office.crew.id,
        ranchId: office.ranch.id,
        expected: expectedCards,
        absentEmployeeIds,
        punchDate: run.punchDate,
        ...(run.scenario.cardType !== undefined ? { cardType: run.scenario.cardType } : {}),
        // The scenario's `timeCards` step already swept the fixture day — one live cleanup path.
        sweep: false,
    });
    cards = importRun.cards;
    return { ...base, importRun, cards, expectedCards };
}

export function assertExpectedCards(run: JourneyBRun, expected: ExpectedCardJson[]): void {
    const byReference = new Map(run.cards.map((c) => [String(c.reference ?? ''), c]));
    for (const want of expected) {
        const reference = run.envelope.references[want.record];
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

export async function assertTransferGrid(pages: PageObjects, run: JourneyBRun, grid: GridExpectation): Promise<void> {
    if (!run.importRun) throw new Error(`${run.label}: nothing was imported — the relay answered: ${run.send.body}`);
    await assertTransferGridScreen({
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
    const run = mintRun(scenario);
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
