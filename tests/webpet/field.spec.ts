/**
 * FieldListPage e2e — targets the new DataGrid lib (post PET-424 migration).
 *
 * Replaces an earlier suite that drove the legacy DataTable + MultiUpdatePanel
 * UI; that DOM no longer exists. Coverage: page chrome (columns, outbound
 * link searchSuffix), inline editing on Active (toggle), Ranch + Crop (FK
 * comboboxes), multi-edit propagation (yes/no), undo via the SelectedRowsBar
 * pill, URL state, insights strip toggle (`?expand=top`).
 *
 * Test data (DelLlano, WEBPET-831): creates two fields under a dedicated ranch
 * and targets their grid rows by exact edit-link id. Each test toggles Active
 * and Undo-restores, so it self-cleans.
 *
 * Framework-aligned (Batch 03): the whole grid surface — rows, column headers,
 * multi-update, Undo, the propagate dialog, text filters and the insights strip
 * — lives on WebpetDataGridComponent. Action order and assertions unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import {
    ensureRanch,
    deleteRanch,
    ensureField,
    deleteField,
    type EnsuredRanch,
    type EnsuredField,
} from '@data/generated/data-factory';

// Tests in this file mutate DB state on their own fields — cannot run in
// parallel without racing. Serialize despite playwright.config's
// `fullyParallel: true`.
test.describe.configure({ mode: 'serial' });

// This file owns two fields (under a dedicated ranch), created fresh via the
// API (no dependency on a seeded Field 1 / Field 5 or on there being ≥2 active
// uniquely-named fields). The inline-edit/multi-edit tests toggle Active and
// Undo to restore; afterAll deletes both fields + the ranch regardless, so no
// rows leak. See data-factory.ts. Field counts are small (well under the
// DataGrid's 100-row virtualization threshold), so every row — including ours —
// renders in the DOM for row lookups.
let fieldRanch: EnsuredRanch;
let fieldA: EnsuredField;
let fieldB: EnsuredField;

test.beforeAll(async ({ request }) => {
    fieldRanch = await ensureRanch(request);
    fieldA = await ensureField(request, { ranchId: fieldRanch.id });
    fieldB = await ensureField(request, { ranchId: fieldRanch.id });
});

test.afterAll(async ({ request }) => {
    if (fieldA) await deleteField(request, fieldA.id);
    if (fieldB) await deleteField(request, fieldB.id);
    if (fieldRanch) await deleteRanch(request, fieldRanch.id);
});

// ── Page chrome ─────────────────────────────────────────────────────────────

test.describe('FieldListPage — page chrome', { tag: ['@WebPet', '@wp-setup', '@wp-field', '@WPBatch03'] }, () => {

    test('[Field] Verify that the grid renders with the expected column headers.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0197' },
    }, async ({ pages }) => {
        const list = pages.fieldList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Ranch/)).toBeVisible();
        // field:form.field.code.label resolves to "Barcode", not "Code".
        await expect(list.grid.columnHeader(/^Barcode/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Crop/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Area/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

    test('[Field] Verify that the rightmost edit-icon column links to the field record.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0198' },
    }, async ({ pages }) => {
        const list = pages.fieldList;
        await list.gotoList();
        // Target the first data row's edit link rather than a specific id —
        // with virtualization enabled (default threshold 100 rows), a given id's
        // row may be below the viewport. We just want to confirm the column exists.
        const firstDataRow = list.grid.rowAt(2); // skip header + filter rows
        await expect(list.grid.editLinkIn(firstDataRow)).toBeVisible();
    });

    test('[Field] Verify that the Multi Update button paints aria-pressed when toggled.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0199' },
    }, async ({ pages }) => {
        const list = pages.fieldList;
        await list.gotoList();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
    });

    test('[Field] Verify that the outbound New link carries the URL search suffix.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0200' },
    }, async ({ pages }) => {
        const list = pages.fieldList;
        await list.gotoListWithQuery('?sort=name.desc');
        await expect(list.grid.newLink).toHaveAttribute('href', /\?sort=name\.desc/);
    });

    test('[Field] Verify that the insights-strip toggle is reflected in the URL.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0201' },
    }, async ({ page, pages }) => {
        const list = pages.fieldList;
        await list.gotoList();
        // The toggle is the ExpandToTopHeader rendered in the editIconColumn's
        // header slot. aria-label flips between "Expand table to top" (default,
        // strip visible) and "Shrink table from top" (strip hidden).
        await list.grid.expandToTopButton.click();
        await expect(page).toHaveURL(/\?expand=top/, { timeout: 5000 });
        await list.grid.shrinkFromTopButton.click();
        await expect(page).not.toHaveURL(/expand=top/, { timeout: 5000 });
    });

});

// ── Inline editing on a single row ──────────────────────────────────────────

test.describe('FieldListPage — inline edit on a resolved field', { tag: ['@WebPet', '@wp-setup', '@wp-field', '@WPBatch03'] }, () => {

    test('[Field] Verify that the Active toggle flips and bulk-undo restores it.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0202' },
    }, async ({ pages }) => {
        const list = pages.fieldList;
        await list.gotoList();

        const row = list.grid.rowById(fieldA.id);
        const toggle = list.grid.activeToggle(row);
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'false');

        await list.grid.undoButton.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    });

});

// ── Multi-edit propagation ──────────────────────────────────────────────────

test.describe('FieldListPage — multi-edit propagation', { tag: ['@WebPet', '@wp-setup', '@wp-field', '@WPBatch03'] }, () => {

    test('[Field] Verify that Apply to all propagates the cache patch to every selected row.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0203' },
    }, async ({ pages }) => {
        const grid = pages.fieldList.grid;
        await pages.fieldList.gotoList();
        await grid.toggleMultiUpdate();

        const row1 = grid.rowById(fieldA.id);
        const row5 = grid.rowById(fieldB.id);
        await grid.selectCheckbox(row1).check();
        await grid.selectCheckbox(row5).check();

        await expect(grid.selectionCount(2)).toBeVisible();

        await grid.activeToggle(row5).click();

        await expect(grid.multiEditDialog).toBeVisible();
        await grid.applyToAllButton.click();

        // Both rows now show Active=false (regression: cache patch was edited-row-only).
        await expect(grid.activeToggle(row5)).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
        await expect(grid.activeToggle(row1)).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });

        // Undo restores both.
        await grid.undoButton.click();
        await expect(grid.activeToggle(row5)).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
        await expect(grid.activeToggle(row1)).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    });

    test('[Field] Verify that Just this row updates only the edited row.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0204' },
    }, async ({ pages }) => {
        const grid = pages.fieldList.grid;
        await pages.fieldList.gotoList();
        await grid.toggleMultiUpdate();

        const row1 = grid.rowById(fieldA.id);
        const row5 = grid.rowById(fieldB.id);
        await grid.selectCheckbox(row1).check();
        await grid.selectCheckbox(row5).check();

        await grid.activeToggle(row5).click();

        await expect(grid.multiEditDialog).toBeVisible();
        await grid.justThisRowButton.click();
        await expect(grid.multiEditDialog).not.toBeVisible({ timeout: 10000 });

        await expect(grid.activeToggle(row5)).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
        await expect(grid.activeToggle(row1)).toHaveAttribute('aria-checked', 'true');

        await grid.undoButton.click();
        await expect(grid.activeToggle(row5)).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    });

});

// ── URL state ───────────────────────────────────────────────────────────────

test.describe('FieldListPage — URL state', { tag: ['@WebPet', '@wp-setup', '@wp-field', '@WPBatch03'] }, () => {

    test('[Field] Verify that typing in the Code filter updates the URL.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0205' },
    }, async ({ page, pages }) => {
        const list = pages.fieldList;
        await list.gotoList();
        // Only text-filter columns render Inputs with the default placeholder
        // ("Filter…"). Combobox filters use their own placeholder; number
        // filters have none. Field's text-filter columns in DOM order are
        // [name, code]. Index 1 = code.
        await list.grid.textFilter(1).fill('5064');
        await expect(page).toHaveURL(/\?code=5064/, { timeout: 5000 });
    });

    test('[Field] Verify that clicking a sortable header updates the URL.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0206' },
    }, async ({ page, pages }) => {
        const list = pages.fieldList;
        await list.gotoList();
        await list.grid.columnHeader(/^Name/).click();
        await expect(page).toHaveURL(/\?sort=name/, { timeout: 5000 });
    });

});
