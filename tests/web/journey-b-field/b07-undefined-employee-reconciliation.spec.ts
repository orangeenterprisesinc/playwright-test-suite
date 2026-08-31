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
 *
 * Transport is **internet** — `POST connectivity/import/internet`, the WebMail
 * leg a real device sync uses and the one the recording shows, not the
 * single-folder shortcut.
 *
 * The envelope is byte-faithful to what AndroidPET emits, deliberately: B7
 * currently fails on a real importer defect (see the `product-defect`
 * annotation at the import-status assertion), and padding the file to dodge it
 * would both break that fidelity and wipe the employee's demographics.
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
import { pullFromRelayInternet } from '@utils/api/connectivityImportApi';
import {
    CARD_TYPE,
    findByReferences,
    isoDay,
    sweepFixtureCards,
    type OfficeTimeCard,
} from '@utils/api/timeCardsApi';
import { cleanupCards } from '@utils/api/officeVerification';

/**
 * `RunTrackingEmpCodeStartLoc` / `RunTrackingRollCodeStartLoc`, 1-based. The
 * office extracts `code[emp-1 .. roll-2]` as the alternate code, so 1/8 turns an
 * 11-char sticker into the 7-char prefix it joins on — the values Amy's instance
 * ran with. Dev's registry defaults are 0/0, which extract nothing at all.
 */
