// spec: test-plans/screens/inventory.md
// seed: tests/seed.spec.ts

/**
 * Inventory Setup screens — the five list pages plus the sidebar group that
 * reaches them.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/inventory.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-112`…`SCR-117` |
 *
 * Six source files became one: `inventory-center.spec.ts` (WP-0213),
 * `inventory-item-type.spec.ts` (WP-0214), `inventory-item.spec.ts` (WP-0215),
 * `inventory-setup.spec.ts` (WP-0216), `inventory-unit-type.spec.ts`
 * (WP-0217), `inventory-unit.spec.ts` (WP-0218). Every assertion below is the
 * one its source spec carried, in the same order and its own describe; what
 * changed is the fixture (`base.fixture`) and the id/tag vocabulary.
 */
import { expect, test } from '@fixtures/base.fixture';

// ── Inventory Center ─────────────────────────────────────────────────────────

/**
 * Smoke test for PET-210: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Header-only scope; the InventoryCenterItem
 * junction-table grid is deferred until PET-215 ships.
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage, one class
 * shared by all five Inventory Setup lists.
 */
test.describe('Inventory > Inventory Center', { tag: ['@Screens', '@Inventory'] }, () => {

    test('[Inventory] Verify that the Inventory Center list page renders and is no longer the stub.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-112' },
            { type: 'requirement', description: 'SCR-R200' },
        ],
    }, async ({ pages }) => {
        const list = pages.inventoryCenterList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // The create affordance is a Button-rendered-as-link (role=button, not link),
        // so getByRole('link', …) no longer matches it. Target the create anchor by its
        // href — stable regardless of how the button/link is styled.
        await expect(list.newLink).toBeVisible();
    });

});

// ── Inventory Item Type ──────────────────────────────────────────────────────

/**
 * Smoke test for PET-209: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Create + edit + multi-update flows are
 * exercised via manual verification (per the slice doc).
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
test.describe('Inventory > Inventory Item Type', { tag: ['@Screens', '@Inventory'] }, () => {

    test('[Inventory] Verify that the Inventory Item Type list page renders and is no longer the stub.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-113' },
            { type: 'requirement', description: 'SCR-R200' },
        ],
    }, async ({ pages }) => {
        const list = pages.inventoryItemTypeList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});

// ── Inventory Item ───────────────────────────────────────────────────────────

/**
 * Smoke test for PET-215: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Header-only scope; the InventoryCenterItem
 * junction-table grid is deferred until a follow-up that wires it on both
 * InventoryCenterFormPage and InventoryItemFormPage simultaneously.
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
test.describe('Inventory > Inventory Item', { tag: ['@Screens', '@Inventory'] }, () => {

    test('[Inventory] Verify that the Inventory Item list page renders and is no longer the stub.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-114' },
            { type: 'requirement', description: 'SCR-R200' },
        ],
    }, async ({ pages }) => {
        const list = pages.inventoryItemList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});

// ── Sidebar ───────────────────────────────────────────────────────────────────

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
 * Framework-aligned (Batch 04): this is a *sidebar* test, so its locators live
 * on AppShellPage rather than on any inventory list page.
 */

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

test.describe('Inventory Setup — module ON (default dev env)', { tag: ['@Screens', '@Inventory'] }, () => {
    // PET-207/208/209/210/215 replaced all five Inventory Setup routes with
    // real list pages. No placeholder routes remain — the placeholder-routes
    // test was removed when PET-215 landed.

    test('[Inventory] Verify that the sidebar shows the Inventory Setup group with its five live links.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-115' },
            { type: 'requirement', description: 'SCR-R201|SCR-R202' },
        ],
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

// ── Unit Type ─────────────────────────────────────────────────────────────────

/**
 * Smoke test for PET-207: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. The create + edit + multi-update flows are
 * exercised via manual verification (per the slice doc) since the seeded dev
 * DB is required for real records.
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
test.describe('Inventory > Unit Type', { tag: ['@Screens', '@Inventory'] }, () => {

    test('[Inventory] Verify that the Unit Type list page renders and is no longer the stub.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-116' },
            { type: 'requirement', description: 'SCR-R200' },
        ],
    }, async ({ pages }) => {
        const list = pages.inventoryUnitTypeList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        // Header reflects inventory:page.list.unitType.title (en locale).
        await expect(list.heading).toBeVisible();
        // The "New Unit Type" CTA is the list page's tell.
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});

// ── Unit ──────────────────────────────────────────────────────────────────────

/**
 * Smoke test for PET-208: list page resolves the real DataTable, not the
 * InventoryStubPage placeholder. Create + edit + multi-update flows are
 * exercised via manual verification (per the slice doc) since the seeded
 * dev DB is required for real records.
 *
 * Framework-aligned (Batch 04): locators live in InventoryListPage.
 */
test.describe('Inventory > Unit', { tag: ['@Screens', '@Inventory'] }, () => {

    test('[Inventory] Verify that the Unit list page renders and is no longer the stub.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-117' },
            { type: 'requirement', description: 'SCR-R200' },
        ],
    }, async ({ pages }) => {
        const list = pages.inventoryUnitList;
        await list.goto();
        await expect(list.stubPage).toHaveCount(0);
        await expect(list.heading).toBeVisible();
        // Create affordance is a Button-as-link (role=button); target the anchor by href.
        await expect(list.newLink).toBeVisible();
    });

});
