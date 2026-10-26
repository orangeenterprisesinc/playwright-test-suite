/**
 * Catalog workflow A9 — Piece-out and sticker-roll configuration.
 * Data: src/data/journey-a/a09-piece-out-sticker-roll-configuration.json · Plan: test-plans/journey-a/a09-piece-out-sticker-roll-configuration.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { PieceOutConfigCaseSchema } from '@data/schemas/journeyAScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { pieceJobsInExport, preferenceInExport } from '@utils/export/setupExportXml';
import {
    findPocketDevice,
    preparePieceOutConfig,
    readModuleGates,
    readSetupExportFile,
} from '@utils/journeys/journeyAFlow';
import { withPreferencesLock } from '@utils/sync/preferencesLock';

test.describe('A9 · Piece-out and sticker-roll configuration', { tag: ['@JourneyA', '@A9'] }, () => {

    test('End-to-end: configure the piece-out and sticker-roll preferences, confirm they save, and confirm they reach a scan device setup export', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A9' },
        ],
    }, async ({ pages, sessionApi }, testInfo) => {
        test.setTimeout(360_000);
        const scenario = await loadScenario(PieceOutConfigCaseSchema, testInfo);
        const { screen, write, device: deviceSpec, expected } = scenario;

        // The required module gates its whole section — without it the section assertions below
        // would pass vacuously — so it is read before anything is written.
        const modules = await readModuleGates(sessionApi);
        expect(modules[scenario.modules.required.key], scenario.modules.required.message).toBeTruthy();
        for (const note of scenario.modules.noteWhenOff) {
            if (!modules[note.key]) testInfo.annotations.push({ type: 'environment-gate', description: note.description });
        }

        // Snapshots the seven preference keys; the cleanup scope restores them in teardown.
        await preparePieceOutConfig(scenario, sessionApi, testInfo);
        const prefs = pages.preferences;
        const barcodeLabel = screen.barcodeFunctionLabels[write.stickers.pieceTraceabilityBarcodeFunction];
        const written = { ...write.pocket, ...write.stickers };

        // Save sends the whole form, so load → set → save → reload runs under the cross-worker lock.
        await withPreferencesLock(async () => {
            await prefs.gotoPreferences();

            // The section WEBPET-1446 originally failed for want of.
            await expect(prefs.sectionHeading(screen.stickerSection)).toBeVisible();

            // Written by the import engine, never by an operator.
            await expect(prefs.field(screen.readOnlyField)).toHaveJSProperty('readOnly', true);

            // A killed run skips the restore, and the next run snapshots the written values as the originals,
            // so the record can already hold them; Save then stays disabled. Only differing fields are touched.
            // The piece bounds live on Pocket, not on the sticker section.
            let changed = 0;
            await prefs.gotoSection(screen.pocketSection);
            for (const [fieldId, value] of Object.entries(write.pocket)) {
                if ((await prefs.displayedValue(fieldId)) !== String(value)) { await prefs.setValue(fieldId, value); changed += 1; }
            }

            // and the barcode function is chosen by its label and must persist as the wire value.
            await prefs.gotoSection(screen.stickerSection);
            for (const [fieldId, value] of Object.entries(write.stickers)) {
                if (fieldId === screen.barcodeFunctionField) {
                    if ((await prefs.displayedValue(fieldId)) !== barcodeLabel) { await prefs.choose(fieldId, barcodeLabel); changed += 1; }
                } else if ((await prefs.displayedValue(fieldId)) !== String(value)) {
                    await prefs.setValue(fieldId, value);
                    changed += 1;
                }
            }

            const saveStatus = await prefs.saveIfDirty();
            expect(saveStatus === null && changed > 0, `${changed} field(s) changed but Save stayed disabled — check the inline field errors`).toBe(false);
            if (saveStatus === null) {
                testInfo.annotations.push({ type: 'already-stored', description: 'Preferences already held every A9 value; Save stayed disabled, the reload below proves them' });
            } else {
                expect(expected.savedStatuses, `PUT preferences answered ${saveStatus}`).toContain(saveStatus);
            }

            // Reopen and confirm the screen comes back with what was saved.
            await prefs.gotoPreferences();
            for (const [fieldId, value] of Object.entries(written)) {
                if (fieldId === screen.barcodeFunctionField) await expect(prefs.field(fieldId)).toContainText(barcodeLabel);
                else await expect(prefs.field(fieldId)).toHaveValue(String(value));
            }
        });

        // Push the setup file to one device and read the file the screen offers for download. The device is shared: opened, never saved.
        const device = await findPocketDevice(sessionApi, deviceSpec.pocketDeviceType);
        expect(device, deviceSpec.missingMessage).not.toBeNull();
        expect(device!.name, 'the pocket device needs a name to be opened from the list').toBeTruthy();
        await pages.scanDevice.gotoEdit(device!.id, device!.name!);
        await pages.scanDevice.waitForEditReady();
        await pages.scanDevice.pushToDevice();
        const pushed = await pages.scanDevice.downloadPushedFile(testInfo);
        const xml = await readSetupExportFile(pushed.path);

        // Proves the selection landed on a device type that actually carries the piece
        // section, so the assertions below cannot pass by absence.
        expect(xml, 'export must be a pocket-class file').toContain(expected.export.deviceTypeMarker);

        // Legacy `Preferen.Name` keys, not the web field ids.
        expect(preferenceInExport(xml, expected.export.names.maximumPieces), 'exported MaximumPieces')
            .toBe(String(write.pocket.maximumNumberOfPieces));
        expect(preferenceInExport(xml, expected.export.names.minimumPieces), 'exported MinimumPieces')
            .toBe(String(write.pocket.minimumNumberOfPieces));
        expect(preferenceInExport(xml, expected.export.names.numberOfPieces), 'exported default NumberOfPieces')
            .toBe(String(write.pocket.defaultNumberOfTimeCardPieces));

        // A piece-out can only bind to a job the device actually received.
        const pieceJobs = pieceJobsInExport(xml, expected.export.piecePaymentTypes, expected.export.jobSection);
        expect(
            pieceJobs.length,
            `the setup export must carry a ${expected.export.piecePaymentTypes.join(' or ')} job ` +
                'for a piece-out to bind to — see A3; A9 does not create jobs out of scope',
        ).toBeGreaterThan(0);
        testInfo.annotations.push({ type: 'exported-piece-jobs', description: pieceJobs.join(', ') });
    });

});
