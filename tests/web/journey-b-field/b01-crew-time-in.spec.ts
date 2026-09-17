/**
 * Catalog workflow B1 — Crew time-in: the office half (B1-001) and the relay transport on its own (B1-002).
 * Data: src/data/journey-b/b01-crew-time-in.json · Plan: test-plans/journey-b/b01-crew-time-in.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertExpectedCards, assertTransferGrid, runJourneyBScenario, runRelayEcho } from '@utils/journeys/journeyBFlow';

test.describe('B1 · Crew time-in', { tag: ['@JourneyB', '@B1'] }, () => {
    test('[Crew Time In] Deliver a crew time-in export to the office and verify the punches.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B1-001' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        try {
            const want = scenario.expected.envelope;
            for (const lookup of want.lookupContents!) {
                expect(run.envelope.lookupContents).toContain(lookup);
            }
            for (const code of want.employees!) {
                expect(run.envelope.employees).toContain(code);
            }
            for (const code of scenario.absentEmployees!) {
                expect(run.envelope.employees, 'the absentee must not be in the export').not.toContain(code);
            }
            expect(run.envelope.references).toHaveLength(scenario.records.length);
            expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);
            expect(run.cards).toHaveLength(scenario.expected.cards.length);
            assertExpectedCards(run, scenario.expected.cards);
            await assertTransferGrid(pages, run, scenario.expected.grid!);
        } finally {
            await run.cleanup();
        }
    });

    // No browser: nothing browser-side is destructured, and the only auto fixture (gate) needs none.
    test('[Relay] An export envelope pushed to a mailbox is returned unchanged.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B1-002' },
        ],
    }, async ({}, testInfo) => {
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runRelayEcho(scenario, { testInfo });
        try {
            expect(run.relay.url, 'DEVICE_RELAY_URL must be set (see .env.dev)').toBeTruthy();
            expect(run.send?.success, `relay rejected the push: ${run.send?.body}`).toBe(true);
            expect(run.pulled, 'nothing was queued for the smoke mailbox').not.toBeNull();
            // Byte fidelity: the relay stores the attachment verbatim.
            expect(run.pulled!.attachment).toBe(run.envelope.xml);
            expect(run.pulled!.attachment).toContain(run.envelope.references[0]);
            // The stored file name travels in `Body`; `Address` on the pull side is the SENDER.
            expect(run.pulled!.fileName).toBe(run.envelope.fileName);
            expect(run.pulled!.address).toBe(run.relay.from);
            expect(run.pulled!.subject).toBe(scenario.expected.relay!.subject);
        } finally {
            await run.cleanup();
        }
    });
});
