import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { relayConfig, type RelayConfig } from '@config/relay.config';
import { makeScanDevice, runUniqueCode } from '@data/generated';
import type { DeviceSyncScenario } from '@data/schemas/journeyBScenario';
import { cleanupTarget } from '@data/static/shared/cleanupTargets';
import type { ScanDeviceGeneral } from '@pages/setup/ScanDevicePage';
import { ensureCrew, ensureField, ensureRanch, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { uniqueName } from '@utils/cleanup/runToken';
import { substituteTokens } from '@utils/data/scenarioLoader';
import { setupExportView, type SetupExportView } from '@utils/export/setupExportXml';
import { ackRetrieved, drainMailbox, pullFromRelay, type PulledMessage } from '@utils/relay/relayClient';

// B15 runs the pipeline the other way round: the OFFICE serializes the setup a scoped scan device
// receives and pushes it to that device's mailbox; the test pulls the envelope back and reads it.
// Nothing here builds XML — setupExportXml.ts parses what the office sent. Three stages so the
// spec asserts between them: mint → scope (API rows + device UI) → push and pull.

type EntityKey = keyof DeviceSyncScenario['entities'];
type Minted = { code: string; name: string };
const ENTITY_KEYS: EntityKey[] = ['ranch', 'field', 'crew'];

export interface ScopedEntity extends EnsuredRecord {
    /** The `<X_Records>` block the office serializes this entity into. */
    section: string;
}

export interface MintedDeviceScope {
    /** The scenario with `{ranchName}`, `{ranchCode}`, …, `{deviceName}`, `{deviceMailbox}` substituted — the cleanup steps name the minted rows. */
    scenario: DeviceSyncScenario;
    relay: RelayConfig;
    device: ScanDeviceGeneral;
    minted: Record<EntityKey, Minted>;
}

export interface DeviceScopeRun extends MintedDeviceScope {
    entities: Record<EntityKey, ScopedEntity>;
    deviceId: number;
    /** The device's own relay mailbox and the message pulled from it (acknowledged by cleanup()). */
    mailbox: { address: string; pulled: PulledMessage | null };
    cleanup(): Promise<void>;
}

export interface DeviceSync {
    /** The push panel's destination line. */
    destination: string;
    pulled: PulledMessage | null;
    /** The pulled envelope, parsed; null when nothing was queued. */
    export: SetupExportView | null;
}

function assertSweepable(entity: string, name: string): void {
    if (!cleanupTarget(entity).prefixes.some((p) => name.startsWith(p.prefix))) {
        throw new Error(`'${name}' carries no prefix the residue sweep reclaims for ${entity} (cleanupTargets.ts)`);
    }
}

/** Run-unique names and codes from the scenario's prefixes and offsets; every name must be one the residue sweep can reclaim. */
export function mintDeviceScope(scenario: DeviceSyncScenario): MintedDeviceScope {
    const device = makeScanDevice(scenario.device.prefix);
    assertSweepable('scanDevice', device.name);
    const minted = {} as Record<EntityKey, Minted>;
    const tokens: Record<string, string> = { deviceName: device.name, deviceMailbox: device.webMailAddress };
    for (const key of ENTITY_KEYS) {
        const { prefix, codeOffset } = scenario.entities[key];
        minted[key] = { code: runUniqueCode(codeOffset), name: uniqueName(prefix) };
        assertSweepable(key, minted[key].name);
        tokens[`${key}Name`] = minted[key].name;
        tokens[`${key}Code`] = minted[key].code;
    }
    return { scenario: substituteTokens(scenario, tokens), relay: relayConfig(), device, minted };
}

export interface DeviceScopeOptions {
    sessionApi: APIRequestContext;
    pages: PageObjects;
    testInfo: TestInfo;
}

/** Creates the setup rows, then the device through the UI, scopes it to the crew and the ranch/field, saves. On failure, removes what it made before rethrowing. */
export async function scopeDevice(minted: MintedDeviceScope, opts: DeviceScopeOptions): Promise<DeviceScopeRun> {
    const { sessionApi, pages, testInfo } = opts;
    const { scenario, relay, device } = minted;
    testInfo.slow();
    const mailbox: DeviceScopeRun['mailbox'] = { address: device.webMailAddress, pulled: null };
    const cleanup = async () => {
        // Acknowledge first so nothing accumulates on the relay; the delete steps follow in cleanupTargets order.
        if (mailbox.pulled) await ackRetrieved(relay.url, mailbox.address, mailbox.pulled.messageId);
        await runCleanup(scenario.cleanup, sessionApi, testInfo, { phase: 'after' });
    };
    const section = (key: EntityKey) => scenario.entities[key].section;
    try {
        const ranch: ScopedEntity = { ...(await ensureRanch(sessionApi, minted.minted.ranch)), section: section('ranch') };
        const crew: ScopedEntity = { ...(await ensureCrew(sessionApi, minted.minted.crew)), section: section('crew') };
        const field: ScopedEntity = { ...(await ensureField(sessionApi, { ...minted.minted.field, ranchCounter: ranch.id })), section: section('field') };

        const deviceId = await pages.scanDevice.createDevice(device);
        await pages.scanDevice.gotoEdit(deviceId);
        await pages.scanDevice.waitForEditReady();
        await pages.scanDevice.addCrew(crew.id);
        await pages.scanDevice.addRanch(ranch.name, field.name);
        await pages.scanDevice.save(deviceId);
        return { ...minted, entities: { ranch, field, crew }, deviceId, mailbox, cleanup };
    } catch (error) {
        await cleanup();
        throw error;
    }
}

/** Drains the device mailbox, pushes, pulls the envelope back and attaches it. */
export async function pushAndPull(run: DeviceScopeRun, pages: PageObjects, testInfo: TestInfo): Promise<DeviceSync> {
    const { url } = run.relay;
    // Anything already queued for this mailbox would be pulled instead of ours.
    await drainMailbox(url, run.mailbox.address);
    const { destination } = await pages.scanDevice.pushToDevice();
    const pulled = await pullFromRelay(url, run.mailbox.address);
    run.mailbox.pulled = pulled;
    if (pulled) await testInfo.attach('scan-device-export.xml', { body: pulled.attachment, contentType: 'application/xml' });
    return { destination, pulled, export: pulled ? setupExportView(pulled.attachment) : null };
}
