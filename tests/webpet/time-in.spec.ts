/**
 * TimeInListPage e2e — WEBPET-666 regression.
 *
 * Guards the dropdown-column multi-edit path on an Input page whose combobox
 * editor options are keyed by *counter* (`value: String(ranchCounter)`), unlike
 * the Setup pages (Field, etc.) which key options by name. The bug: the column
 * `onCommit` resolved the selected entity by NAME (`r.name === newName`) while
 * `newName` was actually the counter string, so the lookup failed, `commitEdit`
 * was never called, and the value silently reverted with no update. Fixed by
 * resolving via counter (`String(r.ranchCounter) === newName`).
 *
 * Field's existing combobox propagation test does NOT cover this — Field keys
 * options by name, so it was never affected.
 *
 * Data: relies on seeded Time In records. A narrow date window (2025-12-01) is
 * used because that day has ~80 records (under the 100-row virtualization
 * threshold) so the first rows are reliably in the DOM. Mutations are restored
 * via Undo within the test.
 *
 * Framework-aligned (Batch 09): locators live in TimeInListPage and the grid
 * component. The Ranch column index is a named constant on the page object —
 * an off-by-one there silently drives the wrong column's editor.
 */
import { expect, test } from '@fixtures/webpet.fixture';

// Mutates shared Time In rows (ranchCounter) then restores via Undo — cannot
// run in parallel with itself.
test.describe.configure({ mode: 'serial' });

// A day known to carry multiple Time In records in the seed data.
const DAY = '2025-12-01';

test.describe('TimeInListPage — multi-edit dropdown (WEBPET-666)', { tag: ['@WebPet', '@wp-input', '@wp-timein', '@WPBatch09'] }, () => {

    test('[Time In] Verify that editing a counter-keyed Ranch dropdown in multi-edit persists to every selected row.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0378' },
    }, async ({ pages }) => {
        const list = pages.timeInList;
        const grid = list.grid;
        await list.gotoList();

        // Narrow to a populated day so the first data rows are present.
        await list.filterToDay(DAY);

        // Wait for at least two data rows (role="row" includes 2 header rows).
        await expect.poll(async () => grid.roleRows.count()).toBeGreaterThan(3);

        await grid.toggleMultiUpdate();

        // First two data rows (skip the column-header row + filter-header row).
        const rowA = grid.roleRowAt(2);
        const rowB = grid.roleRowAt(3);
        await grid.selectCheckbox(rowA).check();
        await grid.selectCheckbox(rowB).check();
        await expect(grid.selectionCount(2)).toBeVisible();

        const rowARanch = list.ranchEditor(rowA);
        const rowBRanch = list.ranchEditor(rowB);
        const originalA = (await rowARanch.textContent())?.trim() ?? '';
        const originalB = (await rowBRanch.textContent())?.trim() ?? '';

        // Enter edit mode on row A's Ranch cell → opens the base-ui combobox popup.
        await rowARanch.click();

        // Pick the first option whose text differs from row A's current ranch.
        const options = grid.editorOptions;
        await expect(options.first()).toBeVisible();
        const optionCount = await options.count();
        let chosen = '';
        for (let i = 0; i < optionCount; i++) {
            const txt = (await options.nth(i).textContent())?.trim() ?? '';
            if (txt && txt !== originalA) {
                chosen = txt;
                await options.nth(i).click();
                break;
            }
        }
        expect(
            chosen,
            'expected at least one ranch option different from the current value',
        ).not.toBe('');

        // The propagate dialog must appear (pre-fix: commitEdit was never called,
        // so no dialog appeared and the value reverted).
        await expect(grid.multiEditDialog).toBeVisible();
        await grid.applyToAllButton.click();

        // Both selected rows now show the chosen ranch (the edit actually stuck).
        await expect(rowARanch).toHaveText(chosen, { timeout: 10000 });
        await expect(rowBRanch).toHaveText(chosen, { timeout: 10000 });

        // Undo restores each row to its original ranch.
        await grid.undoButton.click();
        await expect(rowARanch).toHaveText(originalA, { timeout: 10000 });
        await expect(rowBRanch).toHaveText(originalB, { timeout: 10000 });
    });

});
