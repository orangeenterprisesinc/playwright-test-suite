/**
 * Catalog workflow **B6 — Badge piece-out**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B6 |
 * | Plan | `test-plans/journey-b/b06-badge-piece-out.md` |
 * | Recording | `docs/media/journey-b/b06-badge-piece-out.mp4` |
 * | Jira | `PET-12644` (automation) / `WEBPET-1525` (manual) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B6-001` |
 *
 * Transport, not simulation, happy path only. The badge scan and the
 * badge→employee resolution are device-side — the `Piezas` screen resolves the
 * owner before the scan ever leaves the device (plan kf 9/13/21/93) — so what
 * reaches the office is a `PieceOut` row already carrying its employee via
 * `EmployeeSource: BarcodeBadge`. The in-range duplicate suppression is
 * device-side too and never reaches an envelope (`B6-R8`).
 *
 * The record carries no Ranch and no Field, mirroring the recording (kf 173),
 * which also rules out WEBPET-1409 Time-In synthesis structurally: that
 * PostSave hook returns early without a bound Field.
 *
 * That same shape is why `deliverAndVerifyCards` is not used — it asserts
 * `fieldCounter`/`ranchCounter` against caller-supplied ids unconditionally,
 * which would compare a field-less, ranch-less card against non-null values.
 * Like B5, this composes `createUploadContext` + `importDeviceExport` +
 * `findByReferences` + `cleanupCards` directly.
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
import { createUploadContext, importDeviceExport } from '@utils/api/connectivityImportApi';
import {
    CARD_TYPE,
    findByReferences,
    isoDay,
    listTimeCards,
    sweepFixtureCards,
    type OfficeTimeCard,
} from '@utils/api/timeCardsApi';
import { cleanupCards } from '@utils/api/officeVerification';

test.describe('B6 · Badge piece-out', { tag: ['@JourneyB', '@B6'] }, () => {
    test('Deliver a badge piece-out export and verify the office records one piece against the scanned employee', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B6-001' },
            { type: 'requirement', description: 'B6-R1|B6-R2|B6-R3|B6-R4|B6-R5|B6-R6|B6-R7' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        // The flag comes from PT_MODULES on the API task, which short-circuits the
        // TigerMaster query entirely (auth/modules.go:569-571) — TigerMaster already
        // licenses Piece Payment (moduleId 36), so /admin/tm cannot clear this gate.
        const meRes = await sessionApi.get('session/me');
        expect(meRes.ok(), `GET session/me failed with ${meRes.status()}`).toBe(true);
        const me = (await meRes.json()) as { modules?: Record<string, unknown> };
        const gateDescription =
            'Piece Payment is not licensed for this session. The value comes from the PT_MODULES env ' +
            'var on the dev API task (apps/api/internal/auth/modules.go:569-571), which replaces the ' +
            'TigerMaster lookup once set; PT_MODULES omits PiecePayment even though TigerMaster ' +
            'licenses it for client 1 (moduleId 36). Only adding PiecePayment to PT_MODULES unblocks ' +
            'this — an /admin/tm change cannot.';
        if (!(me.modules ?? {}).PiecePayment) {
            testInfo.annotations.push({ type: 'environment-gate', description: gateDescription });
        }
        expect((me.modules ?? {}).PiecePayment, gateDescription).toBeTruthy();

        const office = await seedOfficeFixture(sessionApi);
        // seedOfficeFixture only ensures F.present/F.absentee — the sticker
        // employees are ensured directly, as B4/B5 do.
        const emp6005 = await ensureEmployee(sessionApi, F.sticker[0]);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        const punchDate = punchDay(DAY_OFFSET.B6);
        const day = isoDay(punchDate);
        const gpsFix = '(34.970215,-120.453984)';

        // ── The one record the office receives: one badge scan, one piece ──
        const records: DeviceRecord[] = [
            {
                node: 'PieceOut',
                part: DEVICE_SCHEMA.referenceParts.pieceOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: F.sticker[0].code,
                crewCode: F.crew.code,
                jobCode: F.job.code,
                pieces: 1,
                gps: gpsFix,
                at: punchMoment(10, 13, punchDate),
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix, records });

        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.PieceOut}${DEVICE_SCHEMA.recordsSuffix}`);
        expect(references[0]).toContain(`-${DEVICE_SCHEMA.referenceParts.pieceOut}-`);
        expect(xml).toContain(`<${DEVICE_SCHEMA.tags.numOfPieces}>1</${DEVICE_SCHEMA.tags.numOfPieces}>`);
        const barcodeSourceTag =
            `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.barcodeBadge}` +
            `</${DEVICE_SCHEMA.tags.employeeSource}>`;
        expect(xml.split(barcodeSourceTag).length - 1, 'exactly one BarcodeBadge employee-source tag').toBe(1);
        expect(xml, 'sample fidelity: PieceOut derives from PieceOutDate+PieceOutTime, no CardType tag').not.toContain(
            `<${DEVICE_SCHEMA.tags.cardType}>`,
        );
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

        // An import whose poll timed out still lands its rows minutes later, so a
        // leftover would give this run a second card for the same employee-day.
        const swept = await sweepFixtureCards(sessionApi, {
            employeeIds: [emp6005.id],
            day,
            cardTypes: [CARD_TYPE.timeOut, CARD_TYPE.timeIn],
        });
        if (swept.removed || swept.failed) {
            testInfo.annotations.push({
                type: 'pre-run-sweep',
                description:
                    `Removed ${swept.removed} leftover punch(es) for this fixture on ${day} ` +
                    `(${swept.failed} could not be deleted).`,
            });
        }

        const upload = await createUploadContext();
        let run;
        try {
            run = await importDeviceExport(upload, xml, { fileName: `FromDevice-B6-${Date.now()}.xml` });
        } finally {
            await upload.dispose();
        }
        await testInfo.attach('import-run-B6.json', {
            body: JSON.stringify(run, null, 2),
            contentType: 'application/json',
        });
        expect(run.status, `import run ${run.runId}: ${JSON.stringify(run.files)}`).toBe('completed');

        let cards: OfficeTimeCard[] = [];
        try {
            cards = await findByReferences(sessionApi, [references[0]], {
                from: day,
                to: day,
                cardType: CARD_TYPE.timeOut,
                timeoutMs: Number(process.env.IMPORT_POLL_TIMEOUT_MS ?? '') || 120_000,
            });
            expect(cards, 'the imported piece-out card').toHaveLength(1);
            const card = cards[0];

            // Ids, never merely "not null": an unresolved code walks a nine-rung
            // fallback ladder that can land on a same-named or Undefined employee.
            expect(card.employeeCounter, 'B6-R1').toBe(emp6005.id);
            expect(Number(card.numOfPieces), 'B6-R2').toBe(1);
            expect(card.cardType, 'B6-R3').toBe(CARD_TYPE.timeOut);
            expect(card.reference, 'B6-R4').toBe(references[0]);
            // The office's own rendering of EmployeeSource, confirmed against dev
            // 2026-08-27 and matching the recording's grid cell (kf 127).
            expect(String(card.employeeSourceText ?? ''), 'B6-R5').toBe('Barcode Badge');
            await testInfo.attach('employee-source-text-B6.txt', {
                body: String(card.employeeSourceText ?? ''),
                contentType: 'text/plain',
            });
            expect(card.crewCounter, 'B6-R6 crew').toBe(office.crew.id);
            expect(card.jobCounter, 'B6-R6 job').toBe(office.job.id);
            expect(String(card.gpsReading ?? ''), 'B6-R7').toBe(gpsFix);

            // WEBPET-1409 cannot fire without a bound Field; asserted so a later
            // preference or envelope change cannot leave an orphan behind.
            const timeInCards = await listTimeCards(sessionApi, { from: day, to: day, cardType: CARD_TYPE.timeIn });
            expect(
                timeInCards.filter((c) => Number(c.employeeCounter) === emp6005.id),
                'no synthesized Time-In for the scanned employee',
            ).toHaveLength(0);

            // ── The grid half of B6-R3/B6-R5. analyzeEnabled() reads an error
            // banner on this screen, so it can only be consulted once we are on it.
            await pages.leftNav.navigate();
            await pages.leftNav.openViaMenu(['Transfer to Job Cards'], '/transfer-to-job-cards');
            await pages.transferToJobCards.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });

            if (await pages.transferToJobCards.analyzeEnabled()) {
                await pages.transferToJobCards.applyDateRange(punchDate);
                await pages.transferToJobCards.waitForCandidates(1);
                const row = pages.transferToJobCards.rowCells(card.timeCardCounter);
                await expect(row, 'B6-R3: grid Type column').toContainText('Piece Out');
                await expect(row, 'B6-R5: grid Employee Selection column').toContainText('Barcode Badge');
            } else {
                testInfo.annotations.push({
                    type: 'transfer-grid-not-asserted',
                    description:
                        'The Transfer to Job Cards grid is populated by POST /transfer-to-job-cards/analyze, ' +
                        'which is disabled on this server (PT_TRANSFER_ANALYZE_ENABLED). The API-level ' +
                        'assertions above still ran.',
                });
            }
            await testInfo.attach('transfer-to-job-cards-B6.png', {
                body: await pages.transferToJobCards.screenshot(),
                contentType: 'image/png',
            });
        } finally {
            await cleanupCards(sessionApi, cards, testInfo);
        }
    });
});
