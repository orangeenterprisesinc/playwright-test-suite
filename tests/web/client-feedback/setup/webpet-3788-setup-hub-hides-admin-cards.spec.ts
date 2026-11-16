/**
 * WEBPET-3788 — Setup hub: a Clerk (neither super user nor Administrator) does not see Alias Field or Mobile Phone Carrier and is not authorized on their pages.
 * Data: src/data/client-feedback/webpet-3788-setup-hub-hides-admin-cards.json · Plan: test-plans/client-feedback/webpet-3788-setup-hub-hides-admin-cards.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { SetupHubAdminCardsCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { loginAsNonSu } from '@utils/client-feedback/clientFeedbackFlow';

test.describe('WEBPET-3788 · Setup hub hides the admin cards from a Clerk', { tag: ['@ClientFeedback', '@WEBPET-3788'] }, () => {
    test('A Clerk (neither super user nor Administrator) does not see Alias Field or Mobile Phone Carrier on the Setup hub and is not authorized on their pages', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3788' }],
    }, async ({ pages, browser }, testInfo) => {
        const s = await loadScenario(SetupHubAdminCardsCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const e = s.expected;

        // 1. As su: the Setup hub lists both cards (positive control).
        await pages.leftNav.openHub(s.hub);
        for (const c of s.hidden) await expect(pages.leftNav.hubCard(c.route), `su sees the ${c.title} card`).toContainText(c.title);

        // 2. Log in as the non-SU Clerk.
        const clerk = await loginAsNonSu(browser);
        try {
            // 3. The Clerk's Setup hub has the ordinary cards but neither admin card.
            const nav = clerk.pages.leftNav;
            await nav.openHub(s.hub);
            for (const c of s.visible) await expect(nav.hubCard(c.route), `the ${c.title} card is listed`).toContainText(c.title);
            for (const c of s.hidden) await expect(nav.hubCard(c.route), `no ${c.title} card for a Clerk`).toHaveCount(0);

            // 4-5. Typed addresses: the page renders "Not authorized" in place.
            for (const c of s.hidden) {
                await nav.openDeepLink(c.route, s.deepLinkReason);
                await expect(clerk.page, `${c.route} stays on its route`).toHaveURL(new RegExp(`${c.route}$`));
                await expect(nav.notAuthorized(e.notAuthorized), `${c.title}: Not authorized`).toBeVisible();
                await expect(nav.notAuthorized(e.permissionText), `${c.title}: the permission sentence`).toBeVisible();
                await expect(nav.notAuthorized(e.backLink), `${c.title}: Back to Dashboard`).toBeVisible();
            }
        } finally {
            await clerk.close();
        }
    });
});
