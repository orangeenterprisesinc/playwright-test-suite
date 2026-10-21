import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { ListDateRangeComponent } from '../../components/ListDateRangeComponent';

/**
 * Input ▸ Job Card (`/input/job-cards`, catalog D6) — the screen D6 recalculates on (not View ▸ Job Cards,
 * `/view/job-cards`, a different screen). A date-scoped grid with a Multi Update selection mode and a bulk
 * Recalculate action.
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
    private readonly leftNav: LeftNavigationPage;
    private readonly dateRange: ListDateRangeComponent;
    readonly emptyState: Locator;
    readonly grid: Locator;
    readonly recalculateButton: Locator;
    /** Two-step Recalculate wizard (1/2 Record Selection, 2/2 Review Records) — replaced the one-step confirm in WEBPET-3847. */
    readonly wizard: Locator;
    private readonly searchByField: Locator;
    private readonly matchSelect: Locator;
    private readonly positionSelect: Locator;
    private readonly crewTextInput: Locator;
    private readonly crewCriterionLine: Locator;
    private readonly continueButton: Locator;
    private readonly reviewCount: Locator;
    private readonly executeButton: Locator;
    /** Edit Job Card form — read-only use; Delete and Save are deliberately not exposed. */
    readonly piecesInput: Locator;
    readonly pieceRateInput: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Job Cards', level: 1 });
        this.leftNav = new LeftNavigationPage(page);
        this.dateRange = new ListDateRangeComponent(page);
        this.emptyState = page.getByText('Choose a date range and click Apply to load records.');
        this.grid = page.getByRole('grid', { name: 'Job Cards' });
        this.recalculateButton = page.getByTestId('page-header-action-recalculate');
        this.wizard = page.getByRole('dialog', { name: /^Recalculate Job Cards/ });
        this.searchByField = this.wizard.getByTestId('view-job-cards-criteria-search-by');
        this.matchSelect = this.wizard.getByTestId('view-job-cards-criteria-match');
        this.positionSelect = this.wizard.getByTestId('view-job-cards-criteria-jobCardCrew-like-location');
        this.crewTextInput = this.wizard.getByTestId('view-job-cards-criteria-jobCardCrew-text');
        this.crewCriterionLine = this.wizard.getByTestId('view-job-cards-criteria-line-jobCardCrew-edit');
        this.continueButton = this.wizard.getByTestId('recalculate-selection-continue');
        this.reviewCount = this.wizard.getByTestId('recalculate-review-count');
        this.executeButton = this.wizard.getByTestId('recalculate-review-execute');
        this.piecesInput = page.locator('#pieces');
        this.pieceRateInput = page.locator('#pieceRate');
    }

    async goto(): Promise<void> {
        await this.leftNav.openScreen(['Input', 'Job Card'], this.pageUrl);
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** From/To = the same `YYYY-MM-DD` day, then Apply — the only way rows ever appear on this screen. */
    async applyDateRange(day: string): Promise<void> {
        await this.dateRange.apply(day);
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

    /** The Job cell of an already-located row (D10 has no Reference before the cards are read). */
    rowJob(row: Locator): Locator {
        return this.cellAt(row, 6);
    }

    rowAmount(row: Locator): Locator {
        return this.cellAt(row, 9);
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

    /** The Job cell text of every row for one crew, in grid order. */
    async jobsForCrew(crewName: string): Promise<string[]> {
        const rows = this.rowsForCrew(crewName);
        const count = await rows.count();
        const jobs: string[] = [];
        for (let i = 0; i < count; i += 1) jobs.push(((await this.rowJob(rows.nth(i)).textContent()) ?? '').trim());
        return jobs;
    }

    /** The Amount cell of every row for one crew, in grid order. NaN where the cell is not a number. */
    async amountsForCrew(crewName: string): Promise<number[]> {
        const rows = this.rowsForCrew(crewName);
        const count = await rows.count();
        const amounts: number[] = [];
        for (let i = 0; i < count; i += 1) {
            const text = ((await this.rowAmount(rows.nth(i)).textContent()) ?? '').replace(/[^0-9.-]/g, '');
            amounts.push(text === '' ? NaN : Number(text));
        }
        return amounts;
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

    async openRecalculateWizard(): Promise<void> {
        await this.recalculateButton.click();
        await this.wizard.waitFor({ state: 'visible', timeout: 15_000 });
    }

    /**
     * Step 1 criterion: Job Card Crew "Is Value" the crew name. Never Continue with empty criteria —
     * the wizard then targets every job card on the tenant — so the criterion line is asserted first.
     */
    async scopeToCrew(crewName: string): Promise<void> {
        if (!crewName.trim()) throw new Error('Recalculate wizard: refusing to scope with an empty crew name');
        await this.searchByField.click();
        await this.page.getByRole('option', { name: 'Job Card Crew', exact: true }).click();
        await this.matchSelect.click();
        await this.page.getByRole('option', { name: 'Contains', exact: true }).click();
        await this.positionSelect.click();
        await this.page.getByRole('option', { name: 'Is Value', exact: true }).click();
        await this.crewTextInput.fill(crewName);
        await expect(this.crewCriterionLine).toContainText(crewName, { timeout: 15_000 });
    }

    /** Continue to step 2 and return the "Record count" it reports, to be checked before {@link executeRecalculate}. */
    async continueToReview(): Promise<number> {
        await this.continueButton.click();
        await this.reviewCount.waitFor({ state: 'visible', timeout: 15_000 });
        return Number(/(\d+)/.exec((await this.reviewCount.textContent()) ?? '')?.[1] ?? NaN);
    }

    async executeRecalculate(): Promise<void> {
        await this.executeButton.click();
        await this.wizard.waitFor({ state: 'hidden', timeout: 15_000 });
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
