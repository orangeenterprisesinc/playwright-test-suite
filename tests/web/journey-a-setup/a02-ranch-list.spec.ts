/**
 * RanchListPage e2e — list/inline-edit/multi-edit/URL-state coverage for
 * Catalog workflow **A2 — Ranch, field, crop, and variety setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-002`…`A2-012` |
 *
 * Relocated from `tests/webpet/ranch.spec.ts` (WP-0285…WP-0293, WP-0296,
 * WP-0297). The boundary-section tests (WP-0294/WP-0295) moved to
 * `a02-ranch-boundary.spec.ts` instead — see that file for why. Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`.
 *
 * Tests here mutate their own ranches (toggle Active, edit Worker Comp Code)
 * and Undo-restore, so they cannot run in parallel with each other — kept
 * serial despite `playwright.config`'s `fullyParallel: true` at `workers: 2`.
 *
 * The webpet original read/wrote `/api/ranches/:id` via `page.request` +
 * `apiUrl(...)` to sidestep a `request`-fixture origin quirk that does not
 * exist here — `sessionApi` already resolves the app's own origin, so the
 * guard helper below just takes `sessionApi` directly.
 */
import { expect, test } from '@fixtures/base.fixture';
import type { APIRequestContext } from '@playwright/test';
import { ensureRanch, deleteRanch, type EnsuredRanch } from '@data/generated/data-factory';

test.describe.configure({ mode: 'serial' });

// This file owns two ranches, created fresh via the API (no dependency on a
// seeded "Smith" / "BLAIR"). Mutated by the list/multi-edit tests (toggle
// Active, edit WCC) and restored via Undo; afterAll deletes both regardless,
// so no rows leak between runs. Ranch counts are small (well under the
// DataGrid's 100-row virtualization threshold), so every row — including
// ours — stays in the DOM for row lookups.
let ranchA: EnsuredRanch;
let ranchB: EnsuredRanch;

test.beforeAll(async ({ sessionApi }) => {
    ranchA = await ensureRanch(sessionApi);
    ranchB = await ensureRanch(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (ranchA) await deleteRanch(sessionApi, ranchA.id);
    if (ranchB) await deleteRanch(sessionApi, ranchB.id);
});

// Ensure a ranch's WorkerCompCode is null so its cell shows the "—" empty
// display (the WCC text-edit test starts from empty). Idempotence guard: a
// ranch already in the target state is left alone.
async function clearRanchWcc(api: APIRequestContext, id: number): Promise<void> {
    const r = await (await api.get(`/api/ranches/${id}`)).json();
    if (r.workerCompCode == null) return;
    await api.put(`/api/ranches/${id}`, {
        data: {
            active: true,
            departmentCounter: r.departmentCounter ?? null,
            workerCompCode: null,
            customerCounter: r.customerCounter ?? null,
            point: r.point ?? null,
            polygon: r.polygon ?? null,
            version: r.version,
        },
    });
}

// ── Page chrome ─────────────────────────────────────────────────────────────

test.describe('RanchListPage — page chrome', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Ranch] Verify that the page title reads "Ranches" and not the historic typo.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-002' },
            { type: 'requirement', description: 'A2-R1' },
        ],
    }, async ({ pages }) => {
        const list = pages.ranchList;
        await list.gotoList();
        // The page-header title is rendered via setPageHeader(...) into a known
        // slot. We assert text presence on the document; this fails if the
        // typo regression sneaks back in.
        await expect(list.titleText).toBeVisible();
        await expect(list.misspelledTitle).not.toBeVisible();
    });

    test('[Ranch] Verify that the grid renders with the expected column headers.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-003' },
            { type: 'requirement', description: 'A2-R2' },
        ],
    }, async ({ pages }) => {
        const list = pages.ranchList;
        await list.gotoList();
        await expect(list.grid.columnHeader(/^Name/)).toBeVisible();
        // Note: traceability:form.field.code.label translates to "Barcode" (legacy
        // alias) — RanchListPage reuses that key for the code column.
        await expect(list.grid.columnHeader(/^Barcode/)).toBeVisible();
        await expect(list.grid.columnHeader(/Department/)).toBeVisible();
        await expect(list.grid.columnHeader(/Worker Comp Code/)).toBeVisible();
        await expect(list.grid.columnHeader(/^Active/)).toBeVisible();
    });

    test('[Ranch] Verify that the rightmost edit-icon column links to the ranch record.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-004' },
            { type: 'requirement', description: 'A2-R3' },
        ],
    }, async ({ pages }) => {
        const list = pages.ranchList;
        await list.gotoList();
        await expect(list.grid.editLinkById(ranchA.id)).toBeVisible();
    });

    test('[Ranch] Verify that the Multi Update button paints aria-pressed when toggled.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-005' },
            { type: 'requirement', description: 'A2-R4' },
        ],
    }, async ({ pages }) => {
        const list = pages.ranchList;
        await list.gotoList();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
        await list.grid.toggleMultiUpdate();
        await expect(list.grid.multiUpdateButton).toHaveAttribute('aria-pressed', 'false');
    });

    test('[Ranch] Verify that the outbound New Ranch link carries the URL search suffix.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-006' },
            { type: 'requirement', description: 'A2-R5' },
        ],
    }, async ({ pages }) => {
        const list = pages.ranchList;
        await list.gotoListWithQuery('?sort=name.desc');
        await expect(list.grid.newLink).toHaveAttribute('href', /\?sort=name\.desc/);
    });

});

// ── Inline editing on a single row ──────────────────────────────────────────

