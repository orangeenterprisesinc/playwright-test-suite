// spec: test-plans/screens/records.md
// seed: tests/seed.spec.ts

/**
 * Terms list smoke — Grower Billing module-gated (PET-214).
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/records.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-111` |
 *
 * Relocated from `tests/webpet/term.spec.ts` (WP-0377). The single assertion
 * this spec carried is unchanged; what changed is the fixture
 * (`base.fixture`), the id/tag vocabulary, and the 403 branch, which used to
 * `return` bare after one absence assertion — see the note below.
 *
 * ## The silent-guard defect this migration fixes
 *
 * The source test's 403 branch asserted `navLink('terms')` absent, then
 * returned — reporting "passed" without the reporter ever seeing that no
 * licensed-path assertion ran. It now asserts `shell.sidebarNav` is visible
 * FIRST — the positive anchor proving the sidebar itself rendered, so the
 * absence check next cannot pass vacuously off a broken navigation — then the
 * same absence check, then an explicit `test.skip(true, '<reason>')` instead
 * of a bare `return`.
 *
 * ## Locale note
 *
 * `navLink('terms')` matches the English word "Terms"; `base.fixture` does
 * not pin locale, so on a non-English session this absence check would read
 * as vacuously true regardless of licensing. `sidebarNav` visible is the
 * closest available positive anchor (it proves the sidebar container itself
 * rendered); a fully locale-neutral assertion would need a page-object
 * change, out of scope for this code-level relocation.
 */
import { expect, test } from '@fixtures/base.fixture';

test.describe('Setup > Terms (Grower Billing)', { tag: ['@Screens', '@Records'] }, () => {

    test('[Term] Verify that the list page renders when the GrowerBilling module is enabled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-111' },
            { type: 'requirement', description: 'SCR-R145|SCR-R146' },
        ],
    }, async ({ pages }) => {
        const resp = await pages.termList.goto();
        if (resp && resp.status() === 403) {
            // GrowerBilling module not in PT_MODULES — acceptable in dev env.
            await pages.shell.gotoDashboard();
            // Positive anchor before the negative: proves the sidebar itself
            // rendered, so the absence check below cannot pass vacuously.
            await expect(pages.shell.sidebarNav).toBeVisible();
            await expect(pages.shell.navLink('terms')).toHaveCount(0);
            test.skip(true, 'GrowerBilling module not licensed on this environment (HTTP 403)');
            return;
        }
        await expect(pages.termList.heading).toBeVisible();
        // The "New Term" affordance is a Button-rendered-as-Link, so match either role.
        await expect(pages.termList.newTermButton.first()).toBeVisible();
    });

});
