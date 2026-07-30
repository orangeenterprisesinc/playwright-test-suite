/**
 * Smoke test for PET-214 (Terms CRUD, Grower Billing module-gated). Verifies
 * the list page resolves when GrowerBilling is in PT_MODULES. If the dev env
 * doesn't enable GrowerBilling, the route 403s — handled by checking either
 * the heading OR the Forbidden response.
 *
 * Framework-aligned (Batch 01): locators live in TermListPage / AppShellPage.
 * The 403 branch is why `WebpetListPage.goto()` returns the response — the
 * status is the branch condition and is only readable from the return value.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe('Setup > Terms (Grower Billing)', { tag: ['@WebPet', '@wp-setup', '@wp-term', '@WPBatch01'] }, () => {

    test('[Term] Verify that the list page renders when the GrowerBilling module is enabled.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0377' },
    }, async ({ pages }) => {
        const resp = await pages.termList.goto();
        if (resp && resp.status() === 403) {
            // GrowerBilling module not in PT_MODULES — acceptable in dev env.
            // Sidebar entry is also hidden in this case (verified by adjacent assertion below).
            await pages.shell.gotoDashboard();
            await expect(pages.shell.navLink('terms')).toHaveCount(0);
            return;
        }
        await expect(pages.termList.heading).toBeVisible();
        // The "New Term" affordance is a Button-rendered-as-Link, so match either role.
        await expect(pages.termList.newTermButton.first()).toBeVisible();
    });

});
