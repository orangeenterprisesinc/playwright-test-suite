import { readFile, writeFile } from 'node:fs/promises';
import type { APIRequestContext, Page, TestInfo } from '@playwright/test';
import { relayConfig } from '@config/relay.config';
import { makeCrewName, makeEmployeeName, makeScanDevice, makeUser, runUniqueCode } from '@data/generated';
import type {
    BiometricEnrollmentCase,
    CrewSetupCase,
    EmployeeSetupCase,
    PieceOutConfigCase,
    UserSetupCase,
} from '@data/schemas/journeyAScenario';
import { isSweepable } from '@data/static/shared/cleanupTargets';
import type { NewUserData } from '@pages/admin/UsersPage';
import type { NewCrewData } from '@pages/setup/CrewPage';
import type { NewEmployeeData } from '@pages/setup/EmployeePage';
import { DEVICE_TYPE, type ScanDeviceGeneral } from '@pages/setup/ScanDevicePage';

import { getPreferences } from '@utils/api/preferencesApi';
import { getSessionModules } from '@utils/api/sessionApi';
import { findActiveDeviceOfType } from '@utils/api/setupExportApi';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { register } from '@utils/cleanup/cleanupScope';
import { RUN_TOKEN, readableName } from '@utils/cleanup/runToken';
import { substituteTokens } from '@utils/data/scenarioLoader';
import { employeeInExport } from '@utils/export/setupExportXml';
import { randomTemplate, syntheticPortraitJpeg } from '@utils/relay/biometricPayload';
import { buildBiometricEnrollmentEnvelope, DEVICE_SCHEMA } from '@utils/relay/exportEnvelope';
import { drainMailbox } from '@utils/relay/relayClient';

// Journey A: the spec drives the setup screens itself; this layer mints what a case cannot hold
// (a run-unique user) and binds the minted name into the case's cleanup steps.

/** The workflow id the run-tagged names are minted under: the spec's `testCaseId` annotation. */
function ownerOf(testInfo: TestInfo): string {
    const id = testInfo.annotations.find((a) => a.type === 'testCaseId')?.description;
    if (!id) throw new Error(`'${testInfo.title}' has no testCaseId annotation — run-tagged names are minted under the workflow id`);
    return id;
}

export interface UserSetupRun {
    /** The case with `{userName}` substituted. */
    scenario: UserSetupCase;
    /** The New User form data: the case's fields over a run-unique name, initials and email. */
    user: NewUserData;
    /** The case's cleanup steps, 'after' phase — deletes the minted user (no screen offers a delete). */
    cleanup(): Promise<void>;
}

export function mintUserSetup(scenario: UserSetupCase, _sessionApi: APIRequestContext, testInfo: TestInfo): UserSetupRun {
    // The user Name field holds 25 characters, so it is `A1 USER <stamp>` without the `NEW`.
    const name = readableName(ownerOf(testInfo), 'USER', ' ', Date.now(), false);
    if (!isSweepable('user', name)) throw new Error(`'${name}' is not a name the residue sweep reclaims for users (cleanupTargets.ts)`);
    if (name.length > 25) throw new Error(`'${name}' is ${name.length} chars, over the user Name limit of 25`);
    const user = makeUser({ ...scenario.user, name });
    const substituted = substituteTokens(scenario, { userName: user.name });
    const cleanup = register(testInfo, 'A1 user-setup cleanup', (api) =>
        runCleanup(substituted.cleanup, api, testInfo, { phase: 'after' }),
    );
    return { scenario: substituted, user, cleanup };
}

export interface CrewSetupRun {
    /** The case with `{crewName}` substituted. */
    scenario: CrewSetupCase;
    /** The New Crew form data: the case's lookups over a run-unique name and barcode. */
    crew: NewCrewData;
    /** The case's cleanup steps, 'after' phase. */
    cleanup(): Promise<void>;
}

export function mintCrewSetup(scenario: CrewSetupCase, _sessionApi: APIRequestContext, testInfo: TestInfo): CrewSetupRun {
    const name = makeCrewName(ownerOf(testInfo));
    const { codeOffset, ...picked } = scenario.crew;
    const crew: NewCrewData = { ...picked, name, code: runUniqueCode(codeOffset) };
    const substituted = substituteTokens(scenario, { crewName: name });
    const cleanup = register(testInfo, 'A4 crew-setup cleanup', (api) =>
        runCleanup(substituted.cleanup, api, testInfo, { phase: 'after' }),
    );
    return { scenario: substituted, crew, cleanup };
}