test.describe('RanchListPage — inline edit on a resolved ranch', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Ranch] Verify that the Active toggle flips and bulk-undo restores it.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-007' },
            { type: 'requirement', description: 'A2-R6' },
        ],
    }, async ({ pages }) => {
        const grid = pages.ranchList.grid;
        await pages.ranchList.gotoList();

        const row = grid.rowById(ranchA.id);
        const toggle = grid.activeToggleNamed(row, ranchA.name);
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'false');

        // SelectedRowsBar's Undo restores it.
        await expect(grid.undoButton).toBeEnabled();
        await grid.undoButton.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    });

    test('[Ranch] Verify that a WorkerCompCode text edit applies and undo reverts it.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-008' },
            { type: 'requirement', description: 'A2-R7' },
        ],
    }, async ({ pages, sessionApi }) => {
        const grid = pages.ranchList.grid;
        await clearRanchWcc(sessionApi, ranchA.id);
        await pages.ranchList.gotoList();

        const row = grid.rowById(ranchA.id);
        // Both Department (ComboboxEditCell) and WorkerCompCode (TextEditCell) show
        // "—" when empty; Department's column comes first, so WCC's "—" button is
        // the second one. (All DelLlano ranches have a null department.)
        await grid.emptyCellButton(row, 1).click();

        const input = grid.cellTextbox(row);
        await input.fill('SMOKE-TEST');
        await input.press('Enter');

        // The row should now show "SMOKE-TEST".
        await expect(grid.cellWithText(row, 'SMOKE-TEST')).toBeVisible({ timeout: 10000 });

        // Undo restores.
        await grid.undoButton.click();
        await expect(grid.cellContainingText(row, 'SMOKE-TEST')).not.toBeVisible({ timeout: 10000 });
    });

});

// ── Multi-edit propagation (the bug we just fixed) ──────────────────────────

test.describe('RanchListPage — multi-edit propagation', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Ranch] Verify that Apply to all propagates the cache patch to every selected row.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-009' },
            { type: 'requirement', description: 'A2-R8' },
        ],
    }, async ({ pages }) => {
        const grid = pages.ranchList.grid;
        await pages.ranchList.gotoList();

        await grid.toggleMultiUpdate();

        // Exact href match — a prefix would also catch /setup/ranches/10,
        // /setup/ranches/11 etc. when those exist in the DB.
        const smithRow = grid.rowById(ranchA.id);
        const blairRow = grid.rowById(ranchB.id);
        await grid.selectCheckbox(smithRow).check();
        await grid.selectCheckbox(blairRow).check();

        await expect(grid.selectionCount(2)).toBeVisible();

        await grid.activeToggleNamed(blairRow, ranchB.name).click();

        await expect(grid.multiEditDialog).toBeVisible();
        // i18n yesLabel resolves to "Apply to all {{count}}" — matched by prefix.
        await grid.applyToAllButton.click();

        // After "yes" both rows should show Active=false in the UI. The test
        // regression-guards the bug where only the edited row's cache patched
        // (server applied to all but UI showed it as un-propagated).
        await expect(grid.activeToggleNamed(blairRow, ranchB.name)).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
        await expect(grid.activeToggleNamed(smithRow, ranchA.name)).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });

        // Undo restores both.
        await grid.undoButton.click();
        await expect(grid.activeToggleNamed(blairRow, ranchB.name)).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
        await expect(grid.activeToggleNamed(smithRow, ranchA.name)).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    });

    test('[Ranch] Verify that Just this row updates only the edited row.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-010' },
            { type: 'requirement', description: 'A2-R9' },
        ],
    }, async ({ pages }) => {
        const grid = pages.ranchList.grid;
        await pages.ranchList.gotoList();
        await grid.toggleMultiUpdate();

        const smithRow = grid.rowById(ranchA.id);
        const blairRow = grid.rowById(ranchB.id);
        await grid.selectCheckbox(smithRow).check();
        await grid.selectCheckbox(blairRow).check();

        await grid.activeToggleNamed(blairRow, ranchB.name).click();

        await expect(grid.multiEditDialog).toBeVisible();
        await grid.justThisRowButton.click();
        await expect(grid.multiEditDialog).not.toBeVisible({ timeout: 10000 });

        // BLAIR is inactive; Smith is still active.
        await expect(grid.activeToggleNamed(blairRow, ranchB.name)).toHaveAttribute('aria-checked', 'false', { timeout: 10000 });
        await expect(grid.activeToggleNamed(smithRow, ranchA.name)).toHaveAttribute('aria-checked', 'true');

        // Undo restores BLAIR.
        await grid.undoButton.click();
        await expect(grid.activeToggleNamed(blairRow, ranchB.name)).toHaveAttribute('aria-checked', 'true', { timeout: 10000 });
    });

});

// ── URL state ───────────────────────────────────────────────────────────────

test.describe('RanchListPage — URL state', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Ranch] Verify that typing in the Name filter updates the URL.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-011' },
            { type: 'requirement', description: 'A2-R10' },
        ],
    }, async ({ page, pages }) => {
        const list = pages.ranchList;
        await list.gotoList();
        // Text-filter columns render Inputs with the default "Filter…" placeholder;
        // Name is the first text-filter column. (A separate global Search box uses a
        // different placeholder — don't match it.)
        await list.grid.textFilter(0).fill('BLAIR');
        await expect(page).toHaveURL(/\?name=BLAIR/, { timeout: 5000 });
    });

    test('[Ranch] Verify that clicking a sortable header updates the URL.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-012' },
            { type: 'requirement', description: 'A2-R10' },
        ],
    }, async ({ page, pages }) => {
        const list = pages.ranchList;
        await list.gotoList();
        await list.grid.columnHeader(/^Name/).click();
        // Default-sort is `name asc` so the first click should produce desc.
        await expect(page).toHaveURL(/\?sort=name\.desc/, { timeout: 5000 });
    });

});
