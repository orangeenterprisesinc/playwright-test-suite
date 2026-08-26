/**
 * Catalog workflow **B5 — Sticker piece-out**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B5 |
 * | Plan | `test-plans/journey-b/b05-sticker-piece-out.md` |
 * | Recording | `docs/media/journey-b/b05-sticker-piece-out.mp4` |
 * | Jira | `PET-12643` (automation) / `WEBPET-1524` (manual) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B5-001` |
 *
 * Transport, not simulation — the sticker-to-employee lookup is device-side (the
 * `Piezas` screen resolves the owner before the scan ever leaves the device), so
 * what reaches the office is a `PieceOut` row that already carries its employee
 * via `EmployeeSource: AlternateCode`. The plan's Planner resolution (N2) proved
 * rung 1 of the importer's FK ladder accepts that value directly — no
 * `EmployeeCodeHistory` seeding, no residue.
 *
 * `deliverAndVerifyCards` / `verifyImportInOffice` assume one cardType and one
 * reference per expected card, which B5 breaks (a Time In plus three Piece Outs,
 * two cardTypes) — see the plan's "Structure note for the Generator". This spec
 * composes `importDeviceExport` + `findByReferences` + `sweepFixtureCards` +
 * `cleanupCards` directly instead, with no UI: the imported rows carry no job, so
 * the Transfer to Job Cards screen shows nothing meaningful for them (plan's
 * "Screens and page objects").
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
    sweepFixtureCards,
    type OfficeTimeCard,
} from '@utils/api/timeCardsApi';
import { cleanupCards } from '@utils/api/officeVerification';

/**
 * The analyze response schema is not pinned by the plan (N5: server-side only,
 * no UI probe reaches it) — this walks whatever shape comes back looking for a
 * string value starting with the EARS-mandated text, so the assertion is exact
 * about the message while staying tolerant of the surrounding envelope.
 */
function collectJobCounterIssues(node: unknown, matches: unknown[] = []): unknown[] {
    if (Array.isArray(node)) {
        for (const item of node) collectJobCounterIssues(item, matches);
    } else if (node && typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) {
            if (typeof value === 'string' && /^JobCounter is required/.test(value)) {
                matches.push(node);
            } else {
                collectJobCounterIssues(value, matches);
            }
        }
    }
    return matches;
}

