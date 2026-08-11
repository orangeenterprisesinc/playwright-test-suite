/**
 * Catalog workflow **B1 — Crew time-in**, end to end across both surfaces:
 * a supervisor clocks a whole crew in on the handheld, unchecks the absentee,
 * exports, and the punches reach the office.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → B1 |
 * | Plan | `test-plans/journey-b/b01-crew-time-in.md` |
 * | Recording | `docs/media/Journey B1 Crew Time In.mp4` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B1-001` |
 *
 * One test, both surfaces — the flow the recording shows end to end: the `device`
 * fixture drives the real PET Pocket APK through Appium (WebdriverIO's client works
 * inside a Playwright test), and the same test then imports what the app exported
 * and verifies it in the office with `sessionApi` and `pages`. The emulator
 * recording, device screenshots and the export XML are attached here, so both
 * halves land in one HTML/Allure entry.
 *
 * The device exports to the Post Office relay configured in `.env.dev`
 * (`DEVICE_RELAY_SERVER`/`DEVICE_RELAY_URL`) and the send result is asserted.
 * The envelope itself is still captured from the app's own serializer, not
 * intercepted — the app force-upgrades its sync URL to HTTPS and trusts only
 * system CAs (see `src/utils/device/exportCapture.ts`). The preference keys
 * that make capture possible are documented in
 * `test-plans/journey-b/b01-crew-time-in.md`.
 */
import { expect, test } from '@fixtures/device.fixture';
import { DEVICE_FIXTURE as F } from '@data/device/petPocketFixture';
import { openDb, rows } from '@utils/device/deviceDb';
import { pullDb } from '@utils/device/deviceSeed';
import { attachAndAssertSendResult, clearExportLog, waitForExportedXml } from '@utils/device/exportCapture';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { verifyImportInOffice } from '@utils/api/officeVerification';
import path from 'node:path';

interface DeviceTimeCard {
    Employee: string;
    Crew: string;
    Field: string;
    Job: string;
    Ranch: string;
    Reference: string;
    TimeIn: string;
    EmployeeSource: string;
}

test.describe('B1 · Crew time-in', { tag: ['@JourneyB', '@B1'] }, () => {
    test('[Crew Time In] Capture a crew time-in on the device, uncheck the absentee, and export it.', {
        // Tier tags only (@Regression/@HighLevel/@Smoke) plus @Demo — category is
        // the folder and environment is TEST_ENV, per scripts/runner/check.js.
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B1-001' },
            { type: 'requirement', description: 'B1-R1|B1-R2|B1-R3|B1-R4|B1-R5|B1-R8' },
        ],
    }, async ({ device, sessionApi, pages }, testInfo) => {
        // ── Arrange: give the office the same records, under the same codes ──
        // The export references records by code and the importer's FKs are
        // nullable, so without this the import "succeeds" while linking nothing.
        const office = await seedOfficeFixture(sessionApi);

        // ── Arrange: seed the device (prefs + golden setup DB) ──
        await device.prepare();
        await device.mainMenu.waitUntilShown();
        await device.shot('main menu');

        // ── Act: open Crew In and set the capture context ──
        await device.mainMenu.openCrewTimeIn();
        await device.crewIn.waitUntilShown();
        // Two fields and two jobs exist (B2 needs a destination), so neither slot
        // pre-fills — scan each barcode, which is how a checker drives the screen.
        // The crew is the only one, so the app has already filled it.
        await device.crewIn.selectFieldByBarcode(F.field.code, F.field.name);
        await device.crewIn.selectJobByBarcode(F.job.code, F.job.name);
        await device.shot('crew in context');

        const context = await device.crewIn.context();
        expect(context).toEqual({
            field: F.field.name,
            job: F.job.name,
            crew: F.crew.name,
        });

        // SAVE opens the roster with every member pre-checked; uncheck the absentee.
        await device.crewIn.openRoster();
        await device.shot('roster all checked');
        expect(await device.crewIn.rosterNames()).toEqual([
            ...F.present.map((e) => e.name),
            F.absentee.name,
        ]);
        await device.crewIn.uncheck(F.absentee.name);
        await device.shot('absentee unchecked');
        await device.crewIn.confirmRoster();
        await device.shot('after save');

        // ── Assert on the device: one Time In per PRESENT member, none for the absentee ──
        const localDb = pullDb(path.join(testInfo.outputDir, 'petdb-after-b1.db'));
        const db = openDb(localDb);
        try {
            const timeCards = rows<DeviceTimeCard>(db, 'SELECT * FROM TimeCard_Records ORDER BY _id');
            expect(timeCards.map((r) => r.Employee)).toEqual(F.present.map((e) => e.name));
            expect(timeCards.map((r) => r.Employee)).not.toContain(F.absentee.name);
            for (const row of timeCards) {
                expect(row.Crew).toBe(F.crew.name);
                expect(row.Field).toBe(F.field.name);
                expect(row.Job).toBe(F.job.name);
                expect(row.EmployeeSource).toBe('Crew');
                // "CI" is the Crew In card type in the reference sequence.
                expect(row.Reference).toContain('-CI-');
                expect(row.TimeIn).toMatch(/^\d{2}:\d{2}:\d{2}$/);
            }
        } finally {
            db.close();
        }

        // ── Export: capture the envelope the app serializes ──
        await device.crewIn.backToMainMenu();
        await device.mainMenu.waitUntilShown();
        clearExportLog();
        const exportMessage = await device.mainMenu.exportRecords();
        const xml = await waitForExportedXml();
        await device.shot('after export');

        await attachAndAssertSendResult(testInfo, 'B1', exportMessage);

        // The envelope must carry the punches — an empty one would look like
        // success. Note the app exports records by **Code**, declaring so in
        // LookupContents; the office side must therefore match on Code, not Name.
        expect(xml).toContain('LookupContents="Field:Code|Crew:Code|Employee:Code');
        for (const e of F.present) {
            expect(xml).toContain(`<Employee>${e.code}</Employee>`);
        }
        expect(xml).not.toContain(`<Employee>${F.absentee.code}</Employee>`);
        expect(xml).toContain(`<Crew>${F.crew.code}</Crew>`);
        expect(xml).toContain(`<Job>${F.job.code}</Job>`);
        expect(xml).toContain(`<Field>${F.field.code}</Field>`);

        await testInfo.attach('device-export.xml', {
            body: xml,
            contentType: 'application/xml',
        });

        // ── The office: import it, prove the links, show it on the transfer screen ──
        await verifyImportInOffice({
            sessionApi,
            transferPage: pages.transferToJobCards,
            testInfo,
            xml,
            label: 'B1',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            expected: F.present.map((e) => ({
                employeeCode: e.code,
                employeeId: office.employees.get(e.code)!.id,
                fieldId: office.field.id,
                jobId: office.job.id,
            })),
            absentEmployeeIds: [office.employees.get(F.absentee.code)!.id],
        });
    });
});