export interface PieceOutConfigRun {
    scenario: PieceOutConfigCase;
    /** Puts the shared Preferences record back — the snapshot the 'before' phase took. */
    cleanup(): Promise<void>;
}

/**
 * A9 creates nothing, so the flow's whole job is the snapshot/restore bracket: the `restore` step
 * snapshots here, before the screen writes anything, and `cleanup()` restores from the same Map.
 * The case's own annotations are pushed here, as the Journey B flow does.
 */
export async function preparePieceOutConfig(
    scenario: PieceOutConfigCase,
    sessionApi: APIRequestContext,
    testInfo: TestInfo,
): Promise<PieceOutConfigRun> {
    for (const annotation of scenario.annotations) testInfo.annotations.push(annotation);
    const snapshots = new Map<string, unknown>();
    await runCleanup(scenario.cleanup, sessionApi, testInfo, { phase: 'before', snapshots });
    return {
        scenario,
        cleanup: register(testInfo, 'A9 piece-out config cleanup', (api) =>
            runCleanup(scenario.cleanup, api, testInfo, { phase: 'after', snapshots }),
        ),
    };
}

// The API edge of journey A. Specs may not import @utils/api/* (UI-first lint), so every
// read A9 needs passes through here.

/** A9 read: the module gates, read before anything is written so a section cannot assert vacuously. */
export async function readModuleGates(api: APIRequestContext): Promise<Record<string, unknown>> {
    return getSessionModules(api);
}

/** A6 plumbing read: one preference that gates the scenario, read before anything is created. The screen proves outcomes, not this. */
export async function readPreferenceGate(api: APIRequestContext, key: string): Promise<unknown> {
    return (await getPreferences(api))[key];
}

/** A9 read: an existing active pocket device. Never mints one — a fresh device exports no piece jobs. */
export async function findPocketDevice(api: APIRequestContext, deviceType: number) {
    return findActiveDeviceOfType(api, deviceType);
}

/** The setup file saved by `ScanDevicePage.downloadPushedFile` (the screen's own "Download file"). */
export async function readSetupExportFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
}


export interface EmployeeSetupRun {
    /** The case with `{employeeName}` substituted. */
    scenario: EmployeeSetupCase;
    /** The New Employee form data: the case's values over a run-unique name and four run-unique codes. */
    employee: NewEmployeeData &
        Required<
            Pick<
                NewEmployeeData,
                | 'lastName' | 'exportIdentifier' | 'nfcCode' | 'rfidCode' | 'crew' | 'department' | 'hourlyRate'
                | 'gender' | 'dateOfBirth' | 'defaultRanch' | 'defaultField' | 'defaultJob'
                | 'waivedFirstMeal' | 'waivedSecondMeal'
            >
        >;
    /** After-phase teardown: delete the employee. */
    cleanup(): Promise<void>;
}

/** Mints the employee's name and codes and registers the after-phase cleanup. */
export function prepareEmployeeSetup(scenario: EmployeeSetupCase, testInfo: TestInfo): EmployeeSetupRun {
    const spec = scenario.employee;
    const { name, lastName } = makeEmployeeName(ownerOf(testInfo));
    const substituted = substituteTokens(scenario, { employeeName: name });
    const cleanup = register(testInfo, 'A5 employee-setup cleanup', (api) =>
        runCleanup(substituted.cleanup, api, testInfo, { phase: 'after' }),
    );
    return {
        scenario: substituted,
        employee: {
            name,
            code: runUniqueCode(spec.codeOffset),
            lastName,
            exportIdentifier: runUniqueCode(spec.exportIdentifierOffset),
            nfcCode: runUniqueCode(spec.nfcCodeOffset),
            rfidCode: runUniqueCode(spec.rfidCodeOffset),
            crew: spec.crew,
            department: spec.department,
            hourlyRate: spec.hourlyRate,
            gender: spec.gender,
            dateOfBirth: spec.dateOfBirth,
            defaultRanch: spec.defaultRanch,
            defaultField: spec.defaultField,
            defaultJob: spec.defaultJob,
            waivedFirstMeal: spec.waivedFirstMeal,
            waivedSecondMeal: spec.waivedSecondMeal,
        },
        cleanup,
    };
}

export interface BiometricEnrollmentRun {
    /** The case with `{employeeName}` and `{deviceName}` substituted. */
    scenario: BiometricEnrollmentCase;
    employee: NewEmployeeData & Required<Pick<NewEmployeeData, 'lastName' | 'exportIdentifier' | 'crew'>>;
    rfidCode: string;
    device: ScanDeviceGeneral;
    deviceType: string;
    /** How the device's Employee picker labels the employee. */
    deviceLabel: string;
    cleanup(): Promise<void>;
}

