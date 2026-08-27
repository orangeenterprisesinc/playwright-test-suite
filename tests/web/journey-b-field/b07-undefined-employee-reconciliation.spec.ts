/**
 * Catalog workflow **B7 — Undefined-employee reconciliation**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B7 |
 * | Plan | `test-plans/journey-b/b07-undefined-employee-reconciliation.md` |
 * | Recording | `docs/media/journey-b/b07-undefined-employee-reconciliation.mp4` |
 * | Jira | `PET-12645` (automation) / `WEBPET-1526` (manual) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B7-001` |
 *
 * Transport, not simulation — and the one workflow where the OFFICE does the
 * attributing. In B5 the device resolves the sticker to its owner and exports
 * an employee, so the office does nothing clever. In B7 the scanning device
 * holds no roll assignment, so it exports the sticker PREFIX itself as
 * `<Employee>`, and the office joins that prefix to `EmployeeCodeHistory`
 * within the piece-out's own day (the WEBPET-1410 rule) — one prefix matches
 * its assignment, the other falls back to the configured Undefined Employee.
 * `verifyImportInOffice`/`deliverAndVerifyCards` assume one cardType and
 * derive their poll set from every reference in the export, which would also
 * poll for the code-history grid's own `CH` reference — a row that never
 * becomes a time card — so this spec composes the import and poll directly,
 * as B5 does.
 */
import { expect, test } from '@fixtures/base.fixture';
import { JOURNEY_B_FIXTURE as F, DAY_OFFSET, punchDay } from '@data/journey-b/fixture';
import {
    buildEnvelope,
    DEVICE_SCHEMA,
    exportFileName,
    newRunPrefix,
    punchMoment,
    type CodeHistoryAssignment,
    type DeviceRecord,
} from '@utils/relay/exportEnvelope';
import { sendToRelay } from '@utils/relay/relayClient';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { ensureEmployee } from '@utils/api/setupEntitiesApi';
import { getCodeHistory } from '@utils/api/stickerRollApi';
import { createUploadContext, importDeviceExport } from '@utils/api/connectivityImportApi';
import {
    CARD_TYPE,
    findByReferences,
    isoDay,
    sweepFixtureCards,
    type OfficeTimeCard,
} from '@utils/api/timeCardsApi';
import { cleanupCards } from '@utils/api/officeVerification';