const STICKER_EMP_CODE_START = 1;
const STICKER_ROLL_CODE_START = 8;
const STICKER_PREFIX_LENGTH = STICKER_ROLL_CODE_START - STICKER_EMP_CODE_START;

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

        // Both prefixes must be exactly what the office's own extraction yields, or
        // the equality the sticker rule performs can never match.
        for (const [prefix, sticker] of [
            [assignedPrefix, assignedRoll],
            [assignedPrefix, assignedSticker],
            [unassignedPrefix, unassignedSticker],
        ] as const) {
            expect(prefix, 'the prefix the office extracts from the sticker').toBe(
                sticker.slice(STICKER_EMP_CODE_START - 1, STICKER_ROLL_CODE_START - 1),
            );
            expect(prefix).toHaveLength(STICKER_PREFIX_LENGTH);
        }

        const punchDate = punchDay(DAY_OFFSET.B7);
        const day = isoDay(punchDate);
        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';

        // Both flags come from PT_MODULES on the API task, which short-circuits the
        // TigerMaster query entirely (auth/modules.go:569-571) — TigerMaster already
        // licenses Piece Payment (moduleId 36), so /admin/tm cannot clear this gate.
        // Documented, not enforced: Piece Payment gates piece *payment*, not piece
        // capture, so every B7 requirement is provable through the API while it is
        // off, and this spec is not blocked behind PET-12689.
        const meRes = await sessionApi.get('session/me');
        expect(meRes.ok(), `GET session/me failed with ${meRes.status()}`).toBe(true);
        const me = (await meRes.json()) as { modules?: Record<string, unknown> };
        const modules = me.modules ?? {};
        testInfo.annotations.push({
            type: 'module-gate-asserted',
            description:
                `Piece Payment → ${modules.PiecePayment} · Traceability - Stickers → ` +
                `${modules.LabelTraceability} (from PT_MODULES, not TigerMaster)`,
        });

        // ── Arrange the label-tracking preferences through the API ──
        // At dev's registry defaults (0/0) the office extracts an EMPTY prefix, which
        // fails the last conjunct of the WEBPET-1410 rule and leaves the whole
        // reconciliation inert — B7's subject could not fire at all. These two keys
        // are the only ones written, and both are restored in the finally below.
        // `assignRollsDaily` is deliberately never sent: flipping it true clears
        // AlternateCode on EVERY Employee row, and nothing puts that back.
        const prefRes = await sessionApi.get('preferences');
        expect(prefRes.ok(), `GET preferences failed with ${prefRes.status()}`).toBe(true);
        const preferences = (await prefRes.json()) as Record<string, unknown>;

        // 0 would leave the importer binding nothing, so the card's employee would
        // be NULL rather than the Undefined Employee this test asserts.
        const undefinedEmployeeId = Number(preferences.undefinedEmployee);
        expect(
            Number.isFinite(undefinedEmployeeId) && undefinedEmployeeId > 0,
            'preferences.undefinedEmployee must be configured',
        ).toBe(true);

        const originalEmpStart = preferences.employeeCodeStartLocation;
        const originalRollStart = preferences.rollCodeStartLocation;
        const setStartLocations = async (empStart: unknown, rollStart: unknown): Promise<void> => {
            const put = await sessionApi.put('preferences', {
                headers: { 'Content-Type': 'application/json' },
                data: { employeeCodeStartLocation: empStart, rollCodeStartLocation: rollStart },
            });
            expect(
                put.ok(),
                `PUT preferences failed with ${put.status()}: ${(await put.text()).slice(0, 300)}`,
            ).toBe(true);
        };

        // The values Amy's instance ran with: an 11-char sticker yields the 7-char
        // prefix the office joins on (B7288570926 → B728857).
        await setStartLocations(STICKER_EMP_CODE_START, STICKER_ROLL_CODE_START);
        testInfo.annotations.push({
            type: 'preferences-arranged',
            description:
                `employeeCodeStartLocation ${String(originalEmpStart)} → ${STICKER_EMP_CODE_START}, ` +
                `rollCodeStartLocation ${String(originalRollStart)} → ${STICKER_ROLL_CODE_START}; ` +
                'both restored after the run. assignRollsDaily is never sent.',
        });

        // Everything from here runs inside the try whose finally restores the two
        // preferences — a failure while building or delivering the envelope must
        // not leave the tenant's sticker extraction reconfigured.
        let tiCards: OfficeTimeCard[] = [];
        let poCards: OfficeTimeCard[] = [];
        try {

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
                // Device B's piece-outs carry NO crew, as the recording shows
                // (`Cuadrilla de Trabajo` blank, kf 218) and Amy's QA comment states
                // ("no crew selected"). This is load-bearing, not cosmetic: her two
                // crew-selected variants (WEBPET-1526 attachments 66917/66918) both
                // come back with the employee CLEARED at import and
                // "…removed, Distributed to entire Crew" appended to the memo — so a
                // crew would undo the very reconciliation B7-R2/B7-R3 assert.
                {
                    node: 'PieceOut',
                    part: DEVICE_SCHEMA.referenceParts.pieceOut,
                    employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                    employeeCode: unassignedPrefix,
                    pieces: 1,
                    traceabilityCode: unassignedSticker,
                    at: punchMoment(12, 16, punchDate),
                },
                {
                    node: 'PieceOut',
                    part: DEVICE_SCHEMA.referenceParts.pieceOut,
                    employeeSource: DEVICE_SCHEMA.employeeSource.alternateCode,
                    employeeCode: assignedPrefix,
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
            // The internet transport: ask the office to drain its relay mailbox,
            // the WebMail leg a real device sync uses. `no-data` is not a failure
            // under workers=2 — one office mailbox is shared, so a peer's pull can
            // carry our envelope into its own run; the rows still land in the same
            // client DB and matching by reference proves ownership.
            const { pull, run } = await pullFromRelayInternet(sessionApi);
            await testInfo.attach('import-run-B7.json', {
                body: JSON.stringify({ pull, run }, null, 2),
                contentType: 'application/json',
            });
            expect(
                ['ok', 'no-data'],
                `relay pull could not run: ${pull.status} ${pull.message}`,
            ).toContain(pull.status);
            // KNOWN PRODUCT DEFECT — B7 currently stops here, and the envelope is
            // deliberately NOT padded to get past it. `tableMapper.bind`
            // (upsert.go:624-646) never sets `boundColumn.Absent`, so
            // `valueAssignments` (:1063-1075) assigns every column on the UPDATE
            // arm, including ones the file omits. `PayPeriod` is modelled nullable
            // (specs.go:260) but is NOT NULL on the client DB, so the parent
            // <Employee> record dies with SQL 515 — and a parent failure is fatal to
            // its nested grid (upsert.go:418-427), so the roll assignment never
            // persists and B7-R1 below can never find it.
            //
            // Sending <PayPeriod> clears the 515, but the same UPDATE also writes
            // FirstName, LastName, Rate, EmailAddress, HireDate and Password to
            // NULL — the 515 is the only thing preventing that — and it would stop
            // the envelope reproducing what AndroidPET actually emits.
            // Assert on OUR file only, never the run. One office mailbox is shared
            // by every worker, so a single pull routinely drains sibling specs'
            // envelopes into the same run — CI run 418 carried four files, three of
            // them other tests'. Asserting `run.status` made B7 red whenever a
            // sibling's file failed, which is not B7's business. A file that is
            // absent means a peer's pull took it; `findByReferences` below still
            // proves ownership either way, exactly as `importViaInternetUi` does.
            const ourFile = run?.files?.find((f) => String(f.filename ?? '') === fileName);
            const ourFileJson = JSON.stringify(ourFile ?? null);
            if (ourFile && /PayPeriod/.test(ourFileJson)) {
                testInfo.annotations.push({
                    type: 'product-defect',
                    description:
                        'Employee_Records parent UPDATE assigns every omitted column, so it fails ' +
                        'SQL 515 on NOT NULL PayPeriod and the nested EmployeeCodeHistory grid is ' +
                        'never written (upsert.go:418-427). Fix: set boundColumn.Absent in ' +
                        'tableMapper.bind (upsert.go:645) and honour it in valueAssignments ' +
                        '(:1066), as reference.go:1634 and gridmapper.go:666 already do.',
                });
            }
            if (ourFile) {
                expect(
                    ourFile.status,
                    `import of ${fileName} (run ${run?.runId}): ${ourFileJson}`,
                ).toBe('completed');
            } else {
                testInfo.annotations.push({
                    type: 'peer-drained',
                    description:
                        `${fileName} was not in run ${run?.runId ?? 'n/a'} — a parallel worker's pull ` +
                        'drained it into that run instead. Ownership is proven by reference below.',
                });
            }

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
            expect(
                historyRow,
                'no code-history row carries the assigned prefix — see the product-defect annotation',
            ).toBeDefined();
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
            // Put the tenant preferences back however this run ended — leaving them
            // changed would alter sticker extraction for every other client user.
            await setStartLocations(originalEmpStart, originalRollStart);
        }
    });
});
