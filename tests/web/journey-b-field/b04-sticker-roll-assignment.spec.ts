/**
 * Catalog workflow **B4 — Sticker-roll assignment at day start**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B4 |
 * | Plan | `test-plans/journey-b/b04-sticker-roll-assignment.md` |
 * | Recording | `docs/media/journey-b/b04-sticker-roll-assignment.mp4` |
 * | Jira | `WEBPET-1523` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B4-001` |
 *
 * Transport, not simulation, happy path only. The recording never opens the
 * catalog's dedicated "assign the roll" screen — Amy sets the roll from the
 * Time In screen's First Roll Code field, so what reaches the office is an
 * ordinary individual Time In record whose TraceabilityCode is the roll's
 * first sticker (plan's "What the recording actually shows" note). The
 * catalog's pack-house-line variation (B4-R6/R7/R8) is withheld pending a
 * product defect — see the note at the end of the test.
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
import { ensureEmployee } from '@utils/api/setupEntitiesApi';
import { verifyImportInOffice } from '@utils/api/officeVerification';
import { getCodeHistory } from '@utils/api/stickerRollApi';

test.describe('B4 · Sticker-roll assignment at day start', { tag: ['@JourneyB', '@B4'] }, () => {
    test('[Sticker Roll] Deliver individual time-in records carrying sticker-roll codes, verify each roll is stored against its own employee, and that the import writes no code-history row.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B4-001' },
            { type: 'requirement', description: 'B4-R1|B4-R2|B4-R3|B4-R9' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        const office = await seedOfficeFixture(sessionApi);
        // seedOfficeFixture only ensures F.present/F.absentee — the sticker
        // employees are B4's own, so they're ensured directly here.
        const emp6005 = await ensureEmployee(sessionApi, F.sticker[0]);
        const emp6006 = await ensureEmployee(sessionApi, F.sticker[1]);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        const punchDate = punchDay(DAY_OFFSET.B4);
        // Run-unique, in the shape the recording shows ("B7" + digits) — the
        // EmployeeCodeHistory identity has no delete endpoint, so a fixed code
        // here would collide across runs (unlike the phase-2 roll, below).
        const rollBase = Date.now().toString().slice(-8);
        const roll6005 = `B7${rollBase}5`;
        const roll6006 = `B7${rollBase}6`;

        // ── Phase 1: individual Time In records, one per sticker employee ──
        const records: DeviceRecord[] = [
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: F.sticker[0].code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(6, 0, punchDate),
                traceabilityCode: roll6005,
            },
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: F.sticker[1].code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(6, 0, punchDate),
                traceabilityCode: roll6006,
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix, records });

        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
        const barcodeSourceTag =
            `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.barcodeBadge}` +
            `</${DEVICE_SCHEMA.tags.employeeSource}>`;
        expect(xml.split(barcodeSourceTag).length - 1, 'one BarcodeBadge source per employee').toBe(
            records.length,
        );
        // B4-R2/B4-R3: each roll code is present verbatim and distinct per employee.
        expect(roll6005).not.toBe(roll6006);
        for (const roll of [roll6005, roll6006]) {
            expect(xml).toContain(
                `<${DEVICE_SCHEMA.tags.traceabilityCode}>${roll}</${DEVICE_SCHEMA.tags.traceabilityCode}>`,
            );
        }
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

        // ── Bracket the import with code-history snapshots for both employees ──
        // (B4-R9: the import must create or modify none — only phase 2 legitimately
        // writes a history row, and that happens after this bracket closes.)
        const employeeIds = [emp6005.id, emp6006.id];
        const historyBefore = await Promise.all(employeeIds.map((id) => getCodeHistory(sessionApi, id)));

        // ── The office: import, then the Transfer to Job Cards screen (B1/B2/B3 pattern) ──
        await verifyImportInOffice({
            sessionApi,
            pages,
            testInfo,
            xml,
            label: 'B4',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            punchDate,
            expected: [
                {
                    employeeCode: F.sticker[0].code,
                    employeeId: emp6005.id,
                    reference: references[0],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                    ranchName: F.ranch.name,
                    fieldName: F.field.name,
                    jobName: F.job.name,
                    employeeName: F.sticker[0].name,
                    crewName: F.crew.name,
                    traceabilityCode: roll6005,
                },
                {
                    employeeCode: F.sticker[1].code,
                    employeeId: emp6006.id,
                    reference: references[1],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                    traceabilityCode: roll6006,
                },
            ],
        });

        const historyAfter = await Promise.all(employeeIds.map((id) => getCodeHistory(sessionApi, id)));
        expect(historyAfter, 'B4-R9: the import must not create or modify any code-history row').toEqual(
            historyBefore,
        );

        // Phase 2 (the pack-house-line variation, B4-R6/R7/R8) is withheld: dev
        // proved POST /scan/assign-barcode-roll never takes its documented
        // `alreadyAssigned` no-op branch — a repeat of an identical assignment
        // inserts a duplicate row whose identifying columns (EmployeeCounter,
        // AlternateCode, StartDateTime=null) match the first exactly. With no
        // delete endpoint for EmployeeCodeHistory, running it would leak one
        // undeletable row per run. Verified on dev 2026-08-26: two identical calls
        // both returned "inserted". See the B4 plan's Cleanup section.

        // No cleanup call here: verifyImportInOffice deletes the time cards in
        // its own finally block, and the import creates nothing else (B4-R9).
    });
});
