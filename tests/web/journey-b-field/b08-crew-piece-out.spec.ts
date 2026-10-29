/**
 * Catalog workflow B8 — Crew piece-out (PET-12646 / WEBPET-1527).
 * Data: src/data/journey-b/b08-crew-piece-out.json · Plan: test-plans/journey-b/b08-crew-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertImportedRows,
    cardOf,
    jobCardEmployeesOnScreen,
    journeyBPreconditions,
    memberName,
    openCrewTransferCandidates,
    referencePart,
    runJourneyBScenario,
} from '@utils/journeys/journeyBFlow';

test.describe('B8 · Crew piece-out', { tag: ['@JourneyB', '@B8'] }, () => {
    test('[Crew Piece Out] Deliver one crew piece-out with no employee and verify the office holds the crew total on one card, with the per-person split only proposed at transfer.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B8' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // 1. Load and gate: the crew total must sit inside the live piece limits.
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const { records, expected } = scenario;
        const want = expected.envelope!;
        const split = expected.transfer!;
        const gates = await journeyBPreconditions(scenario, { sessionApi, testInfo });
        const limits = gates.pieceLimits!;
        expect(
            split.piecesTotal >= limits.minimum && split.piecesTotal <= limits.maximum,
            `crew total ${split.piecesTotal} is outside the live piece limits ${limits.minimum}..${limits.maximum}`,
        ).toBe(true);

        // 2. Deliver: piece job on screen, sweep, envelope, on-screen import, cards by reference.
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo, gates });

        // 3. Envelope.
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        expect(run.envelope.employeeSources).toEqual(want.employeeSources);
        expect(run.envelope.pieceCounts).toEqual(want.pieceCounts);
        for (const [section, tags] of Object.entries(want.absentInSection!)) {
            for (const tag of tags) {
                expect(run.envelope.sectionTags[section], `the ${section} section must carry no ${tag} tag`).not.toContain(tag);
            }
        }

        // 4. Step 1: the crew total is one employee-less card. Crew, job (the piece job), type and pieces of
        // all five rows are compared by assertImportedRows; the crew-scoped set below is exactly this run's.
        expect(run.cards, 'the five imported cards').toHaveLength(expected.cards.length);
        await assertImportedRows(pages, run);
        const piece = cardOf(run, expected.cards.find((c) => c.employeeCode === null)!.record);
        expect(['', '—'], 'a crew piece-out stores no employee').toContain(piece.row.employee);
        expect(Number(piece.row.pieces.replace(/,/g, '')), 'the crew total').toBe(piece.expected.pieces);
        expect(piece.row.type).toBe(piece.expected.typeText);
        expect(piece.row.reference).toBe(run.recordReferences[piece.index]);
        expect(referencePart(piece.row.reference)).toBe(records[piece.index].part);

        // 5. Step 2: the Transfer screen, crew-scoped and before any commit, shows the crew total.
        const transfer = pages.transferToJobCards;
        const ownReferences = run.recordReferences.filter((r) => r !== '').sort();
        const candidates = await openCrewTransferCandidates(pages, run);
        expect([...candidates].sort(), 'the crew-scoped grid offers exactly the run\'s own open time cards').toEqual(ownReferences);
        expect(candidates, 'the crew-scoped grid offers exactly the run\'s own time cards').toHaveLength(run.cards.length);
        const reference = run.recordReferences[piece.index];
        expect(await transfer.crewPieceOutRows(), 'the only row with no employee must be the crew piece-out').toEqual([reference]);
        await expect(await transfer.rowEmployee(reference), 'a crew piece-out carries no employee').toHaveText(split.crewEmployeeCell);
        await expect(await transfer.rowPieces(reference), 'the row carries the whole crew total').toHaveText(String(split.piecesTotal));
        await expect(await transfer.rowType(reference), 'the row is typed as a piece-out').toHaveText(split.pieceOutType);
        await expect(await transfer.rowPayByPiece(reference), 'the piece-out is pay-by-piece').toHaveText(split.payByPiece);
        await expect.poll(() => transfer.piecesTotal(), { message: 'the totals strip must read the crew total before anything commits' }).toBe(split.piecesTotal);
        await transfer.expectSelectAllUntouched('the header select-all stays untouched');

        // 6. Step 3: the per-person split is only proposed; the Transfer button is never clicked.
        // Piece-bearing rows only: the crew's Exercise Job (B1 CREW: 10 min of 4000-General) carves a
        // pieceless card off each member's first piece card. That is crew setup, not the split under test.
        const pieceRows = async () => (await transfer.previewRows()).filter((row) => row.pieces > 0);
        await transfer.openJobCardsTab();
        await expect.poll(async () => (await pieceRows()).length, { message: 'the preview proposes one piece-bearing job card per member' }).toBe(split.jobCards);
        const preview = await pieceRows();
        for (const code of split.members) {
            const name = memberName(run, code);
            const mine = preview.filter((row) => row.employee.includes(name));
            expect(mine, `the preview carries ${name}'s pieces on exactly one card`).toHaveLength(1);
            expect(mine[0].pieces, `${name}'s previewed share`).toBe(split.piecesPerMember);
        }
        await expect.poll(async () => {
            const { pieces, employees } = await transfer.previewTotals();
            return { pieces, employees };
        }, { message: 'the preview totals bar' }).toEqual({ pieces: split.piecesTotal, employees: split.members.length });

        // After the preview every one of this run's cards is still on the grid and untransferred. "Contain",
        // not "equal": whether the crew filter survives the tab switch is not measured, and a transferred or
        // missing card still fails here.
        await transfer.openTimeCardsTab();
        expect(await transfer.candidateReferences(), 'after the preview every one of this run\'s cards is still a candidate').toEqual(
            expect.arrayContaining(ownReferences),
        );
        for (const own of ownReferences) {
            expect(await transfer.rowTransferred(own), `${own} must still read untransferred`).toMatch(/^(No)?$/);
        }

        // Nothing was transferred, so no member has a job card for the day. Members only, never the whole
        // crew: day -17 holds permanent transferred "A Kishore" cards under the same crew.
        const memberNames = split.members.map((code) => memberName(run, code));
        const { employees } = await jobCardEmployeesOnScreen(pages, run.day, run.office.crew.name);
        expect(
            employees.filter((cell) => memberNames.some((name) => cell.includes(name))),
            'nothing was transferred, so no member has a job card for the day',
        ).toHaveLength(0);
        // Teardown: the scope's after-phase runCleanup deletes the run's five cards by id.
    });
});
