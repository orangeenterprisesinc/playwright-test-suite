/**
 * Catalog workflow B7 — Undefined-employee reconciliation (PET-12645 / WEBPET-1526).
 * Data: src/data/journey-b/b07-undefined-employee-reconciliation.json
 * Plan: test-plans/journey-b/b07-undefined-employee-reconciliation.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { cardOf, codeHistoryOf, journeyBPreconditions, referencePart, runJourneyBScenario } from '@utils/journeys/journeyBFlow';

test.describe('B7 · Undefined-employee reconciliation', { tag: ['@JourneyB', '@B7'] }, () => {
    test('Deliver a roll assignment and employee-less sticker piece-outs, and verify the assigned prefix attributes to its owner while the unassigned one falls to the Undefined Employee', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B7-001' },
        ],
    }, async ({ sessionApi }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const gates = await journeyBPreconditions(scenario, { sessionApi, testInfo });
        // 0 would leave the importer binding nothing, so the card's employee would be NULL rather
        // than the Undefined Employee this test asserts.
        expect(
            Number.isFinite(gates.undefinedEmployeeId) && gates.undefinedEmployeeId > 0,
            'preferences.undefinedEmployee must be configured. The field itself is read-only on '
                + 'the preferences screen, but it does not need a DB write: run Help ▸ Administration ▸ '
                + '"Add Standard Records to Database" (/settings/standard-records, or POST '
                + 'admin/standard-records) and it repoints the setting at the existing Undefined '
                + `Employee record. Got: ${JSON.stringify(gates.undefinedEmployeeRaw)}`,
        ).toBe(true);

        const run = await runJourneyBScenario(scenario, { sessionApi, testInfo, gates });
        try {
            // run.scenario is the loaded file with the minted prefixes and stickers substituted.
            const { records, expected, sticker } = run.scenario;
            const [assignedPrefix] = run.codes;
            const recordsOf = (device: string) => records.filter((r) => r.device === device);

            // Both prefixes must be exactly what the office's own extraction yields, or the
            // equality the sticker rule performs can never match.
            for (const pair of expected.stickerPrefixes!) {
                expect(pair.prefix, 'the prefix the office extracts from the sticker').toBe(
                    pair.sticker.slice(sticker!.employeeCodeStartLocation - 1, sticker!.rollCodeStartLocation - 1),
                );
                expect(pair.prefix).toHaveLength(sticker!.rollCodeStartLocation - sticker!.employeeCodeStartLocation);
            }

            const [deviceA, deviceB] = run.deliveries;
            const [wantA, wantB] = expected.devices!;
            expect(deviceB.envelope.prefix, 'the two devices must not share a reference prefix').not.toBe(deviceA.envelope.prefix);
            expect(deviceA.envelope.sections).toEqual(wantA.envelope.sections);
            expect(deviceA.envelope.sectionLookups).toEqual(wantA.envelope.sectionLookups);
            expect(deviceA.envelope.alternateCodes).toEqual(wantA.envelope.alternateCodes);
            // The CH assignment gets its own reference internally but is kept out of the
            // card-identity list — a code-history row never becomes a time card.
            expect(deviceA.envelope.references, 'device A sends one card').toHaveLength(recordsOf(wantA.device).length);

            // KNOWN PRODUCT DEFECT — device A's file stops here, and the envelope is deliberately
            // NOT padded to get past it (see the JSON's _notes and the product-defect annotation).
            // Soft, so one run still exercises and reports the Undefined-Employee half
            // (B7-R3..B7-R7), which does not depend on the assignment. The test still fails; it
            // just stops hiding everything behind the first error.
            if (deviceA.file) {
                expect.soft(
                    deviceA.file.status,
                    `import of ${deviceA.envelope.fileName} (run ${deviceA.runId}): ${JSON.stringify(deviceA.file)}`,
                ).toBe(wantA.importStatus);
            }

            expect(deviceB.envelope.sections).toEqual(wantB.envelope.sections);
            for (const absent of wantB.envelope.absentSections!) {
                expect(deviceB.envelope.sections, 'device B holds no roll assignment, so it sends no code-history grid').not.toContain(absent);
            }
            expect(deviceB.envelope.employees).toEqual(wantB.envelope.employees);
            expect(deviceB.envelope.employeeSources, 'exactly two AlternateCode-sourced piece-outs').toEqual(wantB.envelope.employeeSources);
            expect(deviceB.envelope.pieceCounts, 'exactly two single-piece piece-outs').toEqual(wantB.envelope.pieceCounts);
            expect(deviceB.envelope.references, 'device B sends two cards').toHaveLength(recordsOf(wantB.device).length);
            if (deviceB.file) {
                expect(
                    deviceB.file.status,
                    `import of ${deviceB.envelope.fileName} (run ${deviceB.runId}): ${JSON.stringify(deviceB.file)}`,
                ).toBe(wantB.importStatus);
            }

            const [timeIn, unassigned, assigned] = expected.cards.map((c) => cardOf(run, c.record));
            const wantOfType = (type: number) => expected.cards.filter((c) => c.cardType === type).length;
            const cardsOfType = (type: number) => run.cards.filter((c) => Number(c.cardType) === type);
            expect(cardsOfType(timeIn.expected.cardType!), "the Time In card, keyed by device A's own reference").toHaveLength(
                wantOfType(timeIn.expected.cardType!),
            );
            expect(timeIn.card.employeeCounter).toBe(timeIn.bound.employeeId);
            expect(timeIn.card.crewCounter).toBe(run.office.crew.id);
            expect(timeIn.card.ranchCounter).toBe(run.office.ranch.id);
            expect(timeIn.card.fieldCounter).toBe(run.office.field.id);
            expect(timeIn.card.jobCounter).toBe(run.office.job.id);
            expect(timeIn.card.programCreated).toBe(true);
            expect(String(timeIn.card.traceabilityCode ?? '')).toBe(records[timeIn.index].traceabilityCode);

            // B7-R1: the roll's extracted prefix lands as the employee's own code-history alternate
            // code, windowed to this punch day. Soft, and guarded, for the same reason device A's
            // import status is: both fail together on the PayPeriod defect, and stopping here would
            // leave the Undefined-Employee half unexercised on every run.
            const history = await codeHistoryOf(run, timeIn.expected.employeeCode);
            const historyRow = history.find((h) => h.alternateCode === assignedPrefix);
            expect.soft(historyRow, 'B7-R1: no code-history row carries the assigned prefix — see the product-defect annotation').toBeDefined();
            if (historyRow) {
                expect.soft(historyRow.startDateTime, 'startDateTime must be set — a NULL never satisfies the window').toBeTruthy();
                expect.soft(String(historyRow.startDateTime)).toMatch(new RegExp(`^${run.day}`));
            }

            expect(cardsOfType(unassigned.expected.cardType!), 'both piece-out cards').toHaveLength(wantOfType(unassigned.expected.cardType!));
            // B7-R3: a prefix matching no same-day assignment falls back to the configured
            // Undefined Employee — id equality, never merely non-null.
            expect(unassigned.card.employeeCounter).toBe(gates.undefinedEmployeeId);
            // B7-R2: a prefix matching a same-day assignment attributes to that assignment's own
            // employee. Soft with B7-R1 — there is no assignment to match while the PayPeriod defect
            // blocks the grid, so this fails for the same single cause and must not mask B7-R4..R7.
            expect.soft(assigned.card.employeeCounter, 'B7-R2').toBe(assigned.bound.employeeId);
            // B7-R4: the fallback records why on the card's memo.
            expect(String(unassigned.card.memo ?? '')).toMatch(new RegExp(unassigned.expected.memoPattern!));
            // B7-R5: an alternate-code employee source reports as "Sticker Code".
            expect(String(unassigned.card.employeeSourceText ?? '')).toBe(unassigned.expected.employeeSourceText);
            expect(String(assigned.card.employeeSourceText ?? '')).toBe(assigned.expected.employeeSourceText);
            // B7-R6: the full scanned sticker and piece count survive verbatim.
            expect(String(unassigned.card.traceabilityCode ?? '')).toBe(records[unassigned.index].traceabilityCode);
            expect(String(assigned.card.traceabilityCode ?? '')).toBe(records[assigned.index].traceabilityCode);
            expect(Number(unassigned.card.numOfPieces)).toBe(unassigned.expected.pieces);
            expect(Number(assigned.card.numOfPieces)).toBe(assigned.expected.pieces);
            // B7-R7: keyed by the device's own PO reference, stored as time-out.
            expect(referencePart(String(unassigned.card.reference))).toBe(records[unassigned.index].part);
            expect(referencePart(String(assigned.card.reference))).toBe(records[assigned.index].part);
            expect(unassigned.card.cardType).toBe(unassigned.expected.cardType);
            expect(assigned.card.cardType).toBe(assigned.expected.cardType);
        } finally {
            await run.cleanup();
        }
    });
});
