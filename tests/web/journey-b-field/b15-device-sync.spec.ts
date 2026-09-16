/**
 * Catalog workflow **B15 — Device sync and offline operation**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B15 |
 * | Plan | `test-plans/journey-b/b15-device-sync.md` |
 * | Jira | `WEBPET-1533` (attachments 66971/66972) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B15-001` |
 *
 * Happy path only, by decision: scope a device, save, push, and verify what the
 * office actually sent. Only the office half of the recording is drivable; the
 * device half (IMPORTAR/SINCRONIZAR) needs a handset.
 *
 * Deliberately not covered: `B15-R2` (unsaved-changes bar), `B15-R3` (whole-ranch
 * assignment), `B15-R7` (second push records a distinct run) — edge cases, not the
 * happy path. `B15-R8`/`B15-R9` are device-side; R9 is contradicted by the
 * recording and tracked in `test-plans/journey-b/b15-field-after-import-finding.md`.
 *
 * `/connectivity/export/log` has no evidence of existing on dev, so the run is
 * asserted through `POST /api/connectivity/export/scan-devices` instead.
 */
import { expect, test } from '@fixtures/base.fixture';
import { type ScanDeviceGeneral } from '@pages/setup/ScanDevicePage';
import { ensureCrew, ensureField, ensureRanch } from '@utils/api/setupEntitiesApi';
import { ackRetrieved, drainMailbox, pullFromRelay } from '@utils/relay/relayClient';
import { RUN_TOKEN, uniqueName } from '@utils/cleanup/runToken';

/**
 * `ZZTEST_SD_<RUN_TOKEN>`. RUN_TOKEN is already run- and worker-unique, and the
 * sweep's `six` decoder expects exactly six base36 digits after the prefix — an
 * undecodable name is one the sweep can never reclaim.
 */
function deviceGeneral(): ScanDeviceGeneral {
    const name = `ZZTEST_SD_${RUN_TOKEN}`;
    // ReferencePrefix is nvarchar(3).
    return { name, referencePrefix: `Z${RUN_TOKEN.slice(-2)}`, webMailAddress: `${name}@silo` };
}

/** ≥4 digits, no leading zero — the journey-B barcode rule. */
function runUniqueCode(offset: number): string {
    return String(parseInt(RUN_TOKEN, 36) + offset);
}

function recordsBlock(xml: string, tag: string): string {
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
    return match ? match[1] : '';
}

function recordsBlockCleared(xml: string, tag: string): boolean {
    const match = new RegExp(`<${tag}([^>]*)>`).exec(xml);
    return !!match && /Clear="True"/.test(match[1]);
}

test.describe('B15 · Device sync and offline operation', { tag: ['@JourneyB', '@B15'] }, () => {
    test('[Scan Device] A scoped scan device pushes its setup to the device mailbox.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B15-001' },
            { type: 'requirement', description: 'B15-R1|B15-R4|B15-R5|B15-R6' },
        ],
    }, async ({ sessionApi, pages, cleanup }, testInfo) => {
        test.slow();
        const url = process.env['DEVICE_RELAY_URL'];
        expect(url, 'DEVICE_RELAY_URL must be set (see .env.dev)').toBeTruthy();

        const ranch = await ensureRanch(sessionApi, { code: runUniqueCode(1), name: uniqueName('E2ERanch_') });
        cleanup.track('ranch', ranch.name);
        const crew = await ensureCrew(sessionApi, { code: runUniqueCode(3), name: uniqueName('E2ECrew_') });
        cleanup.track('crew', crew.name);
        const field = await ensureField(sessionApi, {
            code: runUniqueCode(2),
            name: uniqueName('E2EField_'),
            ranchCounter: ranch.id,
        });
        cleanup.track('field', field.name);

        const general = deviceGeneral();
        const deviceId = await pages.scanDevice.createDevice(general);
        cleanup.track('scanDevice', general.name);

        await pages.scanDevice.gotoEdit(deviceId);
        await pages.scanDevice.waitForEditReady();
        await pages.scanDevice.addCrew(crew.id);
        await pages.scanDevice.addRanch(ranch.name, field.name);
        await pages.scanDevice.save(deviceId);

        // B15-R1
        await expect(pages.scanDevice.savedToast).toBeVisible();

        // Anything already queued for this mailbox would be pulled instead of ours.
        await drainMailbox(url!, general.webMailAddress);

        // B15-R4, B15-R5 — the push reports success against this device's own mailbox.
        const { destination } = await pages.scanDevice.pushToDevice();
        expect(destination, 'the push reported a different destination mailbox').toContain(
            general.webMailAddress,
        );

        // B15-R6 — what was actually sent, read back off the relay.
        const pulled = await pullFromRelay(url!, general.webMailAddress);
        expect(pulled, 'nothing was queued for the device mailbox').not.toBeNull();

        try {
            const xml = pulled!.attachment;
            await testInfo.attach('scan-device-export.xml', { body: xml, contentType: 'application/xml' });

            expect(recordsBlockCleared(xml, 'Ranch_Records'), 'Ranch_Records Clear="True"').toBe(true);
            expect(recordsBlockCleared(xml, 'Field_Records'), 'Field_Records Clear="True"').toBe(true);
            expect(recordsBlockCleared(xml, 'Crew_Records'), 'Crew_Records Clear="True"').toBe(true);

            const ranchBlock = recordsBlock(xml, 'Ranch_Records');
            expect(ranchBlock).toContain(ranch.name);
            expect(ranchBlock).toContain(ranch.code);

            const fieldBlock = recordsBlock(xml, 'Field_Records');
            expect(fieldBlock).toContain(field.name);
            expect(fieldBlock).toContain(field.code);
            expect(fieldBlock).toContain(ranch.name);

            const crewBlock = recordsBlock(xml, 'Crew_Records');
            expect(crewBlock).toContain(crew.name);
            expect(crewBlock).toContain(crew.code);
        } finally {
            await ackRetrieved(url!, general.webMailAddress, pulled!.messageId);
        }
    });
});
