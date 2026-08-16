/**
 * Setup-list smoke coverage for the PET-424 setup-core list page migrations.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2, A4, A5 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md`, `test-plans/journey-a/a04-crew-setup.md`, `test-plans/journey-a/a05-employee-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-056`, `A2-057`, `A4-013`, `A4-014`, `A5-019` |
 *
 * Relocated from `tests/webpet/setup-batch-b-smoke.spec.ts` (WP-0372…WP-0376).
 * Every assertion below is the one that spec carried, in the same order and
 * the same describes; what changed is the fixture (`base.fixture`), the
 * id/tag vocabulary — each describe now carries its own workflow tag
 * (`@A2`/`@A4`/`@A5`) instead of one shared web-pet tag set.
 *
 * Covers 3 representative shapes:
 *   - Crop: print-mechanical with alias (proxy for Department)
 *   - Crew: FK-mechanical + print + alias (proxy for Customer/Equipment)
 *   - Employee: dual-FK (proxy for any multi-FK page)
 *
 * Coverage is page-chrome only — full inline-edit / propagate / undo flows
 * are exercised exhaustively elsewhere.
 *
 * Three tests (`A2-056`, `A4-013`, `A5-019`) all carried web-pet's
 * `@wp-smoke` tag; a journey file allows at most one `@Smoke`, so `A2-056`
 * (the Crop list's page-chrome render) keeps it, and `A4-013` / `A5-019`
 * demote to `['@HighLevel', '@Regression']`.
 *
 * `test.describe.configure({ mode: 'serial' })` is carried over verbatim —
 * this is the only relocated file that owns it.
 */
import { expect, test } from '@fixtures/base.fixture';

test.describe.configure({ mode: 'serial' });

// ── Crop ───────────────────────────────────────────────────────────────────

test.describe('CropListPage smoke', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Crop] Verify that the list renders its grid, Multi Update toggle and Report button.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-056' },
            { type: 'requirement', description: 'A2-R70|A2-R71' },
        ],
    }, async ({ pages }) => {
        const list = pages.cropList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
        // The list-header print button is labelled "Report" (i18n common.reportLabel);
        // it was renamed from "Print Report" since this smoke test was written.
        await expect(list.reportButton).toBeVisible();

        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('[Crop] Verify that the outbound New Crop link carries the URL search suffix.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-057' },
            { type: 'requirement', description: 'A2-R72' },
        ],
    }, async ({ pages }) => {
        const list = pages.cropList;
        await list.gotoListWithQuery('?sort=name.desc');
        await expect(list.grid.newLink).toHaveAttribute('href', /\?sort=name\.desc/);
    });

});

// ── Crew ───────────────────────────────────────────────────────────────────

test.describe('CrewListPage smoke', { tag: ['@JourneyA', '@A4'] }, () => {

    test('[Crew] Verify that the list renders its grid with the Department FK column.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-013' },
            { type: 'requirement', description: 'A4-R13' },
        ],
    }, async ({ pages }) => {
        const list = pages.crewList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/Department/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

    test('[Crew] Verify that the Multi Update toggle paints aria-pressed.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A4-014' },
            { type: 'requirement', description: 'A4-R14' },
        ],
    }, async ({ pages }) => {
        const list = pages.crewList;
        await list.gotoList();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
    });

});

// ── Employee ────────────────────────────────────────────────────────────────

test.describe('EmployeeListPage smoke', { tag: ['@JourneyA', '@A5'] }, () => {

    test('[Employee] Verify that the list renders its grid with both Department and Crew FK columns.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-019' },
            { type: 'requirement', description: 'A5-R22' },
        ],
    }, async ({ pages }) => {
        const list = pages.employeeList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/Department/)).toBeVisible();
        await expect(list.grid.columnHeader(/Crew/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

});
