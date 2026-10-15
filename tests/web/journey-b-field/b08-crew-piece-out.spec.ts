/**
 * Catalog workflow B8 — Crew piece-out (PET-12646 / WEBPET-1527).
 * Data: src/data/journey-b/b08-crew-piece-out.json · Plan: test-plans/journey-b/b08-crew-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import {
    assertExpectedCards,
    cardOf,
    crewCardsOnDay,
    crewJobCardsOnDay,
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

        // 4. Step 1: the crew total is one employee-less card.
        expect(run.cards, 'the five imported cards').toHaveLength(expected.cards.length);
        assertExpectedCards(run, expected.cards);
        const piece = cardOf(run, expected.cards.find((c) => c.employeeCode === null)!.record);
        expect(piece.card.employeeCounter ?? null, 'a crew piece-out stores no employee').toBeNull();
        expect(piece.card.crewCounter, 'crew').toBe(run.office.crew.id);
        expect(piece.card.jobCounter, 'job').toBe(run.office.pieceJob!.id);
        expect(Number(piece.card.numOfPieces), 'the crew total').toBe(piece.expected.pieces);
        expect(piece.card.cardType).toBe(piece.expected.cardType);
        expect(piece.card.reference).toBe(run.recordReferences[piece.index]);
        expect(referencePart(String(piece.card.reference))).toBe(records[piece.index].part);

        const ownReferences = run.recordReferences.filter((r) => r !== '').sort();
        const crewCards = await crewCardsOnDay(run);
        expect(
            crewCards.map((c) => String(c.reference)).sort(),
            'the crew\'s open cards on the day are exactly this run\'s',
        ).toEqual(ownReferences);
        expect(
            crewCards.filter((c) => c.employeeCounter == null),
            'only the crew piece-out has no employee: no time-in was synthesized and no per-member piece-out exists',
        ).toHaveLength(records.filter((r) => r.employeeCode === undefined).length);

        // 5. Step 2: the Transfer screen, crew-scoped and before any commit, shows the crew total.
        const transfer = pages.transferToJobCards;
        const candidates = await openCrewTransferCandidates(pages, run);
        expect(candidates, 'the crew-scoped grid offers exactly the run\'s own time cards').toHaveLength(run.cards.length);
        const reference = run.recordReferences[piece.index];
        expect(await transfer.crewPieceOutRows(), 'the only row with no employee must be the crew piece-out').toEqual([reference]);
        await expect(transfer.rowEmployee(reference), 'a crew piece-out carries no employee').toHaveText(split.crewEmployeeCell);
        await expect(transfer.rowPieces(reference), 'the row carries the whole crew total').toHaveText(String(split.piecesTotal));
        await expect(transfer.rowType(reference), 'the row is typed as a piece-out').toHaveText(split.pieceOutType);
        await expect(transfer.rowPayByPiece(reference), 'the piece-out is pay-by-piece').toHaveText(split.payByPiece);
        await expect.poll(() => transfer.piecesTotal(), { message: 'the totals strip must read the crew total before anything commits' }).toBe(split.piecesTotal);
        await expect(transfer.selectAllRowsCheckbox, 'the header select-all stays untouched').not.toBeChecked();

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
        await transfer.openTimeCardsTab();
        expect(await crewJobCardsOnDay(run, split.members), 'nothing was transferred, so no member has a job card for the day').toHaveLength(0);
        expect(
            (await crewCardsOnDay(run)).map((c) => String(c.reference)).sort(),
            'after the preview every one of this run\'s cards is still open (untransferred)',
        ).toEqual(ownReferences);
        // Teardown: the scope's after-phase runCleanup deletes the run's five cards by id.
    });
});
