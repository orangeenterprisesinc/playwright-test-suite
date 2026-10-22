import { Locator, Page, Response, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

export interface TimeCardQuestionAnswer {
    question: string;
    response: string;
}

/** The Edit Time In / Edit Time Out sheet, read field by field. Read-only: Save is never exposed. */
export interface TimeCardRecordView {
    reference: string;
    dateTime: string;
    employee: string;
    employeeSelection: string;
    workCrew: string;
    ranch: string;
    field: string;
    job: string;
    traceability: string;
    pieces: string;
    /** null when the GPS field is not rendered (module-gated on dev). */
    gps: string | null;
    transferred: string;
    /** Text beside the "Unedited" label; null when the sheet carries no such label. */
    unedited: string | null;
    memo: string;
    questions: TimeCardQuestionAnswer[];
}

const ordinal = (n: number): string => {
    if (n % 10 === 1 && n % 100 !== 11) return 'st';
    if (n % 10 === 2 && n % 100 !== 12) return 'nd';
    if (n % 10 === 3 && n % 100 !== 13) return 'rd';
    return 'th';
};

/**
 * View ▸ Time Cards (`/view/time-cards`) — the read side of every time card, transferred or not.
 * Locators measured on dev 2026-10-22. The grid loads nothing until Apply Filter, hides transferred
 * rows until "Include transferred records" is ticked, and virtualises past ~100 rows, so a row is
 * always found through the Reference column filter first.
 *
 * Read-only on purpose: the Edit sheet is opened to read and left through Cancel, never Save.
 */
export class ViewTimeCardsPage extends BasePage {
    readonly pageUrl = '/view/time-cards';
    readonly pageTitle: string | RegExp = /Time Cards/i;

    readonly heading: Locator;
    readonly grid: Locator;
    readonly dateRange: Locator;
    readonly includeTransferred: Locator;
    readonly recordSheet: Locator;

    private readonly leftNav: LeftNavigationPage;
    private openedReference = '';

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.heading = page.getByRole('heading', { name: 'Time Cards', level: 1 });
        this.grid = page.getByRole('grid', { name: 'Time Cards' });
        this.dateRange = page.getByTestId('selection-date-range');
        this.includeTransferred = page.getByTestId('view-time-cards-include-transferred');
        this.recordSheet = page.getByTestId('view-time-cards-action-sheet');
    }

    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(['View', 'Time Cards'], this.pageUrl);
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** One calendar click collapses the range onto the day; the collapse is read back before Apply. Nothing loads until {@link applyFilter}. */
    async scopeToDay(day: string): Promise<void> {
        const [year, month, date] = day.split('-');
        const target = new Date(Number(year), Number(month) - 1, Number(date));
        await this.expandFilter();
        await this.dateRange.getByRole('button', { name: 'Start Date/Time In – Last Date/Time In' }).click({ timeout: 15_000 });
        const popup = this.page.getByRole('dialog');
        await popup.waitFor({ state: 'visible', timeout: 10_000 });

        const monthName = target.toLocaleString('en-US', { month: 'long' });
        const dayCell = popup.getByRole('button', { name: new RegExp(`${monthName} ${target.getDate()}${ordinal(target.getDate())}, ${target.getFullYear()}`) });
        const previousMonth = popup.getByRole('button', { name: /go to the previous month/i });
        for (let i = 0; i < 12 && (await dayCell.count()) === 0; i += 1) await previousMonth.click();
        await dayCell.first().waitFor({ state: 'visible', timeout: 10_000 });
        await dayCell.first().click();

        // A third click would toggle the range back off, so this reads state rather than clicking blindly.
        const daySegments = popup.getByRole('textbox', { name: 'Day' });
        const collapsed = async () =>
            (await daySegments.nth(0).inputValue()) === String(target.getDate()) && (await daySegments.nth(1).inputValue()) === String(target.getDate());
        if (!(await collapsed())) await dayCell.first().click();
        await popup.getByRole('button', { name: /^apply$/i }).click();

        // The bar reads "10/13/26 12:00 AM – 10/13/26 11:59 PM" once collapsed; the year may be 2 or 4 digits.
        const part = `0?${Number(month)}/0?${Number(date)}/(?:${year}|${year.slice(-2)})`;
        await expect(this.dateRange, `the date scope must read ${month}/${date}/${year} – ${month}/${date}/${year}`).toContainText(
            new RegExp(`${part}.*[–-].*${part}`, 's'),
            { timeout: 20_000 },
        );
    }

    /** Once loaded the filter collapses to "<from> – <to> · Edit filter". */
    async expandFilter(): Promise<void> {
        const editFilter = this.page.getByTestId('view-time-cards-edit-filter');
        if (await editFilter.isVisible()) await editFilter.click();
        await this.dateRange.waitFor({ state: 'visible', timeout: 10_000 });
    }

    async applyFilter(): Promise<void> {
        await this.load(this.page.getByTestId('view-time-cards-apply'));
    }

    async refresh(): Promise<void> {
        await this.load(this.page.getByTestId('view-time-cards-filter-refresh'));
    }

    private async load(button: Locator): Promise<void> {
        const isFilterGet = (r: Response) => {
            const url = new URL(r.url());
            return r.request().method() === 'GET' && /\/time-cards\/?$/.test(url.pathname);
        };
        const loaded = this.page.waitForResponse(isFilterGet, { timeout: 15_000 });
        loaded.catch(() => undefined);
        await button.click();
        let response = await loaded.catch(() => null);
        if (!response) {
            // Apply Filter with unchanged criteria serves the cached query and sends nothing; Refresh refetches.
            const refetched = this.page.waitForResponse(isFilterGet, { timeout: 60_000 });
            await this.page.getByTestId('view-time-cards-filter-refresh').click({ timeout: 15_000 });
            response = await refetched;
        }
        expect(response.status(), 'GET time-cards for the filter').toBe(200);
        await expect(this.page.getByTestId('data-grid-count').first()).toBeVisible({ timeout: 30_000 });
    }

    /** Client-side: the rows appear or vanish at once, no request. Hidden by default. */
    async setIncludeTransferred(on: boolean): Promise<void> {
        await this.includeTransferred.waitFor({ state: 'visible', timeout: 15_000 });
        if ((await this.includeTransferred.isChecked()) !== on) await this.includeTransferred.click();
        if (on) await expect(this.includeTransferred).toBeChecked({ timeout: 10_000 });
        else await expect(this.includeTransferred).not.toBeChecked({ timeout: 10_000 });
    }

    /** Options come from the loaded rows, so this only works after {@link applyFilter}. */
    async filterByCrew(name: string): Promise<void> {
        await this.pickChip('view-time-cards-grid-filter-crews', /Search (work )?crews?/i, name);
    }

    async filterByEmployee(name: string): Promise<void> {
        await this.pickChip('view-time-cards-grid-filter-employees', /Search employees?/i, name);
    }

    private async pickChip(testId: string, searchName: RegExp, name: string): Promise<void> {
        await this.page.getByTestId(testId).click();
        const search = this.page.getByRole('searchbox', { name: searchName });
        await search.fill(name);
        await this.page.getByRole('button', { name, exact: true }).click();
        await expect(this.page.getByRole('button', { name: /^Clear \(\d+\)$/ })).toBeVisible({ timeout: 10_000 });
        await this.page.keyboard.press('Escape');
        await expect(search).toBeHidden({ timeout: 10_000 });
    }

    /** "Total 2 rows" under the grid. */
    async totalRows(): Promise<number> {
        const text = (await this.page.getByTestId('data-grid-count').first().innerText({ timeout: 15_000 })).trim();
        const match = /Total\s+([\d,]+)\s+rows?/i.exec(text);
        if (!match) throw new Error(`The grid count reads "${text}", which carries no "Total N rows"`);
        return Number(match[1].replace(/,/g, ''));
    }

    /** Names of the first header row, prefix "Reorder column " stripped. */
    private async headerTexts(): Promise<string[]> {
        const headers = this.grid.getByRole('row').first().getByRole('columnheader');
        await expect(headers.first()).toBeVisible({ timeout: 15_000 });
        return (await headers.allInnerTexts()).map((h) => h.replace(/^Reorder column /, '').split('\n')[0].trim());
    }

    private indexOfHeader(headers: string[], header: string): number {
        const index = headers.findIndex((h) => h.toLowerCase() === header.toLowerCase());
        if (index < 0) throw new Error(`Time Cards grid has no '${header}' column; headers are ${JSON.stringify(headers)}`);
        return index;
    }

    /** The Reference filter is the "Filter…" textbox in the second header row, under the Reference header. */
    private async filterByReference(reference: string): Promise<void> {
        const index = this.indexOfHeader(await this.headerTexts(), 'Reference');
        const box = this.grid.getByRole('row').nth(1).getByRole('columnheader').nth(index).getByPlaceholder('Filter…');
        await expect(box, `no "Filter…" textbox under the Reference header (column ${index})`).toBeVisible({ timeout: 10_000 });
        if ((await box.inputValue()) !== reference) await box.fill(reference);
    }

    /** Typing the Reference filter first keeps the row inside the virtualised window. */
    async rowByReference(reference: string): Promise<Locator> {
        await this.filterByReference(reference);
        const row = this.grid.getByRole('row', { name: reference, exact: true });
        await expect(row, `no Time Cards row with Reference ${reference} (is "Include transferred records" on?)`).toBeVisible({ timeout: 30_000 });
        return row;
    }

    /** One row's cell by header. The header row may carry leading blank cells, so alignment is from the right. */
    async cellByHeader(row: Locator, header: string): Promise<Locator> {
        const headers = await this.headerTexts();
        const index = this.indexOfHeader(headers, header);
        const cells = row.getByRole('cell');
        const offset = (await cells.count()) - headers.length;
        return cells.nth(index + offset);
    }

    async readCell(row: Locator, header: string): Promise<string> {
        return ((await (await this.cellByHeader(row, header)).innerText()) ?? '').trim();
    }

    /** Click the row's "Edit Time Card: <id>" button; the sheet opens as a dialog. */
    async openRecord(reference: string): Promise<void> {
        const row = await this.rowByReference(reference);
        await row.getByRole('button', { name: /^Edit Time Card: / }).click({ timeout: 15_000 });
        await this.recordSheet.waitFor({ state: 'visible', timeout: 30_000 });
        this.openedReference = reference;
    }

    private async fieldText(selector: string): Promise<string> {
        return this.recordSheet.locator(selector).evaluate(
            (el) => ('value' in el && el.tagName !== 'BUTTON' ? String((el as HTMLInputElement).value) : (el.textContent ?? '')).trim(),
            undefined,
            { timeout: 10_000 },
        );
    }

    private async readQuestions(): Promise<TimeCardQuestionAnswer[]> {
        const heading = this.recordSheet.getByRole('heading', { name: /^Questions/ });
        await expect(heading, 'the Edit sheet has no "Questions" heading').toBeVisible({ timeout: 15_000 });
        const none = this.recordSheet.getByText('No questions recorded.');
        const rows = this.recordSheet.getByRole('row');
        await expect(none.or(rows.first()), 'the Questions block shows neither "No questions recorded." nor an answer row').toBeVisible({ timeout: 15_000 });
        if (await none.isVisible()) return [];
        const out: TimeCardQuestionAnswer[] = [];
        for (let i = 0; i < (await rows.count()); i += 1) {
            const cells = (await rows.nth(i).getByRole('cell').allInnerTexts()).map((c) => c.trim());
            if (cells.length >= 2) out.push({ question: cells[0], response: cells[1] });
        }
        return out;
    }

    async readRecord(): Promise<TimeCardRecordView> {
        await expect(this.recordSheet).toBeVisible({ timeout: 15_000 });
        const gps = this.recordSheet.locator('#gpsReading');
        const uneditedLabel = this.recordSheet.getByText('Unedited', { exact: true });
        const unedited =
            (await uneditedLabel.count()) === 0
                ? null
                : (((await uneditedLabel.first().locator('xpath=..').textContent()) ?? '').replace('Unedited', '').trim());
        return {
            reference: this.openedReference,
            dateTime: await this.fieldText('#dateTime'),
            employee: await this.fieldText('#employeeCounter'),
            employeeSelection: await this.fieldText('#employeeSelection'),
            workCrew: await this.fieldText('#crewCounter'),
            ranch: await this.fieldText('#ranchCounter'),
            field: await this.fieldText('#fieldCounter'),
            job: await this.fieldText('#jobCounter'),
            traceability: await this.fieldText('#traceabilityCode'),
            pieces: await this.fieldText('#numOfPieces'),
            gps: (await gps.count()) === 0 ? null : await this.fieldText('#gpsReading'),
            transferred: await this.fieldText('#transferred'),
            unedited,
            memo: await this.fieldText('#memo'),
            questions: await this.readQuestions(),
        };
    }

    /** Cancel leaves the sheet without saving. */
    async closeRecord(): Promise<void> {
        await this.recordSheet.getByRole('button', { name: 'Cancel', exact: true }).click();
        await this.recordSheet.waitFor({ state: 'hidden', timeout: 15_000 });
    }
}

export default ViewTimeCardsPage;
