/**
 * Catalog workflow **B2 — Crew move and job change**, office half: after the
 * supervisor moves the crew mid-day, the office must show each mover in the
 * destination field/job and the member left behind still in the original.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → B2 |
 * | Plan | `test-plans/journey-b/b02-crew-move-and-job-change.md` |
 * | Recording | `docs/media/Journey B2 Crew Move and Job Change.mp4` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B2-001` |
 *
 * **What the envelope encodes — and why it is four rows, not seven.** A move on
 * the device is not a second punch: each mover's existing Time In is *updated in
 * place*, same row and same reference, and no time-out is written. The device
 * therefore exports the crew's FINAL state — movers in the destination, the
 * member left behind untouched — which is exactly what this builds.
 *
 * Device-side proof of that behaviour (B2-R1/R2/R5) needs the app itself and is
 * parked with the mobile automation; this spec covers the office side.
 */
import { expect, test } from '@fixtures/base.fixture';
import { JOURNEY_B_FIXTURE as F } from '@data/journey-b/fixture';
import { buildCrewTimeInEnvelope, exportFileName, newRunPrefix } from '@utils/relay/exportEnvelope';
import { sendToRelay } from '@utils/relay/relayClient';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { verifyImportInOffice } from '@utils/api/officeVerification';

test.describe('B2 · Crew move and job change', { tag: ['@JourneyB', '@B2'] }, () => {
    test('[Crew Move] Deliver a post-move export and verify movers and the member left behind.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B2-001' },
            { type: 'requirement', description: 'B2-R6|B2-R7' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();
        const office = await seedOfficeFixture(sessionApi);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        const { xml, references } = buildCrewTimeInEnvelope({
            deviceAddress,
            prefix,
            cards: [
                // The movers, now in the destination field and job.
                ...F.present.map((employee) => ({
                    employeeCode: employee.code,
                    crewCode: F.crew.code,
                    ranchCode: F.ranch.code,
                    fieldCode: F.field2.code,
                    jobCode: F.job2.code,
                })),
                // Left behind: still the original field and job.
                {
                    employeeCode: F.absentee.code,
                    crewCode: F.crew.code,
                    ranchCode: F.ranch.code,
                    fieldCode: F.field.code,
                    jobCode: F.job.code,
                },
            ],
        });

        // One punch per crew member — a move reassigns, it never adds.
        expect(references).toHaveLength(F.present.length + 1);
        expect(xml).toContain(`<Field>${F.field2.code}</Field>`);
        expect(xml).toContain(`<Job>${F.job2.code}</Job>`);
        await testInfo.attach('device-export.xml', { body: xml, contentType: 'application/xml' });

        const fileName = exportFileName(prefix);
        const sent = await sendToRelay({
            url: process.env.DEVICE_RELAY_URL ?? '',
            from: deviceAddress,
            to: process.env.DEVICE_RELAY_SERVER ?? '',
            xml,
            fileName,
        });
        await testInfo.attach('relay-send.txt', {
            body: `file: ${fileName}\nsuccess: ${sent.success}\nstatus: ${sent.status}\n${sent.body}`,
            contentType: 'text/plain',
        });
        expect(sent.success, `relay rejected the export: ${sent.body}`).toBe(true);

        await verifyImportInOffice({
            sessionApi,
            pages,
            testInfo,
            xml,
            label: 'B2',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            expected: [
                ...F.present.map((employee) => ({
                    employeeCode: employee.code,
                    employeeId: office.employees.get(employee.code)!.id,
                    fieldId: office.field2.id,
                    jobId: office.job2.id,
                })),
                {
                    employeeCode: F.absentee.code,
                    employeeId: office.employees.get(F.absentee.code)!.id,
                    fieldId: office.field.id,
                    jobId: office.job.id,
                },
            ],
        });
    });
});
