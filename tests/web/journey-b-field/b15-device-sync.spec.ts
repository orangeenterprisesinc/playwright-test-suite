/**
 * Catalog workflow B15 — Device sync and offline operation (WEBPET-1533): the office half — a scoped scan device pushes its setup to its mailbox.
 * Data: src/data/journey-b/b15-device-sync.json · Plan: test-plans/journey-b/b15-device-sync.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { DeviceSyncScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { mintDeviceScope, pushAndPull, scopeDevice } from '@utils/journeys/deviceSyncFlow';

test.describe('B15 · Device sync and offline operation', { tag: ['@JourneyB', '@B15'] }, () => {
    test('[Scan Device] A scoped scan device pushes its setup to the device mailbox.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B15-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(DeviceSyncScenarioSchema, testInfo);
        const minted = mintDeviceScope(scenario);
        expect(minted.relay.url, 'DEVICE_RELAY_URL must be set (see .env.dev)').toBeTruthy();
        const run = await scopeDevice(minted, { sessionApi, pages, testInfo });
        // B15-R1
        await expect(pages.scanDevice.savedToast).toBeVisible();
        const sync = await pushAndPull(run, pages, testInfo);
        // B15-R4, B15-R5 — the push reports success against this device's own mailbox.
        expect(sync.destination, 'the push reported a different destination mailbox').toContain(run.device.webMailAddress);
        // B15-R6 — what was actually sent, read back off the relay.
        expect(sync.pulled, 'nothing was queued for the device mailbox').not.toBeNull();
        const view = sync.export!;
        const { ranch, field, crew } = run.entities;
        expect(view.cleared(ranch.section), `${ranch.section} Clear="True"`).toBe(true);
        expect(view.cleared(field.section), `${field.section} Clear="True"`).toBe(true);
        expect(view.cleared(crew.section), `${crew.section} Clear="True"`).toBe(true);
        expect(view.block(ranch.section)).toContain(ranch.name);
        expect(view.block(ranch.section)).toContain(ranch.code);
        expect(view.block(field.section)).toContain(field.name);
        expect(view.block(field.section)).toContain(field.code);
        expect(view.block(field.section)).toContain(ranch.name);
        expect(view.block(crew.section)).toContain(crew.name);
        expect(view.block(crew.section)).toContain(crew.code);
    });
});
