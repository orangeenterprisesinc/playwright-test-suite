/**
 * Dashboard shell — relocated Playwright coverage for Catalog workflow
 * **F1 — Real-time productivity dashboard**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-f/f01-dashboard-shell.md` |
 * | Runner rows | `src/data/runner/journey-f.csv` → `F1-002`…`F1-006` |
 *
 * Relocated from `tests/webpet/dashboard.spec.ts` (WP-0126…WP-0130). Every
 * assertion below is the one that spec carried, in the same order and the
 * same three describes; what changed is the fixture (`base.fixture`) and the
 * id/tag vocabulary. F1-002 carries the file's only `@Smoke` — the source
 * also marked F1-003 (WP-0127) smoke, but under the one-smoke-per-file rule
 * F1-003 demotes to `@HighLevel` here.
 */
import { expect, test } from '@fixtures/base.fixture';

test.describe('Dashboard shell — route + bootstrap', { tag: ['@JourneyF', '@F1'] }, () => {

    test('[Dashboard] Verify that the route loads and seeds a default board on first visit.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F1-002' },
            { type: 'requirement', description: 'F1-R1' },
        ],
    }, async ({ pages }) => {
        const dashboard = pages.dashboard;
        await dashboard.clearStoredBoards();
        await dashboard.gotoDashboard();

        await expect(dashboard.canvas).toBeVisible({ timeout: 10_000 });
        // (The board tabs strip [data-slot="tabs-list"] was removed from the dashboard
        // shell — DashboardTabs is no longer mounted by DashboardPage — so it's no longer
        // asserted here. The canvas + seeded widget cells are the shell's render signals.)
        // buildSampleLayout always seeds at least one widget cell on the default
        // board, so the canvas should never render the empty-state placeholder
        // on a fresh visit.
        await expect(dashboard.widgetCells.first()).toBeVisible({ timeout: 10_000 });
        expect(await dashboard.widgetCells.count()).toBeGreaterThan(0);
    });

    test('[Dashboard] Verify that the header shows a greeting and an Edit Widgets button.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F1-003' },
            { type: 'requirement', description: 'F1-R2' },
        ],
    }, async ({ pages }) => {
        const dashboard = pages.dashboard;
        await dashboard.clearStoredBoards();
        await dashboard.gotoDashboard();

        // The dashboard header was redesigned from a today's-date label to a
        // time-of-day greeting rendered as an <h2> ("Good morning/afternoon/
        // evening, <name>"). Assert the greeting shape (loose regex, name-agnostic)
        // so it survives time-of-day and user drift.
        await expect(dashboard.greeting).toContainText(/Good (morning|afternoon|evening),/);
        await expect(dashboard.editWidgetsButton).toBeVisible();
    });

});

test.describe('Dashboard shell — widget palette', { tag: ['@JourneyF', '@F1'] }, () => {

    test('[Dashboard] Verify that the Edit Widgets button toggles the palette open and closed.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F1-004' },
            { type: 'requirement', description: 'F1-R3' },
        ],
    }, async ({ pages }) => {
        const dashboard = pages.dashboard;
        await dashboard.clearStoredBoards();
        await dashboard.gotoDashboard();

        const firstPaletteItem = dashboard.paletteItems.first();

        // Closed state: the aside is in the DOM but has w-0 + overflow-hidden,
        // so its children are not visible.
        await expect(firstPaletteItem).not.toBeVisible();

        await dashboard.editWidgetsButton.click();
        await expect(dashboard.palette).toBeVisible();
        await expect(firstPaletteItem).toBeVisible({ timeout: 5_000 });

        // The header button label flips Add Widgets → Hide Widgets when open.
        await dashboard.doneButton.click();
        await expect(firstPaletteItem).not.toBeVisible();
    });

    test('[Dashboard] Verify that the palette plus-button appends a widget to the active board.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F1-005' },
            { type: 'requirement', description: 'F1-R4' },
        ],
    }, async ({ pages }) => {
        const dashboard = pages.dashboard;
        await dashboard.clearStoredBoards();
        await dashboard.gotoDashboard();

        await expect(dashboard.widgetCells.first()).toBeVisible({ timeout: 10_000 });
        const initialCount = await dashboard.widgetCells.count();

        await dashboard.editWidgetsButton.click();
        await expect(dashboard.palette).toBeVisible();

        // Each palette item exposes a per-item plus button whose accessible name
        // is "Add <widget title>" (palette.addWidget i18n key, en locale). The
        // palette aside also contains a single "Close palette" X button; scoping
        // to /^Add / + .first() picks the first widget's add button.
        await dashboard.firstAddWidgetButton.click();

        // The add path flushes the debounced save and fires an immediate
        // mutate, so the new cell mounts synchronously on the canvas.
        await expect(dashboard.widgetCells).toHaveCount(initialCount + 1);
    });

});

test.describe('Dashboard shell — persistence + reload', { tag: ['@JourneyF', '@F1'] }, () => {

    test('[Dashboard] Verify that a new widget persists and survives a full page reload.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F1-006' },
            { type: 'requirement', description: 'F1-R5' },
        ],
    }, async ({ page, pages }) => {
        const dashboard = pages.dashboard;
        await dashboard.clearStoredBoards();
        await dashboard.gotoDashboard();

        await expect(dashboard.widgetCells.first()).toBeVisible({ timeout: 10_000 });
        const initialCount = await dashboard.widgetCells.count();

        await dashboard.editWidgetsButton.click();
        await dashboard.firstAddWidgetButton.click();
        await expect(dashboard.widgetCells).toHaveCount(initialCount + 1);
        const afterAddCount = await dashboard.widgetCells.count();

        // Persistence moved from a LocalStorage document (pt.dashboards.v2) to the
        // server-backed ApiWidgetCanvasRepository (DashboardPage → useBoards). The
        // old localStorage-key assertion is therefore obsolete; the meaningful
        // round-trip the ticket calls out is that a full page reload rehydrates the
        // board from its (now server-side) store with the same widget count painted.
        await page.reload();
        await expect(dashboard.widgetCells.first()).toBeVisible({ timeout: 10_000 });
        await expect(dashboard.widgetCells).toHaveCount(afterAddCount);
    });

});
