/**
 * Catalog workflow B5 — Sticker piece-out (PET-12643 / WEBPET-1524).
 * Data: src/data/journey-b/b05-sticker-piece-out.json · Plan: test-plans/journey-b/b05-sticker-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertImportedRows,
    cardOf,
    issueGroupCount,
    journeyBPreconditions,
    openCrewTransferCandidates,
    runJourneyBScenario,
} from '@utils/journeys/journeyBFlow';

test.describe('B5 · Sticker piece-out', { tag: ['@JourneyB', '@B5'] }, () => {
    test('Deliver sticker piece-out records and verify attribution, totals and the Undefined-Employee fallback', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B5' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        // Both gates decide whether anything below can mean anything, so they are read — and
        // asserted — before a single record is delivered.
        const gates = await journeyBPreconditions(scenario, { sessionApi, testInfo });
        // modules: Piece Payment (recorded only), Traceability - Stickers (required).
        const [, traceability] = gates.modules;
        expect(
            traceability.enabled,
            'Traceability - Stickers unlicensed on dev client — B5 cannot assert sticker attribution',
        ).toBeTruthy();
        // `> 0`, not just isFinite: Number(null) is 0, which is finite, so the old guard passed on an
        // unconfigured tenant and the run died 160 lines later on a card assertion. Matches B7's guard.
        expect(
            Number.isFinite(gates.undefinedEmployeeId) && gates.undefinedEmployeeId > 0,
            'preferences.undefinedEmployee must be configured — the importer binds it as the ' +
                'fallback owner, so the fallback cannot be asserted without it. The field is read-only on ' +
                'the preferences screen, but no DB write is needed: run Help ▸ Administration ▸ ' +
                '"Add Standard Records to Database" (/settings/standard-records, or POST ' +
                'admin/standard-records) and it repoints the setting at the existing Undefined ' +
                `Employee record. Got: ${JSON.stringify(gates.undefinedEmployeeRaw)}`,
        ).toBe(true);

        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo, gates });
        // run.scenario is the loaded file with the minted sticker codes substituted.
        const { records, expected } = run.scenario;
        const want = expected.envelope!;
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.employeeSources, 'one AlternateCode source per piece-out').toEqual(want.employeeSources);
        for (const sticker of want.traceabilityCodes!) {
            expect(run.envelope.traceabilityCodes).toContain(sticker);
        }
        expect(run.envelope.pieceCounts, 'one piece per piece-out record').toEqual(want.pieceCounts);
        expect(run.envelope.references).toHaveLength(records.length);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        // Employee, crew, ranch, field, job, source, traceability and pieces of every card are compared
        // on its Transfer row by assertImportedRows — the Undefined-Employee fallback included.
        await assertImportedRows(pages, run);
        const [seeding, stickerA, stickerB, fallback] = expected.cards.map((c) => cardOf(run, c.record));
        const wantOfType = (type: number) => expected.cards.filter((c) => c.cardType === type).length;
        const cardsOfType = (type: number) => run.cards.filter((c) => Number(c.cardType) === type);
        expect(cardsOfType(seeding.expected.cardType!), 'the seeding Time In card').toHaveLength(wantOfType(seeding.expected.cardType!));
        expect(cardsOfType(stickerA.expected.cardType!), 'three piece-out cards').toHaveLength(wantOfType(stickerA.expected.cardType!));

        // Both 6006 piece cards attribute to 6006, pieces total 2.
        expect(
            Number(stickerA.row.pieces) + Number(stickerB.row.pieces),
            'pieces total across the two scans',
        ).toBe(stickerA.expected.pieces! + stickerB.expected.pieces!);
        for (const { row } of [stickerA, stickerB, fallback]) {
            expect(['', '—'], 'no job carried through').toContain(row.job);
        }

        // ── Analyze, on the Transfer screen: the status each card reads and the Issues groups ──
        const transfer = pages.transferToJobCards;
        const grid = expected.grid!;
        const jobGate = gates.requireJobInEmpPieceOut ? 'missingJobRequired' : 'missingJobOptional';
        await openCrewTransferCandidates(pages, run);
        for (const { reference, timeCardCounter } of [stickerA, stickerB]) {
            expect(
                await transfer.rowStatusText(timeCardCounter),
                `piece card ${reference} with requireJobInEmpPieceOut=${String(gates.requireJobInEmpPieceOut)}`,
            ).toBe(grid.rowStatus![jobGate]);
        }
        expect(
            await transfer.rowStatusText(fallback.timeCardCounter),
            `the Undefined-Employee piece card ${fallback.reference} must be flagged unusable`,
        ).toBe(grid.rowStatus!.undefinedEmployee);
        // ≥ 1, not an exact count: dev is a shared tenant, and a group may count employees rather than rows.
        const missingJob = await issueGroupCount(pages, run, grid.issueGroups![jobGate]);
        const undefinedGroup = await issueGroupCount(pages, run, grid.issueGroups!.undefinedEmployee);
        testInfo.annotations.push({
            type: 'missing-job-exception',
            description:
                `requireJobInEmpPieceOut=${String(gates.requireJobInEmpPieceOut)} → rows ${grid.rowStatus![jobGate]}; ` +
                `Issues group /${grid.issueGroups![jobGate]}/ affects ${missingJob}, Undefined Employee group affects ${undefinedGroup}`,
        });
        expect(missingJob, `the missing-job Issues group /${grid.issueGroups![jobGate]}/ must affect a record`).toBeGreaterThanOrEqual(1);
        expect(undefinedGroup, `the Undefined Employee Issues group /${grid.issueGroups!.undefinedEmployee}/ must affect a record`).toBeGreaterThanOrEqual(1);
    });
});