type TemplateKey = keyof BiometricEnrollmentCase['deviceFile']['templateBytes'];

export interface BiometricDeviceFile {
    path: string;
    fileName: string;
    templates: Record<TemplateKey, string>;
    picture: { width: number; height: number };
}

export interface PushedEmployee {
    name: string;
    rfidCode: string;
    /** Whitespace-stripped, keyed like `BiometricDeviceFile.templates`. */
    templates: Record<TemplateKey, string>;
    fields: Record<string, string>;
}

/** Reads the photo-rule gate, mints the run's identifiers and registers teardown before anything is created. */
export async function prepareBiometricEnrollment(
    scenario: BiometricEnrollmentCase,
    sessionApi: APIRequestContext,
    testInfo: TestInfo,
): Promise<BiometricEnrollmentRun> {
    for (const annotation of scenario.annotations) testInfo.annotations.push(annotation);
    testInfo.slow();

    const gate = scenario.preferenceGate;
    if ((await readPreferenceGate(sessionApi, gate.key)) !== gate.expected) throw new Error(gate.message);

    const spec = scenario.employee;
    const owner = ownerOf(testInfo);
    const { name, lastName } = makeEmployeeName(owner);
    const exportIdentifier = runUniqueCode(spec.exportIdentifierOffset);
    const device = makeScanDevice(owner, scenario.device.referenceLead, scenario.device.noun);
    const substituted = substituteTokens(scenario, { employeeName: name, deviceName: device.name });
    const relay = relayConfig();
    const cleanup = register(testInfo, 'A6 biometric-enrollment cleanup', async (api) => {
        // The push queues a file for a mailbox nothing pulls.
        await drainMailbox(relay.url, device.webMailAddress).catch(() => undefined);
        await runCleanup(substituted.cleanup, api, testInfo, { phase: 'after' });
    });
    return {
        scenario: substituted,
        employee: { name, code: runUniqueCode(spec.codeOffset), lastName, exportIdentifier, crew: spec.crew },
        rfidCode: runUniqueCode(spec.rfidCodeOffset),
        device,
        deviceType: DEVICE_TYPE[scenario.device.type],
        deviceLabel: `${exportIdentifier} : ${name}`,
        cleanup,
    };
}

/** Builds the IrisID reader's own export for the run's employee and writes it where Single Folder can upload it. */
export async function writeBiometricDeviceFile(
    run: BiometricEnrollmentRun,
    page: Page,
    testInfo: TestInfo,
): Promise<BiometricDeviceFile> {
    const { fileStem, templateBytes, picture: size } = run.scenario.deviceFile;
    const templates: Record<TemplateKey, string> = {
        irisTemplateLeft: randomTemplate(templateBytes.irisTemplateLeft),
        irisFaceTemplate: randomTemplate(templateBytes.irisFaceTemplate),
        irisTemplateRight: randomTemplate(templateBytes.irisTemplateRight),
    };
    const picture = await syntheticPortraitJpeg(page, size.width, size.height);
    const { xml } = buildBiometricEnrollmentEnvelope({
        deviceAddress: run.device.webMailAddress,
        enrollments: [{ employeeCode: run.employee.code, picture, ...templates }],
    });
    const fileName = `${fileStem}-${RUN_TOKEN}-a${String(testInfo.retry)}.xml`;
    const path = testInfo.outputPath(fileName);
    await writeFile(path, xml, 'utf8');
    await testInfo.attach(fileName, { path, contentType: 'application/xml' });
    return { path, fileName, templates, picture: size };
}

/** The employee row (RFID code, templates) in the pushed file the screen downloaded. */
export async function readPushedEmployee(path: string, employeeCode: string): Promise<PushedEmployee | undefined> {
    const fields = employeeInExport(await readSetupExportFile(path), employeeCode);
    if (!fields) return undefined;
    const T = DEVICE_SCHEMA.biometric.tags;
    const stripped = (tag: string) => (fields[tag] ?? '').replace(/\s+/g, '');
    return {
        name: fields.Name ?? '',
        rfidCode: fields.RfidCode ?? '',
        templates: {
            irisTemplateLeft: stripped(T.irisTemplateLeft),
            irisFaceTemplate: stripped(T.irisFaceTemplate),
            irisTemplateRight: stripped(T.irisTemplateRight),
        },
        fields,
    };
}
