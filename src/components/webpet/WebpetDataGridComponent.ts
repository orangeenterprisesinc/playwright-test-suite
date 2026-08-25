/**
 * @fileoverview The web-pet list grid (post PET-424 DataGrid migration).
 *
 * A sibling of the framework's `DataGridComponent`, not a subclass, because the
 * two disagree on the two things that matter — verified against the 18 spec
 * files that touch a grid:
 *
 * | | framework `DataGridComponent` | web-pet |
 * |---|---|---|
 * | root | `getByRole('grid', { name: gridName })` | bare `[role="grid"]` — **no** web-pet spec gives the grid an accessible name, so the named lookup resolves to zero elements |
 * | row identity | `getByRole('link', { name: 'Edit Crop: <name>' })` | the row's own `a[href="/setup/ranches/${id}"]` — **id**-keyed on purpose: `ranch.spec.ts` records that a name can collide with a Department or Customer cell value in another row |
 *
 * Beyond listing rows, this grid supports inline cell editing, multi-row
 * selection with propagate-or-not, a global Undo, and URL-reflected sort and
 * filter state — all exercised by `ranch.spec.ts` and `field.spec.ts`.
 *
 * Most row-level helpers take the row `Locator` rather than reading state, so a
 * spec can hold a row and interrogate it repeatedly without re-querying.
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/** Escapes a value for safe interpolation into a `RegExp`. */
function escapeRe(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @extends BaseComponent
 */
export class WebpetDataGridComponent extends BaseComponent {
    /** Relative list URL this grid belongs to, e.g. `'/setup/ranches'`. */
    private readonly listUrl: string;

    /** Every row in the grid, including the header and filter rows. */
    readonly rows: Locator;
    /**
     * The create affordance.
     *
     * Matched on an `href` **prefix**, not a suffix: the list propagates its URL
     * state onto outbound links, so the real href is often
     * `/setup/ranches/new?sort=name.desc`. Targeting by href at all is
     * deliberate — it is a Button-rendered-as-link on some screens and a plain
     * anchor on others, so neither `getByRole('link')` nor `getByRole('button')`
     * matches everywhere.
     */
    readonly newLink: Locator;

    // ── Multi-row editing ───────────────────────────────────────────
    /** Toggles multi-select mode; paints `aria-pressed`. */
    readonly multiUpdateButton: Locator;
    /** The SelectedRowsBar's Undo pill — reverts the last inline or multi edit. */
    readonly undoButton: Locator;
    /**
     * The propagate-or-not prompt raised when editing a cell while rows are
     * selected.
     */
    readonly multiEditDialog: Locator;
    /** Applies the edit to every selected row. Its label carries the count. */
    readonly applyToAllButton: Locator;
    /** Applies the edit to the edited row only. */
    readonly justThisRowButton: Locator;

    // ── Insights strip ──────────────────────────────────────────────
    /** Expands the insights strip; reflected in the URL as `?expand=top`. */
    readonly expandToTopButton: Locator;
    /** Collapses the insights strip again. */
    readonly shrinkFromTopButton: Locator;

    constructor(page: Page, listUrl: string) {
        super(page, page.locator('[role="grid"]'));
        this.listUrl = listUrl;

        this.rows = this.root.locator('[role="row"]');
        this.newLink = page.locator(`a[href^="${listUrl}/new"]`).first();

        this.multiUpdateButton = page.getByRole('button', { name: /^Multi Update$/ });
        this.undoButton = page.getByRole('button', { name: /^Undo$/ });
        this.multiEditDialog = page.getByRole('dialog');
        // i18n resolves the confirm label to "Apply to all {{count}}", so the
        // count is part of the accessible name — match the prefix only.
        this.applyToAllButton = this.multiEditDialog.getByRole('button', { name: /^Apply to all/ });
        this.justThisRowButton = this.multiEditDialog.getByRole('button', { name: /^Just this row$/ });

        this.expandToTopButton = page.getByRole('button', { name: /Expand table to top/ });
        this.shrinkFromTopButton = page.getByRole('button', { name: /Shrink table from top/ });
    }

    // ── Locating rows ───────────────────────────────────────────────

    /**
     * The row owning `id`, found by the edit anchor it contains.
     *
     * Page-scoped rather than root-scoped, matching the lifted specs: several
     * screens render the row link outside the element carrying `role="grid"`.
     * Exact href, never a prefix — `^=` would also catch `/setup/ranches/10`
     * when looking for `/setup/ranches/1`.
     */
    rowById(id: number | string): Locator {
        return this.page
            .locator('[role="row"]')
            .filter({ has: this.page.locator(`a[href="${this.listUrl}/${String(id)}"]`) });
    }

    /** A row by position, including the header and filter rows (data starts at 2). */
    rowAt(index: number): Locator {
        return this.page.locator('[role="row"]').nth(index);
    }

    /**
     * Rows queried by ARIA **role** rather than by attribute.
     *
     * Kept separate from {@link rowAt} on purpose: `getByRole('row')` also matches
     * native `<tr>` elements through their implicit role, while
     * `[role="row"]` only matches an explicit attribute. On a pure DataGrid the
     * two agree — but the Employee Documents tab renders a real `<table>`, so a
     * page with both would resolve different sets.
     */
    get roleRows(): Locator {
        return this.page.getByRole('row');
    }

    /**
     * Data rows only — excludes header/filter rows.
     *
     * A positional lookup on {@link roleRows} assumes a fixed number of header rows
     * above the first data row; that offset isn't stable across environments.
     * A header/filter row's cells carry `role="columnheader"`, never `role="cell"`,
     * so filtering on cell presence identifies a data row structurally instead.
     */
    get dataRows(): Locator {
        return this.roleRows.filter({ has: this.page.getByRole('cell') });
    }

    /** A data row by position — see {@link dataRows}. */
    dataRowAt(index: number): Locator {
        return this.dataRows.nth(index);
    }

    /** A cell within `row` by column index. */
    cellAt(row: Locator, index: number): Locator {
        return row.getByRole('cell').nth(index);
    }

    /**
     * The editable control inside a cell.
     *
     * Editable cells render their current value as a button; clicking it enters
     * edit mode and, for a dropdown column, opens the combobox popup.
     */
    cellEditor(row: Locator, index: number): Locator {
        return this.cellAt(row, index).getByRole('button');
    }

    /** Options in an open cell-editor combobox. Portaled, so page-scoped. */
    get editorOptions(): Locator {
        return this.page.getByRole('option');
    }

    /** Any grid cell containing `text` — used for presence/absence on a filtered list. */
    cellByText(text: string): Locator {
        return this.page.locator(`[role="cell"]:has-text("${text}")`);
    }

    /** The edit anchor for `id`. */
    editLinkById(id: number | string): Locator {
        return this.page.locator(`a[href="${this.listUrl}/${String(id)}"]`).first();
    }

    /** Any edit anchor within `row` — used to assert the edit column exists at all. */
    editLinkIn(row: Locator): Locator {
        return row.locator(`a[href^="${this.listUrl}/"]`);
    }

    // ── Columns and filters ─────────────────────────────────────────

    /**
     * A column header by its visible label.
     *
     * Matched on **text**, not accessible name. The 2026-08-12 deploy added a
     * drag-to-reorder handle inside every header — `<button aria-label="Reorder
     * column">` as the first child — and that aria-label is folded into the
     * header's computed accessible name. Every anchored pattern the specs use
     * (`/^Name/`, `/^Active/`, …) stopped matching overnight, which cost six
     * list smokes in run 31587447655. The handle contributes no text, so the
     * header's text content is still the bare label and the anchors hold.
     */
    columnHeader(name: string | RegExp): Locator {
        return this.page.getByRole('columnheader').filter({ hasText: name });
    }

    /**
     * The nth column-header filter that is a Select rather than a text input.
     *
     * Scoped inside `[role="columnheader"]` so it cannot pick up the form-level
     * Selects elsewhere on the page.
     */
    filterSelectTrigger(index = 0): Locator {
        return this.page.locator('[role="columnheader"] [data-slot="select-trigger"]').nth(index);
    }

    /**
     * The nth text-filter input.
     *
     * Only text-filter columns render an input with the default `"Filter…"`
     * placeholder — combobox filters carry their own and number filters have
     * none — so the index counts *text* columns in DOM order, not all columns.
     * The page's global Search box uses a different placeholder and is
     * deliberately not matched.
     */
    textFilter(index = 0): Locator {
        return this.page.getByPlaceholder('Filter…').nth(index);
    }

    async filterTo(text: string, index = 0): Promise<void> {
        await this.textFilter(index).fill(text);
    }

    /** The scrolling body rowgroup — the virtualizer's scroll element. */
    get bodyScroller(): Locator {
        return this.root.locator('[role="rowgroup"]').last();
    }

    // Lists past the 100-row virtualization threshold render only the rows in
    // view, so a bare cellByText misses rows that exist. Walk the body one
    // viewport at a time until the cell renders or the scroller bottoms out.
    async findRowWithText(text: string): Promise<boolean> {
        const cell = this.cellByText(text);
        const body = this.bodyScroller;
        await body.evaluate((el) => { el.scrollTop = 0; });
        for (let i = 0; i < 100; i++) {
            if ((await cell.count()) > 0) return true;
            const atEnd = await body.evaluate((el) => {
                const before = el.scrollTop;
                el.scrollTop = before + el.clientHeight;
                return el.scrollTop === before;
            });
            // Two frames so the virtualizer commits the newly scrolled rows.
            await body.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            if (atEnd) break;
        }
        return (await cell.count()) > 0;
    }

    // Row-count independent reveal, for the spec to assert on cellByText after:
    // narrow by the text filter when the screen renders one (deleted lists have
    // none), else scroll the row into the rendered window.
    async revealRowWithText(text: string): Promise<void> {
        if ((await this.textFilter().count()) > 0) {
            await this.filterTo(text);
        } else {
            await this.findRowWithText(text);
        }
    }

    // ── Row-level controls ──────────────────────────────────────────

    /** The row's multi-select checkbox (the first checkbox in the row). */
    selectCheckbox(row: Locator): Locator {
        return row.getByRole('checkbox').first();
    }

    /**
     * The row's Active toggle, matched on the generic `"Active:"` prefix.
     *
     * Use {@link activeToggleNamed} where the row is one of several being
     * compared — the generic form would match whichever row it is scoped to,
     * which is fine, but the named form fails loudly if the scoping is wrong.
     */
    activeToggle(row: Locator): Locator {
        return row.getByRole('checkbox', { name: /^Active:/ });
    }

    /** The row's Active toggle, matched on `"Active: <name>"`. */
    activeToggleNamed(row: Locator, name: string): Locator {
        return row.getByRole('checkbox', { name: new RegExp('Active.*' + escapeRe(name)) });
    }

    /**
     * The nth empty-value cell button in a row.
     *
     * An empty editable cell renders as a button showing an em dash, and both
     * the combobox and text edit cells look identical when empty — so the index
     * is the only way to tell them apart, counting in column order.
     */
    emptyCellButton(row: Locator, index = 0): Locator {
        return row.getByRole('button').filter({ hasText: /^—$/ }).nth(index);
    }

    /** The inline text editor inside a row, once a text cell is open for editing. */
    cellTextbox(row: Locator): Locator {
        return row.getByRole('textbox');
    }

    /**
     * A cell in `row` displaying exactly `text` — used to assert an inline edit
     * committed, and (negated) that Undo reverted it.
     */
    cellWithText(row: Locator, text: string): Locator {
        return row.getByText(text, { exact: true });
    }

    /**
     * A cell in `row` containing `text`, not necessarily exactly.
     *
     * The negated counterpart of {@link cellWithText}: asserting the *absence* of
     * an exact match would still pass if the value were reverted to something
     * merely containing it, so the undo assertions use the looser form
     * deliberately.
     */
    cellContainingText(row: Locator, text: string): Locator {
        return row.getByText(text);
    }

    /** The "N selected" indicator on the SelectedRowsBar. */
    selectionCount(count: number): Locator {
        return this.page.getByText(new RegExp(`${String(count)} selected`));
    }

    // ── Actions ─────────────────────────────────────────────────────

    /** Waits for the grid itself to render — the list page's readiness signal. */
    async waitForGrid(): Promise<void> {
        await this.root.first().waitFor({ state: 'visible' });
    }

    /** Turn multi-select mode on (or off — it is a toggle). */
    async toggleMultiUpdate(): Promise<void> {
        await this.multiUpdateButton.click();
    }
}

export default WebpetDataGridComponent;
