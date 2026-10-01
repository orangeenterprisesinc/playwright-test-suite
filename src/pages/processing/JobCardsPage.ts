import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * View (Input) > Job Card (`/input/job-cards`, catalog D6) — the screen D6 recalculates on. A
 * date-scoped grid with a Multi Update selection mode and a bulk Recalculate action.
 *
 * Locators confirmed live 2026-09-29 (heading, From/To, the three testids below all present in the
 * DOM). **No delete of any kind is exposed here by design** — see the plan's binding safety note:
 * the per-row "Delete Job Card ..." button and `job-cards/bulk-delete` are forbidden to the spec's
 * UI half; cleanup deletes over the API by explicit id (see journeyDFlow.ts / jobCardsApi.ts).
 *
 * The row checkboxes do not exist until Multi Update is pressed — they are `aria-hidden`,
 * `pointer-events:none` and `opacity:0` beforehand, and hovering reveals nothing.
 */
export class JobCardsPage extends BasePage {
    readonly pageUrl = '/input/job-cards';
    readonly pageTitle: string | RegExp = /Job Cards/i;

    readonly heading: Locator;
    readonly fromInput: Locator;
    readonly toInput: Locator;
    readonly applyButton: Locator;
    readonly emptyState: Locator;
    readonly grid: Locator;
    readonly multiUpdateButton: Locator;
    readonly selectionBar: Locator;
    readonly clearSelectionButton: Locator;
    readonly recalculateButton: Locator;
    readonly confirmDialog: Locator;
    readonly confirmRecalculateButton: Locator;
    readonly cancelDialogButton: Locator;
    /** Edit Job Card form — read-only use; Delete and Save are deliberately not exposed. */
    readonly piecesInput: Locator;
    readonly pieceRateInput: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Job Cards', level: 1 });
        this.fromInput = page.getByRole('textbox', { name: 'From' });
        this.toInput = page.getByRole('textbox', { name: 'To' });
        this.applyButton = page.getByTestId('list-date-range-apply');
        this.emptyState = page.getByText('Choose a date range and click Apply to load records.');
        this.grid = page.getByRole('grid', { name: 'Job Cards' });
        this.multiUpdateButton = page.getByTestId('page-header-action-multi-update');
        this.selectionBar = page.getByRole('region', { name: 'Selected rows actions' });
        this.clearSelectionButton = this.selectionBar.getByRole('button', { name: 'Clear selection' });
        this.recalculateButton = page.getByTestId('page-header-action-recalculate');
        this.confirmDialog = page.getByRole('alertdialog', { name: 'Recalculate job cards?' });
        this.confirmRecalculateButton = this.confirmDialog.getByRole('button', { name: 'Recalculate' });
        this.cancelDialogButton = this.confirmDialog.getByRole('button', { name: 'Cancel' });
        this.piecesInput = page.locator('#pieces');
        this.pieceRateInput = page.locator('#pieceRate');
    }

    async goto(): Promise<void> {
        await this.page.goto(this.pageUrl);
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** From/To = the same `YYYY-MM-DD` day, then Apply — the only way rows ever appear on this screen. */
    async applyDateRange(day: string): Promise<void> {
        await this.fromInput.fill(day);
        await this.toInput.fill(day);
        await this.applyButton.click();
        await this.applyButton.waitFor({ state: 'attached' });
    }

    rowByReference(reference: string): Locator {
        return this.page.getByRole('row', { name: reference });
    }

    /**
     * A cell by column index. Map (measured live 2026-10-01): 0 select · 1 delete (forbidden) ·
     * 2 Reference · 3 Date · 4 Type · 5 Employee · 6 Job · 7 Crew · 8 Ranch · 9 Amount · 10 Exp ·
     * 11 CA Exp · 12 Status · 13 Edit link. There is no Pieces column.
     */
    cellAt(row: Locator, index: number): Locator {
        return row.getByRole('cell').nth(index);
    }

    rowType(reference: string): Locator {
        return this.cellAt(this.rowByReference(reference), 4);
    }

    /** Rendered from the employee's exportIdentifier — assert with toContainText, never exact text. */
    rowEmployee(reference: string): Locator {
        return this.cellAt(this.rowByReference(reference), 5);
    }

    /** Data rows only — the header row carries no Edit link. */
    rowsForDay(): Locator {
        return this.grid.getByRole('row').filter({ has: this.page.getByRole('link', { name: /^Edit Job Card:/ }) });
    }

    /**
     * The day's rows for one crew. The grid is date-scoped only, and a dev fixture day carries other
     * people's cards — day -12 held a foreign manually-edited Time card for employee 767 on the first
     * D9 run — so a count over the whole day asserts someone else's data and can never be stable.
     * Exact match keeps "D9 CREW" off the "D9 JOB" cell.
     */
    rowsForCrew(crewName: string): Locator {
        return this.rowsForDay().filter({ has: this.page.getByRole('cell', { name: crewName, exact: true }) });
    }

    /** Opens the Edit Job Card form from the list. Read it, then {@link closeCard}; never save or delete here. */
    async openCardByReference(reference: string): Promise<void> {
        await this.page.getByRole('link', { name: `Edit Job Card: ${reference}` }).click();
        await expect(this.page.getByRole('heading', { name: `Edit Job Card: ${reference}`, level: 1 })).toBeVisible({ timeout: 30_000 });
    }

    private async readNumber(input: Locator): Promise<number> {
        await expect(input).not.toHaveValue('', { timeout: 30_000 });
        return Number((await input.inputValue()).replace(/,/g, ''));
    }

    readPieces(): Promise<number> {
        return this.readNumber(this.piecesInput);
    }

    readPieceRate(): Promise<number> {
        return this.readNumber(this.pieceRateInput);
    }

    /** Leaves the form unsaved by navigating back to the list, whose date range lives in the URL. */
    async closeCard(): Promise<void> {
        await this.page.goBack();
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** Reveals the row checkboxes — hidden by construction until this is pressed. */
    async enableSelection(): Promise<void> {
        await this.multiUpdateButton.click();
    }

    async selectByReference(reference: string): Promise<void> {
        await this.rowByReference(reference).getByRole('checkbox', { name: `Select ${reference}` }).check();
    }

    /**
     * The "N selected" count the selection bar reports. It is a count element, not the bar's only
     * button — the sole button there is "Clear selection", which does not contain "selected" — so
     * this reads the region's own text. Bounded deliberately: if the bar never appears, failing in
     * seconds keeps the test's own cleanup inside its budget, where a 240 s hang would strand the
     * committed job cards on dev.
     */
    async selectedCount(): Promise<number> {
        await this.selectionBar.waitFor({ state: 'visible', timeout: 15_000 });
        const text = (await this.selectionBar.textContent()) ?? '';
        return Number(/(\d+)\s*selected/i.exec(text)?.[1] ?? 0);
    }

    async recalculate(): Promise<void> {
        await this.recalculateButton.click();
        await this.confirmDialog.waitFor({ state: 'visible', timeout: 15_000 });
    }

    async confirmDialogText(): Promise<string> {
        return (await this.confirmDialog.textContent()) ?? '';
    }

    async confirmRecalculate(): Promise<void> {
        await this.confirmRecalculateButton.click();
        await this.confirmDialog.waitFor({ state: 'hidden', timeout: 15_000 });
    }

    /**
     * The completion toast, matched on its exact counts. Parameterised rather than fixed so the
     * expected numbers stay in the scenario file — but still an exact match, because a loose
     * "a toast appeared" would pass on `0 updated` and hide a recalculate that did nothing.
     */
    resultToast(summary: { updated: number; skipped: number; failed: number }): Locator {
        return this.page.getByText(
            `Recalculate complete: ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed.`,
        );
    }
}

export default JobCardsPage;
