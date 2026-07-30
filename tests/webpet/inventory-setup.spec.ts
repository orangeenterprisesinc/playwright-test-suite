/**
 * PET-200 — Inventory Module Gate + Route Scaffolding.
 *
 * Smoke coverage for the structural pieces that land in this slice:
 *   - The 5 placeholder routes resolve (no 404, the InventoryStubPage renders).
 *   - The seeded admin (with all modules enabled in the dev env) sees the
 *     Inventory Setup group in the sidebar with the expected 5 live links.
 *
 * The module-OFF case (sidebar group hidden + direct URL redirect) is
 * exercised structurally by <RequireModule>, which already has coverage in
 * adjacent module-gated route tests. Asserting it end-to-end requires a
 * second seeded session with PT_MODULES omitting "Inventory" — same harness
 * gap noted in data-scoping.spec.ts. Wiring that second session is out of
 * scope for PET-200; once the multi-fixture harness exists, extend this
 * spec with the OFF cases.
 *
 * Prereqs — same as every other spec:
 *   cd apps/api && go run .
 *   cd apps/web && pnpm dev
 *
 * Framework-aligned (Batch 04): this is a *sidebar* test, so its locators live
 * on AppShellPage rather than on any inventory list page.
 */
import { expect, test } from '@fixtures/webpet.fixture';

/**
 * The five Inventory Setup entries and the routes they must point at.
 *
 * Kept in the spec rather than a data module: it is the assertion itself, not
 * fixture data — the point of the test is that exactly these five links exist
 * with exactly these hrefs.
 */
const EXPECTED_LINKS = [
    { name: 'Inventory Item Type', href: '/setup/inventory/item-types' },
    { name: 'Inventory Item', href: '/setup/inventory/items' },
    { name: 'Inventory Center', href: '/setup/inventory/centers' },
    { name: 'Unit Type', href: '/setup/inventory/unit-types' },
    { name: 'Unit', href: '/setup/inventory/units' },
];

test.describe('Inventory Setup — module ON (default dev env)', { tag: ['@WebPet', '@wp-shell', '@wp-inventory', '@WPBatch04'] }, () => {
    // PET-207/208/209/210/215 replaced all five Inventory Setup routes with
    // real list pages. No placeholder routes remain — the placeholder-routes
    // test was removed when PET-215 landed.

    test('[Inventory] Verify that the sidebar shows the Inventory Setup group with its five live links.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0216' },
    }, async ({ pages }) => {
        const shell = pages.shell;
        await shell.gotoDashboard();

        // Open the Inventory Setup collapsible. The sidebar uses the group label
        // as the trigger button text.
        await expect(shell.navGroup('Inventory Setup')).toBeVisible();
        await shell.openNavGroup('Inventory Setup');

        // The 5 sub-items are anchor links once the module is on (PET-200);
        // before this slice they were disabled stubs.
        for (const { name, href } of EXPECTED_LINKS) {
            // navLinkExact is required — getByRole name matching is substring by
            // default, so 'Inventory Item' would also match 'Inventory Item Type'
            // and 'Unit' would match 'Unit Type', tripping strict mode now that
            // all 5 links are live.
            const link = shell.navLinkExact(name);
            await expect(link).toBeVisible();
            await expect(link).toHaveAttribute('href', href);
        }
    });

});
