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
 * The Ranch dropdown itself is a *global* list, not owned by the rows this test
 * edits — dev staging seeds exactly one Ranch, so "pick an option different
 * from the current value" has no candidate. `beforeAll` creates one extra,
 * uniquely-named Ranch via the API purely to widen that dropdown; it is never
 * assigned to a row.
 *
 * Framework-aligned (Batch 09): locators live in TimeInListPage and the grid
 * component. The Ranch column index is a named constant on the page object —
 * an off-by-one there silently drives the wrong column's editor.
 */
import { apiUrl } from '@config/webpetEnv';
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureRanch, deleteRanch, type EnsuredRanch } from '@data/generated/data-factory';

// Mutates shared Time In rows (ranchCounter) then restores via Undo — cannot
// run in parallel with itself.
test.describe.configure({ mode: 'serial' });

let extraRanch: EnsuredRanch;

test.beforeAll(async ({ request }) => {
    extraRanch = await ensureRanch(request, { namePrefix: 'E2ETimeInRanch' });
});

test.afterAll(async ({ request }) => {
    if (extraRanch) await deleteRanch(request, extraRanch.id);
});

/**
 * A day carrying at least `min` Time In rows, discovered from the API.
 *
 * Was a hardcoded `2025-12-01` "known to carry multiple records in the seed data".
 * That day has no rows on dev, so the grid rendered its two header rows and nothing
 * else and the test died at the row-count poll before reaching multi-edit — which is
 * what BUG-12 mistook for a multi-edit persistence defect.
 *
 * `GET /time-cards/time-in` unfiltered returns every row, so group by date and pick a
 * day that actually has enough. Returns null when no day qualifies, which the test
 * turns into a skip with a reason rather than a misleading row-count failure.
 */
async function findPopulatedDay(
    request: { get: (url: string) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> },
    min = 2,
): Promise<string | null> {
    const res = await request.get(apiUrl('/api/time-cards/time-in'));
    if (!res.ok()) return null;
    const rows = (await res.json()) as Array<{ dateTime?: string | null }>;
    const perDay = new Map<string, number>();
    for (const r of Array.isArray(rows) ? rows : []) {
        const day = (r.dateTime ?? '').slice(0, 10);
        if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    // Most-populated day first — the widest margin for the two rows the test edits.
    const best = [...perDay.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
}

test.describe('TimeInListPage — multi-edit dropdown (WEBPET-666)', { tag: ['@WebPet', '@wp-input', '@wp-timein', '@WPBatch09'] }, () => {

    test('[Time In] Verify that editing a counter-keyed Ranch dropdown in multi-edit persists to every selected row.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0378' },
    }, async ({ pages, request }) => {
        const day = await findPopulatedDay(request, 2);
        test.skip(
            day === null,
            'no day in Time In carries 2+ rows on this environment — multi-edit needs two rows to compare',
        );

        const list = pages.timeInList;
        const grid = list.grid;
        await list.gotoList();

        // Narrow to the discovered day so the first data rows are present.
        await list.filterToDay(day!);

        // Wait for at least two data rows.
        await expect.poll(async () => grid.dataRows.count()).toBeGreaterThan(1);

        await grid.toggleMultiUpdate();

        // First two data rows, identified structurally — see WebpetDataGridComponent.dataRows.
        const rowA = grid.dataRowAt(0);
        const rowB = grid.dataRowAt(1);
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
        // Options render their label asynchronously, so reading textContent as soon as
        // the first one is visible can return '' for every entry — which the loop below
        // then skips, leaving `chosen` empty and failing as if dev had only one ranch.
        // Wait for the labels to actually populate before comparing.
        await expect
            .poll(async () => (await options.first().textContent())?.trim() ?? '')
            .not.toBe('');

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
            `expected a ranch option different from row A's current value (${originalA}); saw ${String(optionCount)} option(s)`,
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
