/**
 * Catalog workflow D9 — Group piece-out distribution (one crew piece-out split across the members who worked).
 * Data: src/data/journey-d/d09-group-piece-out-distribution.json · Plan: test-plans/journey-d/d09-group-piece-out-distribution.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyD9DistributionCaseSchema } from '@data/schemas/journeyDScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    FRESH_EXPORTED_CELL,
    assertTransferredOnScreen,
    commitTransfer,
    openScopedCandidates,
    openViewJobCardsForDay,
    prepareJourneyD9,
    recordOwnJobCardIds,
    seedCrewPieceOutDay,
} from '@utils/journeys/journeyDFlow';

test.describe('D9 · Group piece-out distribution', { tag: ['@JourneyD', '@D9'] }, () => {

    test('[Transfer] Distribute one crew piece-out across the two members who worked, and no one else.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'D9' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // Three Batch forms, up to five Setup forms on a cold fixture, two Transfer tabs and two edit
        // forms. A skipped-budget cleanup here is permanent residue on dev, so the budget is generous.
        test.setTimeout(360_000);

        // 1. Fixture rows on screen, preference gate, before-phase sweep.
        const scenario = await loadScenario(JourneyD9DistributionCaseSchema, testInfo);
        const deps = { sessionApi, testInfo, pages };
        const run = await prepareJourneyD9(scenario, deps);
        const { capture, expected } = run.scenario;
        const transfer = pages.transferToJobCards;
        const view = pages.viewJobCards;

        // 2. Crew time-in for the participants only, crew piece-out, crew time-out.
        const seed = await seedCrewPieceOutDay(run, deps);

        // 3-4. Scope the day, analyze, narrow to the crew, guard the roster — nothing has committed.
        const candidates = await openScopedCandidates(run, { pages, crew: run.crew.name }, seed);
        expect(candidates, 'the crew-scoped grid must offer exactly the run\'s own time cards').toHaveLength(expected.timeCards);

        // 5. The crew piece-out reads as one row with no employee, and the strip already carries the total.
        expect(await transfer.crewPieceOutRows(), 'the only row with no employee must be the crew piece-out').toEqual([seed.pieceOutReference]);
        await expect(await transfer.rowEmployee(seed.pieceOutReference), 'a crew piece-out carries no employee').toHaveText(expected.crewEmployeeCell);
        await expect(await transfer.rowPieces(seed.pieceOutReference), 'the piece-out row must carry the whole crew total').toHaveText(String(capture.numOfPieces));
        await expect(await transfer.rowType(seed.pieceOutReference), 'the row must be typed as a piece-out').toHaveText(expected.pieceOutType);
        await expect(await transfer.rowPayByPiece(seed.pieceOutReference), 'the piece-out must be pay-by-piece').toHaveText(expected.payByPiece);
        await expect.poll(() => transfer.piecesTotal(), { message: 'the totals strip must read the crew piece-out total before anything commits' }).toBe(capture.numOfPieces);
        await transfer.expectSelectAllUntouched('the header select-all must stay untouched');

        // 6. The pre-commit preview: one card per participant, none for the absent member.
        await transfer.openJobCardsTab();
        await expect.poll(async () => (await transfer.previewRows()).length, { message: 'the preview must propose one job card per participant' }).toBe(expected.jobCards);
        const preview = await transfer.previewRows();
        for (const member of run.participants) {
            const mine = preview.filter((row) => row.employee.includes(member.name));
            expect(mine, `the preview must list ${member.name} exactly once`).toHaveLength(1);
            expect(mine[0].pieces, `${member.name}'s previewed share`).toBe(expected.piecesPerCard);
        }
        for (const absent of run.nonParticipants) {
            await expect(transfer.previewGrid, `${absent.name} did not punch in and must not be previewed`).not.toContainText(absent.name);
        }
        await expect.poll(() => transfer.previewTotals(), { message: 'the preview totals bar' }).toEqual({
            pieces: capture.numOfPieces,
            jobCards: expected.jobCards,
            employees: run.participants.length,
        });
        await transfer.openTimeCardsTab();

        // 7. Commit: tick each own Reference, never the header checkbox. The toast is asserted inside.
        await commitTransfer(run, deps, seed, candidates, { jobCards: expected.jobCards, timeCards: expected.timeCards });
        await recordOwnJobCardIds(run, deps);

        // 8. The committed cards on /input/job-cards: who got one, and who did not.
        await pages.jobCards.goto();
        await pages.jobCards.applyDateRange(run.day);
        await expect(pages.jobCards.rowsForCrew(run.crew.name), 'the crew must end the day with exactly one job card per participant').toHaveCount(expected.jobCards);
        const references: string[] = [];
        for (const member of run.participants) {
            const row = pages.jobCards.rowForCrewEmployee(run.crew.name, member.name);
            await expect(row, `${member.name} must have exactly one job card`).toHaveCount(1);
            const reference = await pages.jobCards.referenceOf(row);
            references.push(reference);
            await expect(pages.jobCards.rowByReference(reference), `${member.name}'s card must be listed for the day`).toHaveCount(1);
            await expect(pages.jobCards.rowType(reference), `${member.name}'s card type`).toHaveText(expected.jobCardType);
            await expect(pages.jobCards.rowEmployee(reference), `${member.name}'s card names its employee`).toContainText(member.name);
        }
        for (const absent of run.nonParticipants) {
            await expect(pages.jobCards.grid, `${absent.name} must receive no job card`).not.toContainText(absent.name);
        }

        // 9. Each card's edit form carries the committed split; the form is left unsaved.
        for (const [index, member] of run.participants.entries()) {
            await pages.jobCards.openCardByReference(references[index]);
            expect(await pages.jobCards.readPieces(), `${member.name}'s Pieces on the edit form`).toBe(expected.piecesPerCard);
            expect(await pages.jobCards.readPieceRate(), `${member.name}'s Piece Rate on the edit form`).toBe(expected.pieceRate);
            await pages.jobCards.closeCard();
        }

        // 10. View ▸ Job Cards: exact values per row, and conservation over the Pieces cells.
        await openViewJobCardsForDay(pages, run.day);
        const rows = view.rowsForCrew(run.crew.name);
        await expect(rows, 'the crew must have exactly one job card per participant on View ▸ Job Cards').toHaveCount(expected.jobCards);
        let distributed = 0;
        for (let i = 0; i < expected.jobCards; i += 1) {
            const row = rows.nth(i);
            const reference = await view.referenceOf(row);
            const pieces = await view.readNumber(row, 'Pieces');
            distributed += pieces;
            expect(pieces, `job card ${reference} pieces`).toBe(expected.piecesPerCard);
            expect(await view.readNumber(row, 'Piece Rate'), `job card ${reference} piece rate`).toBe(expected.pieceRate);
            expect(await view.readNumber(row, 'Piece Amount'), `job card ${reference} piece amount`).toBe(expected.pieceAmount);
            expect(await view.readCell(row, 'Exported'), `job card ${reference} is not exported`).toBe(FRESH_EXPORTED_CELL);
        }
        expect(distributed, 'the per-card pieces must add up to the crew piece-out total').toBe(capture.numOfPieces);

        // 11. The transfer distributes the total; it does not rewrite the capture.
        await assertTransferredOnScreen(pages, run.day, (run.ctx.cards ?? []).map((c) => String(c.reference)), 'Yes', run.scenario.label);
        // The piece-out's Employee cell on View ▸ Time Cards is unmeasured: empty or the em dash the Transfer grid renders.
        const pieceOutRow = await pages.viewTimeCards.rowByReference(seed.pieceOutReference);
        expect([expected.crewEmployeeCell, ''], 'the crew piece-out must still carry no employee').toContain(await pages.viewTimeCards.readCell(pieceOutRow, 'Employee'));

        // 12. Cleanup — job cards by id, then the time cards, then the crew-scoped sweep.
        await run.cleanup();
    });

});
