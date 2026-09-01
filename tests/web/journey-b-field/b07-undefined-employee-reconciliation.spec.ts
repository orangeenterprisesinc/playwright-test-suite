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
    }, async ({ sessionApi, pages }, testInfo) => {
        // Not test.slow(): that triples the 110s default to 330s, and B7 is the only
        // spec that imports TWICE — device A then device B, each waiting up to a
        // full worker interval — plus a UI leg. A healthy run is ~135s; this leaves
        // room for both imports to sit behind a tick without a false red.
        test.setTimeout(9 * 60 * 1000);

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
        let preferencesRestored = false;
        try {

            // ── Seed ──
            const office = await seedOfficeFixture(sessionApi);
            // seedOfficeFixture only ensures F.present/F.absentee — the sticker
            // employee is B7's own.
            const emp6007 = await ensureEmployee(sessionApi, F.sticker[2]);

            // -- Two device syncs, as the recording shows --
            // Amy uses two checkers and syncs them separately: Device 1's Time In
            // reaches the office first (Transfer shows `3 records - 0 Pieces`,
            // kf 128), and only then does Device 2's sticker scanning arrive
            // (kf 152 -> 350). Collapsing both into one file would leave the
            // code-history grid and the piece-outs racing inside a single import, so
            // the reconciliation could fail purely on processing order -- a hazard
            // the real two-sync flow never has. Distinct reference prefixes stand in
            // for her two device ids (S31 / D31).
            const prefixA = runPrefix;
            const prefixB = newRunPrefix(new Date(Date.now() + 3_600_000));
            expect(prefixB, 'the two devices must not share a reference prefix').not.toBe(prefixA);

            const deliverAndImport = async (label: string, prefix: string, xml: string) => {
                await testInfo.attach(`device-export-${label}.xml`, {
                    body: xml,
                    contentType: 'application/xml',
                });
                const fileName = exportFileName(prefix);
                const sent = await sendToRelay({
                    url: process.env.DEVICE_RELAY_URL ?? '',
                    from: deviceAddress,
                    to: process.env.DEVICE_RELAY_SERVER ?? '',
                    xml,
                    fileName,
                });
                await testInfo.attach(`relay-send-${label}.txt`, {
                    body: `file: ${fileName}\nsuccess: ${sent.success}\nstatus: ${sent.status}\n${sent.body}`,
                    contentType: 'text/plain',
                });
                expect(sent.success, `relay rejected the ${label} export: ${sent.body}`).toBe(true);

                const { pull, run } = await pullFromRelayInternet(sessionApi);
                await testInfo.attach(`import-run-${label}.json`, {
                    body: JSON.stringify({ pull, run }, null, 2),
                    contentType: 'application/json',
                });
                expect(
                    ['ok', 'no-data'],
                    `relay pull could not run for ${label}: ${pull.status} ${pull.message}`,
                ).toContain(pull.status);

                // Our file only, never the run: one office mailbox is shared by every
                // worker, so a pull routinely drains sibling specs' envelopes too
                // (CI run 418 carried four files, three of them other tests'). An
                // absent file means a peer's pull took it; findByReferences still
                // proves ownership, exactly as importViaInternetUi does.
                const file = run?.files?.find((f) => String(f.filename ?? '') === fileName);
                if (!file) {
                    testInfo.annotations.push({
                        type: 'peer-drained',
                        description:
                            `${fileName} (${label}) was not in run ${run?.runId ?? 'n/a'} - a parallel ` +
                            'worker pull drained it into that run instead.',
                    });
                }
                return { fileName, runId: run?.runId, file };
            };

            // Clear leftover fixture punches for this day before anything is
            // delivered - an orphan from an earlier run's late import would flip the
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

            // The roll-to-employee link the Time In screen exports alongside its
            // flat row when `First Roll Code` is filled. StartDateTime is the Time
            // In's own moment, which is what puts it inside the window the office's
            // sticker rule searches (startOfDay(pieceOut) .. pieceOut).
            const codeHistory: CodeHistoryAssignment[] = [
                {
                    employeeCode: F.sticker[2].code,
                    scannedCode: assignedRoll,
                    alternateCode: assignedPrefix,
                    // The roll's own tail, the same split the office applies.
                    firstCode: assignedRoll.slice(STICKER_ROLL_CODE_START - 1),
                    at: punchMoment(6, 30, punchDate),
                },
            ];

            // -- Device A: the Time In that carries the roll assignment --
            const deviceA = buildEnvelope({
                deviceAddress,
                prefix: prefixA,
                codeHistory,
                records: [
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
                ],
            });

            expect(deviceA.xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
            const employeeRecordsTag = `${DEVICE_SCHEMA.grid.employee}${DEVICE_SCHEMA.recordsSuffix}`;
            expect(deviceA.xml).toContain(
                `<${employeeRecordsTag} ${DEVICE_SCHEMA.attributes.lookupContents}="${DEVICE_SCHEMA.grid.lookupEmployeeByCode}"`,
            );
            const historyRecordsTag = `${DEVICE_SCHEMA.grid.employeeCodeHistory}${DEVICE_SCHEMA.recordsSuffix}`;
            expect(deviceA.xml).toContain(
                `<${historyRecordsTag} ${DEVICE_SCHEMA.attributes.lookupContents}="${DEVICE_SCHEMA.grid.lookupAddOnlyGrid}"`,
            );
            expect(deviceA.xml).toContain(
                `<${DEVICE_SCHEMA.grid.tags.alternateCode}>${assignedPrefix}</${DEVICE_SCHEMA.grid.tags.alternateCode}>`,
            );
            // The CH assignment gets its own reference internally but is kept out of
            // the card-identity list - a code-history row never becomes a time card.
            expect(deviceA.references, 'device A sends one card').toHaveLength(1);

            const importA = await deliverAndImport('device-a', prefixA, deviceA.xml);

            // KNOWN PRODUCT DEFECT - device A's file stops here, and the envelope is
            // deliberately NOT padded to get past it. `tableMapper.bind`
            // (upsert.go:624-646) never sets `boundColumn.Absent`, so
            // `valueAssignments` (:1063-1075) assigns every column on the UPDATE arm,
            // including ones the file omits. `PayPeriod` is modelled nullable
            // (specs.go:260) but is NOT NULL on the client DB, so the parent
            // <Employee> record dies with SQL 515 - and a parent failure is fatal to
            // its nested grid (upsert.go:418-427), so the roll assignment never
            // persists and B7-R1/B7-R2 below cannot pass.
            //
            // Sending <PayPeriod> clears the 515, but the same UPDATE also writes
            // FirstName, LastName, Rate, EmailAddress, HireDate and Password to NULL
            // - the 515 is the only thing preventing that - and it would stop the
            // envelope reproducing what AndroidPET actually emits.
            //
            // Soft, so one run still exercises and reports the Undefined-Employee
            // half (B7-R3..B7-R7), which does not depend on the assignment. The test
            // still fails; it just stops hiding everything behind the first error.
            const importAJson = JSON.stringify(importA.file ?? null);
            if (importA.file && /PayPeriod/.test(importAJson)) {
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
            if (importA.file) {
                expect.soft(
                    importA.file.status,
                    `import of ${importA.fileName} (run ${importA.runId}): ${importAJson}`,
                ).toBe('completed');
            }

            // -- Device B: the employee-less sticker scans, synced only after A --
            const deviceB = buildEnvelope({
                deviceAddress,
                prefix: prefixB,
                records: [
                    // No crew, as the recording shows (`Cuadrilla de Trabajo: Not
                    // Selected` on every device-B record, kf 282) and Amy's QA comment
                    // states. Load-bearing: her two crew-selected variants
                    // (attachments 66917/66918) both come back with the employee
                    // CLEARED at import and "...removed, Distributed to entire Crew"
                    // appended - a crew would undo the reconciliation B7-R2/B7-R3
                    // assert.
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
                ],
            });

            expect(deviceB.xml).toContain(`<${DEVICE_SCHEMA.nodes.PieceOut}${DEVICE_SCHEMA.recordsSuffix}`);
            expect(deviceB.xml).toContain(
                `<${DEVICE_SCHEMA.tags.employee}>${assignedPrefix}</${DEVICE_SCHEMA.tags.employee}>`,
            );
            expect(deviceB.xml).toContain(
                `<${DEVICE_SCHEMA.tags.employee}>${unassignedPrefix}</${DEVICE_SCHEMA.tags.employee}>`,
            );
            const alternateCodeSourceTag =
                `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.alternateCode}` +
                `</${DEVICE_SCHEMA.tags.employeeSource}>`;
            expect(
                deviceB.xml.split(alternateCodeSourceTag).length - 1,
                'exactly two AlternateCode-sourced piece-outs',
            ).toBe(2);
            const numOfPiecesTag = `<${DEVICE_SCHEMA.tags.numOfPieces}>1</${DEVICE_SCHEMA.tags.numOfPieces}>`;
            expect(
                deviceB.xml.split(numOfPiecesTag).length - 1,
                'exactly two single-piece piece-outs',
            ).toBe(2);
            // Device B holds no roll assignment, so it sends no code-history grid.
            expect(deviceB.xml).not.toContain(`<${employeeRecordsTag}`);
            expect(deviceB.references, 'device B sends two cards').toHaveLength(2);

            const importB = await deliverAndImport('device-b', prefixB, deviceB.xml);

            // Both imports are done, so the tenant preferences have served their
            // purpose — everything below is reads. Restore them HERE rather than in
            // the finally: a long UI leg or a dropped session would otherwise leave
            // dev's sticker extraction reconfigured for every other user, which is
            // exactly what happened on the run that added the UI step.
            await setStartLocations(originalEmpStart, originalRollStart);
            preferencesRestored = true;

            if (importB.file) {
                expect(
                    importB.file.status,
                    `import of ${importB.fileName} (run ${importB.runId}): ${JSON.stringify(importB.file)}`,
                ).toBe('completed');
            }

            const pollOpts = {
                from: day,
                to: day,
                timeoutMs: Number(process.env.IMPORT_POLL_TIMEOUT_MS ?? '') || 120_000,
            };

            tiCards = await findByReferences(sessionApi, [deviceA.references[0]], {
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
            //
            // Soft, and guarded, for the same reason device A's import status is:
            // both fail together on the PayPeriod defect above, and stopping here
            // would leave the Undefined-Employee half (B7-R3..B7-R7) unexercised on
            // every run. The test still fails — a soft assertion is not a weaker
            // one — it just reports the whole picture instead of only the first
            // casualty.
            const history = await getCodeHistory(sessionApi, emp6007.id);
            const historyRow = history.find((h) => h.alternateCode === assignedPrefix);
            expect.soft(
                historyRow,
                'B7-R1: no code-history row carries the assigned prefix — see the product-defect annotation',
            ).toBeDefined();
            if (historyRow) {
                expect.soft(
                    historyRow.startDateTime,
                    'startDateTime must be set — a NULL never satisfies the window',
                ).toBeTruthy();
                expect.soft(String(historyRow.startDateTime)).toMatch(new RegExp(`^${day}`));
            }

            poCards = await findByReferences(sessionApi, deviceB.references, {
                ...pollOpts,
                cardType: CARD_TYPE.timeOut,
            });
            expect(poCards, 'both piece-out cards').toHaveLength(2);
            const byReference = new Map(poCards.map((c) => [String(c.reference ?? ''), c]));
            const unassignedCard = byReference.get(deviceB.references[0]);
            const assignedCard = byReference.get(deviceB.references[1]);
            expect(unassignedCard, 'no card linked to the unassigned prefix').toBeDefined();
            expect(assignedCard, 'no card linked to the assigned prefix').toBeDefined();

            // B7-R3: a prefix matching no same-day assignment falls back to the
            // configured Undefined Employee — id equality, never merely non-null.
            expect(unassignedCard!.employeeCounter).toBe(undefinedEmployeeId);
            // B7-R2: a prefix matching a same-day assignment attributes to that
            // assignment's own employee. Soft with B7-R1 — there is no assignment to
            // match while the PayPeriod defect blocks the grid, so this fails for the
            // same single cause and must not mask B7-R4..B7-R7 behind it.
            expect.soft(assignedCard!.employeeCounter, 'B7-R2').toBe(emp6007.id);
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

            // ── The office screen Amy actually reads (kf 318 → 384) ──
            // View ▸ Time Cards, filtered to the punch day: she confirms the
            // reconciliation by eye, in the Employee and Employee Selection
            // columns. The API asserts above prove WHICH employee by id; this
            // proves a reviewer can see it, and catches rendering regressions the
            // API never would — the same belt-and-braces split B6 uses for the
            // Transfer grid. Substring matching because the grid truncates
            // ("Undefined Employ…").
            await pages.leftNav.navigate();
            await pages.leftNav.openViaMenu(['View', 'Time Cards'], pages.timeCards.pageUrl);
            await pages.timeCards.heading.waitFor({ state: 'visible', timeout: 30_000 });
            await pages.timeCards.applyDateRange(punchDate);

            const unassignedRow = await pages.timeCards.rowText(deviceB.references[0]);
            const assignedRow = await pages.timeCards.rowText(deviceB.references[1]);
            await testInfo.attach('time-cards-grid-B7.png', {
                body: await pages.timeCards.screenshot(),
                contentType: 'image/png',
            });

            // B7-R3 on screen: the unassigned prefix reads as the Undefined
            // Employee. Truncated in the column, so match the stable prefix.
            expect(unassignedRow, 'grid Employee column for the unassigned prefix').toContain(
                'Undefined Employ',
            );
            // B7-R2 on screen: the assigned prefix reads as the roll's owner.
            expect(assignedRow, 'grid Employee column for the assigned prefix').toContain(
                F.sticker[2].name,
            );
            // B7-R5 on screen: both rows report the sticker employee source.
            expect(unassignedRow, 'grid Employee Selection column').toContain('Sticker Code');
            expect(assignedRow, 'grid Employee Selection column').toContain('Sticker Code');
        } finally {
            // Time cards only — the EmployeeCodeHistory row itself has no DELETE
            // endpoint anywhere in openapi.yaml (N5). It is deliberately left
            // behind, one row per calendar day this suite runs, on employee 6007.
            await cleanupCards(sessionApi, [...tiCards, ...poCards], testInfo);
            // Safety net for a failure BEFORE the restore above (envelope, relay or
            // import). Best-effort: if the session itself died there is no way back,
            // and throwing here would bury the real failure.
            if (!preferencesRestored) {
                await setStartLocations(originalEmpStart, originalRollStart).catch(async (err) => {
                    testInfo.annotations.push({
                        type: 'preferences-not-restored',
                        description:
                            `employeeCodeStartLocation/rollCodeStartLocation left at ` +
                            `${STICKER_EMP_CODE_START}/${STICKER_ROLL_CODE_START} — restore failed: ` +
                            `${String(err).slice(0, 200)}`,
                    });
                });
            }
        }
    });
});