test.describe('B5 · Sticker piece-out', { tag: ['@JourneyB', '@B5'] }, () => {
    test('Deliver sticker piece-out records and verify attribution, totals and the Undefined-Employee fallback', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B5-001' },
            { type: 'requirement', description: 'B5-R1|B5-R2|B5-R3|B5-R4|B5-R5|B5-R6|B5-R7' },
        ],
    }, async ({ sessionApi }, testInfo) => {
        test.slow();

        // ── N6: Piece Payment / Traceability - Stickers must be licensed — never test.skip() ──
        const meRes = await sessionApi.get('session/me');
        expect(meRes.ok(), `GET session/me failed with ${meRes.status()}`).toBe(true);
        const me = (await meRes.json()) as { modules?: Record<string, unknown> };
        const modules = me.modules ?? {};
        const requiredModules: Array<{ key: string; description: string }> = [
            { key: 'PiecePayment', description: 'Piece Payment unlicensed on dev client' },
            { key: 'LabelTraceability', description: 'Traceability - Stickers unlicensed on dev client' },
        ];
        for (const { key, description } of requiredModules) {
            if (!modules[key]) {
                testInfo.annotations.push({ type: 'environment-gate', description });
            }
            expect(modules[key], description).toBeTruthy();
        }

        const office = await seedOfficeFixture(sessionApi);
        // seedOfficeFixture only ensures F.present/F.absentee — B5's sticker
        // employee is its own, per the B4 pattern.
        const emp6006 = await ensureEmployee(sessionApi, F.sticker[1]);

        const prefsRes = await sessionApi.get('preferences');
        expect(prefsRes.ok(), `GET preferences failed with ${prefsRes.status()}`).toBe(true);
        const preferences = (await prefsRes.json()) as { undefinedEmployee?: unknown };
        const undefinedEmployeeId = Number(preferences.undefinedEmployee);
        expect(
            Number.isFinite(undefinedEmployeeId),
            `preferences.undefinedEmployee must be set: ${JSON.stringify(preferences)}`,
        ).toBe(true);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        const punchDate = punchDay(DAY_OFFSET.B5);
        const day = isoDay(punchDate);
        // Run-unique, "B7" + digits (the recording's shape) — same rationale as
        // B4's roll codes: a fixed sticker would blur one run's rows into the next.
        const stickerBase = Date.now().toString().slice(-8);
        const stickerA = `B7${stickerBase}1`;
        const stickerB = `B7${stickerBase}2`;
        const stickerC = `B7${stickerBase}3`;
        // Resolves to no employee (B5-R6) — anonymous-worker rungs are off on dev.
        const unresolvableEmployeeCode = '9999999';

        // ── The envelope: one seeding Time In, two 6006 piece-outs, one unresolvable ──
        const records: DeviceRecord[] = [
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
            },
            {
                node: 'PieceOut',
                part: DEVICE_SCHEMA.referenceParts.pieceOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                employeeCode: F.sticker[1].code,
                crewCode: F.crew.code,
                pieces: 1,
                traceabilityCode: stickerA,
                at: punchMoment(14, 27, punchDate),
            },
            {
                node: 'PieceOut',
                part: DEVICE_SCHEMA.referenceParts.pieceOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                employeeCode: F.sticker[1].code,
                crewCode: F.crew.code,
                pieces: 1,
                traceabilityCode: stickerB,
                at: punchMoment(14, 28, punchDate),
            },
            {
                node: 'PieceOut',
                part: DEVICE_SCHEMA.referenceParts.pieceOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                employeeCode: unresolvableEmployeeCode,
                crewCode: F.crew.code,
                pieces: 1,
                traceabilityCode: stickerC,
                at: punchMoment(14, 28, punchDate),
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix, records });

        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.PieceOut}${DEVICE_SCHEMA.recordsSuffix}`);
        const alternateCodeTag =
            `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.alternateCode}` +
            `</${DEVICE_SCHEMA.tags.employeeSource}>`;
        expect(xml.split(alternateCodeTag).length - 1, 'one AlternateCode source per piece-out').toBe(3);
        for (const sticker of [stickerA, stickerB, stickerC]) {
            expect(xml).toContain(
                `<${DEVICE_SCHEMA.tags.traceabilityCode}>${sticker}</${DEVICE_SCHEMA.tags.traceabilityCode}>`,
            );
        }
        expect(
            xml.split(`<${DEVICE_SCHEMA.tags.numOfPieces}>1</${DEVICE_SCHEMA.tags.numOfPieces}>`).length - 1,
            'one piece per piece-out record',
        ).toBe(3);
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

        // ── Pre-run sweep: clear leftover fixture punches before this run adds its own ──
        const swept = await sweepFixtureCards(sessionApi, {
            employeeIds: [emp6006.id, undefinedEmployeeId],
            day,
            cardTypes: [CARD_TYPE.timeIn, CARD_TYPE.timeOut],
        });
        if (swept.removed || swept.failed) {
            testInfo.annotations.push({
                type: 'pre-run-sweep',
                description:
                    `Removed ${swept.removed} leftover punch(es) for this fixture on ${day} ` +
                    `(${swept.failed} could not be deleted).`,
            });
        }

        // ── Import via the single-folder transport (the importer-contract path) ──
        const upload = await createUploadContext();
        let run;
        try {
            run = await importDeviceExport(upload, xml, { fileName: `FromDevice-B5-${Date.now()}.xml` });
        } finally {
            await upload.dispose();
        }
        await testInfo.attach('import-run-B5.json', {
            body: JSON.stringify(run, null, 2),
            contentType: 'application/json',
        });
        expect(run.status, `import run ${run.runId}: ${JSON.stringify(run.files)}`).toBe('completed');

        const pollOpts = { from: day, to: day, timeoutMs: Number(process.env.IMPORT_POLL_TIMEOUT_MS ?? '') || 120_000 };
        let tiCards: OfficeTimeCard[] = [];
        let poCards: OfficeTimeCard[] = [];
        try {
            tiCards = await findByReferences(sessionApi, [references[0]], { ...pollOpts, cardType: CARD_TYPE.timeIn });
            expect(tiCards, 'the seeding Time In card').toHaveLength(1);
            const tiCard = tiCards[0];
            expect(tiCard.employeeCounter).toBe(emp6006.id);
            expect(tiCard.crewCounter).toBe(office.crew.id);
            expect(tiCard.ranchCounter).toBe(office.ranch.id);
            expect(tiCard.fieldCounter).toBe(office.field.id);
            expect(tiCard.jobCounter).toBe(office.job.id);
            expect(tiCard.programCreated).toBe(true);

            poCards = await findByReferences(sessionApi, references.slice(1), { ...pollOpts, cardType: CARD_TYPE.timeOut });
            expect(poCards, 'three piece-out cards').toHaveLength(3);

            const byReference = new Map(poCards.map((c) => [String(c.reference ?? ''), c]));
            const stickerACard = byReference.get(references[1]);
            const stickerBCard = byReference.get(references[2]);
            const stickerCCard = byReference.get(references[3]);
            expect(stickerACard, `no imported piece-out card for reference ${references[1]}`).toBeDefined();
            expect(stickerBCard, `no imported piece-out card for reference ${references[2]}`).toBeDefined();
            expect(stickerCCard, `no imported piece-out card for reference ${references[3]}`).toBeDefined();

            // B5-R1/B5-R4: both 6006 piece cards attribute to 6006's id, pieces total 2.
            expect(stickerACard!.employeeCounter).toBe(emp6006.id);
            expect(stickerBCard!.employeeCounter).toBe(emp6006.id);
            expect(
                Number(stickerACard!.numOfPieces) + Number(stickerBCard!.numOfPieces),
                'B5-R4: pieces total across the two scans',
            ).toBe(2);

            // B5-R6: id equality, never merely non-null — the fallback ladder can
            // land on a wrong-but-non-null employee.
            expect(stickerCCard!.employeeCounter).toBe(undefinedEmployeeId);

            // B5-R2/R3/R5/R7: shared shape for every piece card.
            const pieceCards: Array<[OfficeTimeCard, string]> = [
                [stickerACard!, stickerA],
                [stickerBCard!, stickerB],
                [stickerCCard!, stickerC],
            ];
            for (const [card, sticker] of pieceCards) {
                expect(String(card.traceabilityCode ?? ''), 'B5-R2: sticker stored verbatim').toBe(sticker);
                expect(card.jobCounter, 'B5-R7: no job carried through').toBeNull();
                expect(card.cardType, 'B5-R5: piece-out imports as cardType 0').toBe(CARD_TYPE.timeOut);
                expect(
                    String(card.employeeSourceText ?? ''),
                    'N1: sticker source renders "Sticker Code"',
                ).toBe('Sticker Code');
                expect(card.programCreated).toBe(true);
            }

            // ── B5-R7: the missing-job exception, from the same endpoint that feeds
            // both the Transfer screen and the Time Cards Exceptions panel ──
            const analyzeRes = await sessionApi.post('transfer-to-job-cards/analyze', {
                data: { from: day, to: day },
            });
            expect(analyzeRes.ok(), `POST transfer-to-job-cards/analyze failed with ${analyzeRes.status()}`).toBe(true);
            const analyze = await analyzeRes.json();
            await testInfo.attach('transfer-to-job-cards-analyze-B5.json', {
                body: JSON.stringify(analyze, null, 2),
                contentType: 'application/json',
            });

            const jobCounterIssues = collectJobCounterIssues(analyze);
            expect(
                jobCounterIssues.length,
                `no issue matching /^JobCounter is required/ in ${JSON.stringify(analyze)}`,
            ).toBeGreaterThan(0);
            const issuesText = JSON.stringify(jobCounterIssues);
            const importedPieceReferences = [references[1], references[2], references[3]];
            expect(
                importedPieceReferences.some((ref) => issuesText.includes(ref)),
                `B5-R7: the missing-job issue must attribute to this run's piece-out references: ${issuesText}`,
            ).toBe(true);
        } finally {
            // Never leave punches on shared dev data, pass or fail — including the
            // Undefined-Employee card.
            await cleanupCards(sessionApi, [...tiCards, ...poCards], testInfo);
        }
    });
});
