/**
 * Catalog workflow A9 — Piece-out and sticker-roll configuration.
 * Data: src/data/journey-a/a09-piece-out-sticker-roll-configuration.json · Plan: test-plans/journey-a/a09-piece-out-sticker-roll-configuration.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { PieceOutConfigCaseSchema } from '@data/schemas/journeyAScenario';
import { getPreferences } from '@utils/api/preferencesApi';
import { getSessionModules } from '@utils/api/sessionApi';
import { findActiveDeviceOfType, pushSetupExport } from '@utils/api/setupExportApi';
import { loadScenario } from '@utils/data/scenarioLoader';
import { pieceJobsInExport, preferenceInExport } from '@utils/export/setupExportXml';
import { preparePieceOutConfig } from '@utils/journeys/journeyAFlow';

test.describe('A9 · Piece-out and sticker-roll configuration', { tag: ['@JourneyA', '@A9'] }, () => {

    test('End-to-end: configure the piece-out and sticker-roll preferences, confirm they save, and confirm they reach a scan device setup export', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A9-001' },
        ],
    }, async ({ pages, sessionApi }, testInfo) => {
        test.slow();
        const scenario = await loadScenario(PieceOutConfigCaseSchema, testInfo);
        const { screen, write, device: deviceSpec, expected } = scenario;

        // The required module gates its whole section — without it the section assertions below
        // would pass vacuously — so it is read before anything is written.
        const modules = await getSessionModules(sessionApi);
        expect(modules[scenario.modules.required.key], scenario.modules.required.message).toBeTruthy();
        for (const note of scenario.modules.noteWhenOff) {
            if (!modules[note.key]) testInfo.annotations.push({ type: 'environment-gate', description: note.description });
        }

        // Snapshots the seven preference keys; the cleanup scope restores them in teardown.
        await preparePieceOutConfig(scenario, sessionApi, testInfo);
        const prefs = pages.preferences;
        const barcodeLabel = screen.barcodeFunctionLabels[write.stickers.pieceTraceabilityBarcodeFunction];
        const written = { ...write.pocket, ...write.stickers };
        await prefs.gotoPreferences();

        // A9-R1 — the section WEBPET-1446 originally failed for want of.
        await expect(prefs.sectionHeading(screen.stickerSection)).toBeVisible();

        // A9-R8 — written by the import engine, never by an operator.
        await expect(prefs.field(screen.readOnlyField)).toHaveJSProperty('readOnly', true);

        // A9-R2 — the piece bounds live on Pocket, not on the sticker section.
        await prefs.gotoSection(screen.pocketSection);
        for (const [fieldId, value] of Object.entries(write.pocket)) await prefs.setValue(fieldId, value);

        // A9-R3, and A9-R5: the barcode function is chosen by its label and must persist as the wire value.
        await prefs.gotoSection(screen.stickerSection);
        for (const [fieldId, value] of Object.entries(write.stickers)) {
            if (fieldId === screen.barcodeFunctionField) await prefs.choose(fieldId, barcodeLabel);
            else await prefs.setValue(fieldId, value);
        }

        const saveStatus = await prefs.save();
        expect(expected.savedStatuses, `PUT preferences answered ${saveStatus}`).toContain(saveStatus);

        // A9-R4 — reopen and confirm the screen comes back with what was saved.
        await prefs.gotoPreferences();
        for (const [fieldId, value] of Object.entries(written)) {
            if (fieldId === screen.barcodeFunctionField) await expect(prefs.field(fieldId)).toContainText(barcodeLabel);
            else await expect(prefs.field(fieldId)).toHaveValue(String(value));
        }

        const stored = await getPreferences(sessionApi);
        expect(stored[screen.barcodeFunctionField], 'A9-R5: stored as the wire value, not the label')
            .toBe(write.stickers.pieceTraceabilityBarcodeFunction);
        for (const [key, value] of Object.entries(written)) {
            if (key !== screen.barcodeFunctionField) expect(stored[key]).toBe(value);
        }

        // Push the setup file to one device and read it back.
        const device = await findActiveDeviceOfType(sessionApi, deviceSpec.pocketDeviceType);
        expect(device, deviceSpec.missingMessage).not.toBeNull();
        const { xml } = await pushSetupExport(sessionApi, device!.id);
        await testInfo.attach('setup-export.xml', { body: xml, contentType: 'text/xml' });

        // Proves the selection landed on a device type that actually carries the piece
        // section, so the assertions below cannot pass by absence.
        expect(xml, 'export must be a pocket-class file').toContain(expected.export.deviceTypeMarker);

        // A9-R10 — legacy `Preferen.Name` keys, not the web field ids.
        expect(preferenceInExport(xml, expected.export.names.maximumPieces), 'A9-R10: exported MaximumPieces')
            .toBe(String(write.pocket.maximumNumberOfPieces));
        expect(preferenceInExport(xml, expected.export.names.minimumPieces), 'A9-R10: exported MinimumPieces')
            .toBe(String(write.pocket.minimumNumberOfPieces));
        expect(preferenceInExport(xml, expected.export.names.numberOfPieces), 'A9-R10: exported default NumberOfPieces')
            .toBe(String(write.pocket.defaultNumberOfTimeCardPieces));

        // A9-R9 — a piece-out can only bind to a job the device actually received.
        const pieceJobs = pieceJobsInExport(xml, expected.export.piecePaymentTypes, expected.export.jobSection);
        expect(
            pieceJobs.length,
            `A9-R9: the setup export must carry a ${expected.export.piecePaymentTypes.join(' or ')} job ` +
                'for a piece-out to bind to — see A3; A9 does not create jobs out of scope',
        ).toBeGreaterThan(0);
        testInfo.annotations.push({ type: 'exported-piece-jobs', description: pieceJobs.join(', ') });
    });

});
