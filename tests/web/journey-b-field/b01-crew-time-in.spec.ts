/**
 * Catalog workflow **B1 — Crew time-in**, office half: the punches a supervisor
 * captured on the handheld reach the office and land on Transfer to Job Cards.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → B1 |
 * | Plan | `test-plans/journey-b/b01-crew-time-in.md` |
 * | Recording | `docs/media/Journey B1 Crew Time In.mp4` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B1-001` |
 *
 * **Transport, not simulation.** The device half is deferred (2026-08-11), so the
 * spec builds the same `OrangeExportFile` envelope PET Pocket serializes — ported
 * from the app's own serializer, see `src/utils/relay/exportEnvelope.ts` — and
 * delivers it through the real Post Office relay. Everything downstream is the
 * production path: the office imports the file and the rows are asserted by id.
 *
 * What that does NOT cover, deliberately: the app's capture UI, roster logic and
 * its serializer (B1-R1..R3). Those need a device and are parked with the mobile
 * automation on `feature/appium-journey-video-wip`.
 */
import { expect, test } from '@fixtures/base.fixture';
import { DEVICE_FIXTURE as F } from '@data/device/petPocketFixture';
import { buildCrewTimeInEnvelope, exportFileName, newRunPrefix } from '@utils/relay/exportEnvelope';
import { sendToRelay } from '@utils/relay/relayClient';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { verifyImportInOffice } from '@utils/api/officeVerification';

test.describe('B1 · Crew time-in', { tag: ['@JourneyB', '@B1'] }, () => {
    test('[Crew Time In] Deliver a crew time-in export to the office and verify the punches.', {
        // Tier tags only (@Regression/@HighLevel/@Smoke) plus @Demo — category is
        // the folder and environment is TEST_ENV, per scripts/runner/check.js.
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B1-001' },
            { type: 'requirement', description: 'B1-R5|B1-R7|B1-R8' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // The envelope references records by code and the importer's FKs are
        // nullable, so without this the import "succeeds" while linking nothing.
        const office = await seedOfficeFixture(sessionApi);

        // ── The export the device would produce: the crew, minus the absentee ──
        const prefix = newRunPrefix();
        const { xml, references } = buildCrewTimeInEnvelope({
            deviceAddress: process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1',
            prefix,
            cards: F.present.map((employee, i) => ({
                employeeCode: employee.code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                // One card carries a fix, as a real handheld does (B1-R6 is not
                // asserted office-side — the importer stores it verbatim).
                gps: i === 0 ? '(34.970215,-120.453984)' : undefined,
            })),
        });

        expect(xml).toContain('LookupContents="Field:Code|Crew:Code|Employee:Code');
        for (const employee of F.present) {
            expect(xml).toContain(`<Employee>${employee.code}</Employee>`);
        }
        expect(xml, 'the absentee must not be in the export').not.toContain(
            `<Employee>${F.absentee.code}</Employee>`,
        );
        expect(references).toHaveLength(F.present.length);
        await testInfo.attach('device-export.xml', { body: xml, contentType: 'application/xml' });

        // ── Delivery: the same POST /UploadFile the app makes ──
        const fileName = exportFileName(prefix);
        const sent = await sendToRelay({
            url: process.env.DEVICE_RELAY_URL ?? '',
            from: process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1',
            to: process.env.DEVICE_RELAY_SERVER ?? '',
            xml,
            fileName,
        });
        await testInfo.attach('relay-send.txt', {
            body: `file: ${fileName}\nsuccess: ${sent.success}\nstatus: ${sent.status}\n${sent.body}`,
            contentType: 'text/plain',
        });
        expect(sent.success, `relay rejected the export: ${sent.body}`).toBe(true);

        // ── The office: import it, prove the links, show it on the transfer screen ──
        await verifyImportInOffice({
            sessionApi,
            transferPage: pages.transferToJobCards,
            testInfo,
            xml,
            label: 'B1',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            expected: F.present.map((employee) => ({
                employeeCode: employee.code,
                employeeId: office.employees.get(employee.code)!.id,
                fieldId: office.field.id,
                jobId: office.job.id,
            })),
            absentEmployeeIds: [office.employees.get(F.absentee.code)!.id],
        });
    });
});
