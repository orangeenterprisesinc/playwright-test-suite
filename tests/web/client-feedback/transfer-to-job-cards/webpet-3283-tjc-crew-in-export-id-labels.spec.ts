/**
 * WEBPET-3283 — Transfer to Job Cards ▸ Crew In: the employee list shows "Export ID : Name".
 * Data: src/data/client-feedback/webpet-3283-tjc-crew-in-export-id-labels.json · Plan: test-plans/client-feedback/webpet-3283-tjc-crew-in-export-id-labels.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { TjcCrewInLabelsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { ensureCfFixtures } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3283 · Transfer to Job Cards: Crew In employee labels', { tag: ['@ClientFeedback', '@WEBPET-3283'] }, () => {
    test('the Crew In employee list labels each employee as Export ID : Name', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3283' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        testInfo.slow();
        const s = await loadScenario(TjcCrewInLabelsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const tjc = pages.transferToJobCards;
        const deps = { sessionApi, testInfo, pages };

        // 0. Arrange: the crew's fixture rows (nothing is saved by this test).
        const fixtures = await ensureCfFixtures(deps, s.fixtureCrew);

        // 1. Open Transfer to Job Cards, then New record > Crew In.
        await tjc.openFromMenu();
        await tjc.openCrewIn();

        // 2. Tick Use Employee Crew and pick the crew; the roster loads.
        await tjc.setCrewInCheckbox('Use Employee Crew', true);
        await tjc.pickCrewInLookup('crewCounter', fixtures.crew.name);
        await expect(tjc.crewInRosterCount, 'the roster selects the whole crew').toHaveText(s.expected.rosterStatus);

        // 3. Each employee is listed as "<Export ID> : <Name>" (the fixture employees have no Export ID), never as the bare name.
        for (const label of s.expected.labels) {
            await expect(tjc.crewInEmployee(label), `${label} is listed`).toBeVisible();
        }
        for (const bare of s.expected.nameOnly) {
            await expect(tjc.crewInEmployee(bare), `${bare} is not listed without its Export ID prefix`).toBeHidden();
        }

        // 4. Close the sheet without saving.
        await tjc.closeCrewIn();
        await expect(tjc.crewInStatus, 'nothing was saved').toBeHidden();
    });
});
