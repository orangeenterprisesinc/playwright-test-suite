/**
 * Catalog workflow **B3 — Individual time-in and duplicate-range correction**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B3 |
 * | Plan | `test-plans/journey-b/b03-individual-time-in.md` |
 * | Recording | `docs/media/journey-b/b03-individual-time-in.mp4` |
 * | Jira | `WEBPET-1522` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B3-001` |
 *
 * Transport, not simulation, happy path only. The duplicate-range correction
 * itself happens on the device before sync — not automatable via XML — so the
 * envelope carries only the two records the office ever receives: the corrected
 * 10:37 punch and the new 10:40 punch, both badge Time In records for one employee.
 */
import { expect, test } from '@fixtures/base.fixture';
import { JOURNEY_B_FIXTURE as F, DAY_OFFSET, punchDay } from '@data/journey-b/fixture';
import {
    buildEnvelope,
    DEVICE_SCHEMA,
    exportFileName,
    newRunPrefix,
    punchMoment,
    type DeviceRecord,
} from '@utils/relay/exportEnvelope';
import { sendToRelay } from '@utils/relay/relayClient';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { verifyImportInOffice } from '@utils/api/officeVerification';

test.describe('B3 · Individual time-in and duplicate-range correction', { tag: ['@JourneyB', '@B3'] }, () => {
    test('[Individual Time In] Deliver an individual time-in export with a corrected and a new record and verify both punches.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B3-001' },
            { type: 'requirement', description: 'B3-R1|B3-R2' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        const office = await seedOfficeFixture(sessionApi);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        // B1/B2/B3 must never share an employee-day under `workers=2`.
        const punchDate = punchDay(DAY_OFFSET.B3);
        const gpsFix = '(36.8076638,-119.8348287)';
        const employee = F.present[0];

        // ── The two records the office receives after the device-side correction ──
        const records: DeviceRecord[] = [
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: employee.code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(10, 37, punchDate),
                gps: gpsFix,
            },
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: employee.code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field2.code,
                jobCode: F.job2.code,
                at: punchMoment(10, 40, punchDate),
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix, records });

        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
        const barcodeSourceTag =
            `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.barcodeBadge}` +
            `</${DEVICE_SCHEMA.tags.employeeSource}>`;
        expect(xml.split(barcodeSourceTag).length - 1, 'two BarcodeBadge sources').toBe(2);
        for (const reference of references) {
            expect(reference).toContain(`-${DEVICE_SCHEMA.referenceParts.timeIn}-`);
        }
        expect(xml, 'sample fidelity: TimeIn derives from DateIn+TimeIn, no CardType tag').not.toContain(
            `<${DEVICE_SCHEMA.tags.cardType}>`,
        );
        const gpsCount = xml.split(`<${DEVICE_SCHEMA.tags.gpsReading}>`).length - 1;
        expect(gpsCount, 'exactly one record carries a GPS fix').toBe(1);
        expect(references).toHaveLength(records.length);
        await testInfo.attach('device-export.xml', { body: xml, contentType: 'application/xml' });

        // ── Delivery: the same POST /UploadFile the app makes ──
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

        // ── The office: import, then the Transfer to Job Cards screen (B1/B2 pattern) ──
        const employeeId = office.employees.get(employee.code)!.id;
        await verifyImportInOffice({
            sessionApi,
            pages,
            testInfo,
            xml,
            label: 'B3',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            punchDate,
            expected: [
                {
                    employeeCode: employee.code,
                    employeeId,
                    reference: references[0],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                    ranchName: F.ranch.name,
                    fieldName: F.field.name,
                    jobName: F.job.name,
                    employeeName: employee.name,
                    crewName: F.crew.name,
                    gps: gpsFix,
                },
                {
                    employeeCode: employee.code,
                    employeeId,
                    reference: references[1],
                    fieldId: office.field2.id,
                    jobId: office.job2.id,
                },
            ],
        });
    });
});