test.describe('B7 · Undefined-employee reconciliation', { tag: ['@JourneyB', '@B7'] }, () => {
    test('Deliver a roll assignment and employee-less sticker piece-outs, and verify the assigned prefix attributes to its owner while the unassigned one falls to the Undefined Employee', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B7-001' },
            { type: 'requirement', description: 'B7-R1|B7-R2|B7-R3|B7-R4|B7-R5|B7-R6|B7-R7|B7-R8' },
        ],
    }, async ({ sessionApi }, testInfo) => {
        test.slow();

        // ── Data — prefixes derived so the office's own extraction (empStartLoc=1,
        // rollStartLoc=8) reproduces the value this test sends, like-for-like ──
        const runPrefix = newRunPrefix();
        const assignedPrefix = `B7A${runPrefix}`;
        const unassignedPrefix = `B7U${runPrefix}`;
        const assignedRoll = `${assignedPrefix}0001`;
        const assignedSticker = `${assignedPrefix}0002`;
        const unassignedSticker = `${unassignedPrefix}0001`;

        expect(assignedPrefix, 'the office extracts code[0..7) as the alternate code').toBe(
            assignedSticker.slice(0, 7),
        );
        expect(assignedSticker).toHaveLength(11);
        expect(unassignedSticker).toHaveLength(11);

        const punchDate = punchDay(DAY_OFFSET.B7);
        const day = isoDay(punchDate);
        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';

        // ── Environment gates — B7's sticker rule is inert until both land (N1, N3) ──
        const meRes = await sessionApi.get('session/me');
        const me = (await meRes.json()) as { modules?: Record<string, unknown> };
        const modules = me.modules ?? {};
        expect.soft(modules.PiecePayment, 'PiecePayment module must be licensed').toBeTruthy();
        if (!modules.PiecePayment) {
            testInfo.annotations.push({
                type: 'environment-gate',
                description:
                    'PiecePayment absent from PT_MODULES on the dev API task; /admin/tm cannot ' +
                    'license it (B6 precedent) — DevOps env change required',
            });
        }
        expect.soft(modules.LabelTraceability, 'LabelTraceability module must be licensed').toBeTruthy();
        if (!modules.LabelTraceability) {
            testInfo.annotations.push({
                type: 'environment-gate',
                description:
                    'LabelTraceability absent from PT_MODULES on the dev API task; /admin/tm cannot ' +
                    'license it (B6 precedent) — DevOps env change required',
            });
        }

        const prefRes = await sessionApi.get('preferences');
        const preferences = (await prefRes.json()) as Record<string, unknown>;
        expect.soft(preferences.employeeCodeStartLocation, 'employeeCodeStartLocation').toBe(1);
        expect.soft(preferences.rollCodeStartLocation, 'rollCodeStartLocation').toBe(8);
        if (preferences.employeeCodeStartLocation !== 1 || preferences.rollCodeStartLocation !== 8) {
            testInfo.annotations.push({
                type: 'environment-gate',
                description:
                    'label-tracking start locations are 0/0 on dev — the office extracts an empty ' +
                    'prefix and the WEBPET-1410 sticker rule is inert; an operator must PUT ' +
                    '/preferences employeeCodeStartLocation=1, rollCodeStartLocation=8. This spec reads ' +
                    'and gates, never writes, and must never send assignRollsDaily (flipping it true ' +
                    'clears every Employee.AlternateCode).',
            });
        }

        expect(
            testInfo.errors,
            'environment gates above must pass before B7 can exercise the sticker rule',
        ).toHaveLength(0);

        // Precondition, not a gate: 0 means the importer binds nothing and the
        // card's employee stays NULL.
        const undefinedEmployeeId = Number(preferences.undefinedEmployee);
        expect(
            Number.isFinite(undefinedEmployeeId) && undefinedEmployeeId > 0,
            'preferences.undefinedEmployee must be configured',
        ).toBe(true);

        // ── Seed ──
        const office = await seedOfficeFixture(sessionApi);
        // seedOfficeFixture only ensures F.present/F.absentee — the sticker
        // employee is B7's own.
        const emp6007 = await ensureEmployee(sessionApi, F.sticker[2]);

        // ── Envelope: one Time In carrying a roll assignment (device A's shape),
        // then two employee-less piece-outs (device B's shape) ──
        const records: DeviceRecord[] = [
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: F.sticker[2].code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                traceabilityCode: assignedRoll,
                at: punchMoment(6, 30, punchDate),
            },
            {
                node: 'PieceOut',
                part: DEVICE_SCHEMA.referenceParts.pieceOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                employeeCode: unassignedPrefix,
                crewCode: F.crew.code,
                pieces: 1,
                traceabilityCode: unassignedSticker,
                at: punchMoment(12, 16, punchDate),
            },
            {
                node: 'PieceOut',
                part: DEVICE_SCHEMA.referenceParts.pieceOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                employeeCode: assignedPrefix,
                crewCode: F.crew.code,
                pieces: 1,
                traceabilityCode: assignedSticker,
                at: punchMoment(12, 17, punchDate),
            },
        ];

        const codeHistory: CodeHistoryAssignment[] = [
            {
                employeeCode: F.sticker[2].code,
                scannedCode: assignedRoll,
                alternateCode: assignedPrefix,
                firstCode: '0001',
                at: punchMoment(6, 30, punchDate),
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix: runPrefix, records, codeHistory });

        // ── XML shape, built from DEVICE_SCHEMA — never a raw tag literal ──
        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.PieceOut}${DEVICE_SCHEMA.recordsSuffix}`);

        const employeeRecordsTag = `${DEVICE_SCHEMA.grid.employee}${DEVICE_SCHEMA.recordsSuffix}`;
        expect(xml).toContain(
            `<${employeeRecordsTag} ${DEVICE_SCHEMA.attributes.lookupContents}="${DEVICE_SCHEMA.grid.lookupEmployeeByCode}"`,
        );
        const historyRecordsTag = `${DEVICE_SCHEMA.grid.employeeCodeHistory}${DEVICE_SCHEMA.recordsSuffix}`;
        expect(xml).toContain(
            `<${historyRecordsTag} ${DEVICE_SCHEMA.attributes.lookupContents}="${DEVICE_SCHEMA.grid.lookupAddOnlyGrid}"`,
        );
        expect(xml).toContain(
            `<${DEVICE_SCHEMA.grid.tags.alternateCode}>${assignedPrefix}</${DEVICE_SCHEMA.grid.tags.alternateCode}>`,
        );

        expect(xml).toContain(`<${DEVICE_SCHEMA.tags.employee}>${assignedPrefix}</${DEVICE_SCHEMA.tags.employee}>`);
        expect(xml).toContain(
            `<${DEVICE_SCHEMA.tags.employee}>${unassignedPrefix}</${DEVICE_SCHEMA.tags.employee}>`,
        );

        const alternateCodeSourceTag =
            `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.alternateCode}` +
            `</${DEVICE_SCHEMA.tags.employeeSource}>`;
        expect(
            xml.split(alternateCodeSourceTag).length - 1,
            'exactly two AlternateCode-sourced piece-outs',
        ).toBe(2);

        const numOfPiecesTag = `<${DEVICE_SCHEMA.tags.numOfPieces}>1</${DEVICE_SCHEMA.tags.numOfPieces}>`;
        expect(xml.split(numOfPiecesTag).length - 1, 'exactly two single-piece piece-outs').toBe(2);

        // The CH assignment gets its own reference internally but is deliberately
        // kept out of the card-identity list — a code-history row is never a card.
        expect(references, 'one reference per card, the CH reference excluded').toHaveLength(3);

        await testInfo.attach('device-export.xml', { body: xml, contentType: 'application/xml' });

        // ── Delivery: the same POST /UploadFile the app makes ──
        const fileName = exportFileName(runPrefix);
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

        // Clear any leftover fixture punches for this day before importing — an
        // orphan from an earlier run's late import would otherwise flip the
        // office's duplicate-Time-In rule to Blocking for this one.
        const swept = await sweepFixtureCards(sessionApi, {
            employeeIds: [emp6007.id, undefinedEmployeeId],
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

        // ── Import, composed directly: verifyImportInOffice/deliverAndVerifyCards
        // assume one cardType and derive their poll set from every reference in
        // the export, which would also chase the grid's own CH reference — a row
        // that never becomes a time card, so the poll would never terminate ──
        let tiCards: OfficeTimeCard[] = [];
        let poCards: OfficeTimeCard[] = [];
        try {
            const upload = await createUploadContext();
            let run;
            try {
                run = await importDeviceExport(upload, xml, { fileName: `FromDevice-B7-${Date.now()}.xml` });
            } finally {
                await upload.dispose();
            }
            await testInfo.attach('import-run-B7.json', {
                body: JSON.stringify(run, null, 2),
                contentType: 'application/json',
            });
            expect(run.status, `import run ${run.runId}: ${JSON.stringify(run.files)}`).toBe('completed');

            const pollOpts = {
                from: day,
                to: day,
                timeoutMs: Number(process.env.IMPORT_POLL_TIMEOUT_MS ?? '') || 120_000,
            };

            tiCards = await findByReferences(sessionApi, [references[0]], {
                ...pollOpts,
                cardType: CARD_TYPE.timeIn,
            });
            expect(tiCards, "the Time In card, keyed by device A's own reference").toHaveLength(1);
            const tiCard = tiCards[0];
            expect(tiCard.employeeCounter).toBe(emp6007.id);
            expect(tiCard.crewCounter).toBe(office.crew.id);
            expect(tiCard.ranchCounter).toBe(office.ranch.id);
            expect(tiCard.fieldCounter).toBe(office.field.id);
            expect(tiCard.jobCounter).toBe(office.job.id);
            expect(tiCard.programCreated).toBe(true);
            expect(String(tiCard.traceabilityCode ?? '')).toBe(assignedRoll);

            // B7-R1: the roll's extracted prefix lands as the employee's own
            // code-history alternate code, windowed to this punch day.
            const history = await getCodeHistory(sessionApi, emp6007.id);
            const historyRow = history.find((h) => h.alternateCode === assignedPrefix);
            expect(historyRow, 'no code-history row carries the assigned prefix').toBeDefined();
            expect(
                historyRow!.startDateTime,
                'startDateTime must be set — a NULL never satisfies the window',
            ).toBeTruthy();
            expect(String(historyRow!.startDateTime)).toMatch(new RegExp(`^${day}`));

            poCards = await findByReferences(sessionApi, [references[1], references[2]], {
                ...pollOpts,
                cardType: CARD_TYPE.timeOut,
            });
            expect(poCards, 'both piece-out cards').toHaveLength(2);
            const byReference = new Map(poCards.map((c) => [String(c.reference ?? ''), c]));
            const unassignedCard = byReference.get(references[1]);
            const assignedCard = byReference.get(references[2]);
            expect(unassignedCard, 'no card linked to the unassigned prefix').toBeDefined();
            expect(assignedCard, 'no card linked to the assigned prefix').toBeDefined();

            // B7-R3: a prefix matching no same-day assignment falls back to the
            // configured Undefined Employee — id equality, never merely non-null.
            expect(unassignedCard!.employeeCounter).toBe(undefinedEmployeeId);
            // B7-R2: a prefix matching a same-day assignment attributes to that
            // assignment's own employee.
            expect(assignedCard!.employeeCounter).toBe(emp6007.id);
            // B7-R4: the fallback records why on the card's memo.
            expect(String(unassignedCard!.memo ?? '')).toMatch(
                new RegExp(`^Assigning to Undefined Employee - Missing Code: ${unassignedPrefix}`),
            );
            // B7-R5: an alternate-code employee source reports as "Sticker Code".
            expect(String(unassignedCard!.employeeSourceText ?? '')).toBe('Sticker Code');
            expect(String(assignedCard!.employeeSourceText ?? '')).toBe('Sticker Code');
            // B7-R6: the full scanned sticker and piece count survive verbatim.
            expect(String(unassignedCard!.traceabilityCode ?? '')).toBe(unassignedSticker);
            expect(String(assignedCard!.traceabilityCode ?? '')).toBe(assignedSticker);
            expect(Number(unassignedCard!.numOfPieces)).toBe(1);
            expect(Number(assignedCard!.numOfPieces)).toBe(1);
            // B7-R7: keyed by the device's own PO reference, stored as time-out.
            const poPart = `-${DEVICE_SCHEMA.referenceParts.pieceOut}-`;
            expect(String(unassignedCard!.reference ?? '')).toContain(poPart);
            expect(String(assignedCard!.reference ?? '')).toContain(poPart);
            expect(unassignedCard!.cardType).toBe(CARD_TYPE.timeOut);
            expect(assignedCard!.cardType).toBe(CARD_TYPE.timeOut);

            await testInfo.attach('time-cards-B7.json', {
                body: JSON.stringify({ tiCards, poCards }, null, 2),
                contentType: 'application/json',
            });
        } finally {
            // Time cards only — the EmployeeCodeHistory row itself has no DELETE
            // endpoint anywhere in openapi.yaml (N5). It is deliberately left
            // behind, one row per calendar day this suite runs, on employee 6007.
            await cleanupCards(sessionApi, [...tiCards, ...poCards], testInfo);
        }
    });
});
