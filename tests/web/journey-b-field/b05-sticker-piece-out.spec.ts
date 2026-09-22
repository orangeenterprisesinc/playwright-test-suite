/**
 * Catalog workflow B5 — Sticker piece-out (PET-12643 / WEBPET-1524).
 * Data: src/data/journey-b/b05-sticker-piece-out.json · Plan: test-plans/journey-b/b05-sticker-piece-out.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { analyzeTransferExceptions, cardOf, journeyBPreconditions, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B5 · Sticker piece-out', { tag: ['@JourneyB', '@B5'] }, () => {
    test('Deliver sticker piece-out records and verify attribution, totals and the Undefined-Employee fallback', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B5-001' },
        ],
    }, async ({ sessionApi }, testInfo) => {
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
                'fallback owner, so B5-R6 cannot be asserted without it. The field is read-only on ' +
                'the preferences screen, but no DB write is needed: run Help ▸ Administration ▸ ' +
                '"Add Standard Records to Database" (/settings/standard-records, or POST ' +
                'admin/standard-records) and it repoints the setting at the existing Undefined ' +
                `Employee record. Got: ${JSON.stringify(gates.undefinedEmployeeRaw)}`,
        ).toBe(true);

        const run = await runJourneyBScenario(scenario, { sessionApi, testInfo, gates });
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

        const [seeding, stickerA, stickerB, fallback] = expected.cards.map((c) => cardOf(run, c.record));
        const wantOfType = (type: number) => expected.cards.filter((c) => c.cardType === type).length;
        const cardsOfType = (type: number) => run.cards.filter((c) => Number(c.cardType) === type);
        expect(cardsOfType(seeding.expected.cardType!), 'the seeding Time In card').toHaveLength(wantOfType(seeding.expected.cardType!));
        expect(cardsOfType(stickerA.expected.cardType!), 'three piece-out cards').toHaveLength(wantOfType(stickerA.expected.cardType!));
        expect(seeding.card.employeeCounter).toBe(seeding.bound.employeeId);
        expect(seeding.card.crewCounter).toBe(run.office.crew.id);
        expect(seeding.card.ranchCounter).toBe(run.office.ranch.id);
        expect(seeding.card.fieldCounter).toBe(run.office.field.id);
        expect(seeding.card.jobCounter).toBe(run.office.job.id);
        expect(seeding.card.programCreated).toBe(true);

        // B5-R1/B5-R4: both 6006 piece cards attribute to 6006's id, pieces total 2.
        expect(stickerA.card.employeeCounter).toBe(stickerA.bound.employeeId);
        expect(stickerB.card.employeeCounter).toBe(stickerB.bound.employeeId);
        expect(
            Number(stickerA.card.numOfPieces) + Number(stickerB.card.numOfPieces),
            'B5-R4: pieces total across the two scans',
        ).toBe(stickerA.expected.pieces! + stickerB.expected.pieces!);

        // B5-R6: id equality, never merely non-null — the fallback ladder can land on a
        // wrong-but-non-null employee.
        expect(fallback.card.employeeCounter).toBe(gates.undefinedEmployeeId);

        // B5-R2/R3/R5/R7: shared shape for every piece card.
        for (const { card, expected: json, index } of [stickerA, stickerB, fallback]) {
            expect(String(card.traceabilityCode ?? ''), 'B5-R2: sticker stored verbatim').toBe(records[index].traceabilityCode);
            expect(card.jobCounter, 'B5-R7: no job carried through').toBeNull();
            expect(card.cardType, 'B5-R5: piece-out imports as cardType 0').toBe(json.cardType);
            expect(String(card.employeeSourceText ?? ''), 'N1: sticker source renders "Sticker Code"').toBe(json.employeeSourceText);
            expect(card.programCreated).toBe(true);
        }

        // ── B5-R7: the missing-job exception, from the same endpoint that feeds both the
        // Transfer screen and the Time Cards Exceptions panel ──
        const analyze = await analyzeTransferExceptions(run);
        const expectedCode = gates.requireJobInEmpPieceOut ? expected.analyze!.blockingCode : expected.analyze!.warningCode;
        const jobCounterIssues = analyze.exceptions.filter((e) => e.code === expectedCode);
        testInfo.annotations.push({
            type: 'missing-job-exception',
            description:
                `requireJobInEmpPieceOut=${String(gates.requireJobInEmpPieceOut)} → expected ` +
                `${expectedCode}; got ${jobCounterIssues.length}: "${jobCounterIssues[0]?.message ?? ''}"`,
        });
        expect(
            jobCounterIssues.length,
            `no ${expectedCode} exception in ${JSON.stringify(analyze.raw)}`,
        ).toBeGreaterThan(0);
        // The payload identifies cards by sourceTimeCardCounter, not by Reference — so join on
        // the ids this run's import produced, per card.
        const codesFor = (id: number) => analyze.exceptions.filter((e) => Number(e.sourceTimeCardCounter) === id).map((e) => e.code);
        for (const { card } of [stickerA, stickerB]) {
            expect(
                codesFor(card.timeCardCounter),
                `B5-R7: piece card ${card.timeCardCounter} must carry ${expectedCode}`,
            ).toContain(expectedCode);
        }
        expect(
            codesFor(fallback.card.timeCardCounter),
            `B5-R6/R7: the Undefined-Employee piece card ${fallback.card.timeCardCounter} must be flagged unusable`,
        ).toContain(expected.analyze!.undefinedEmployeeCode);
    });
});
