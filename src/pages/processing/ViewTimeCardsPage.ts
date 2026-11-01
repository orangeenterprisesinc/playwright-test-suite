import { Locator, Page, Request, Response, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { DataGridComponent } from '../../components/DataGridComponent';
import { ReportDialog } from './ReportDialog';

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
    readonly cardGrid: DataGridComponent;
    readonly report: ReportDialog;

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
        this.cardGrid = new DataGridComponent(page, 'Time Cards', 'Time Card');
        this.report = new ReportDialog(page, page.getByTestId('view-time-cards-report'));
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
        // Apply can serve the cache; Refresh's GET proves the grid holds the server's rows.
        await this.page.getByTestId('view-time-cards-apply').click();
        await this.refresh();
    }

    async refresh(): Promise<void> {
        await this.load(this.page.getByTestId('view-time-cards-filter-refresh'));
    }

    private async load(button: Locator): Promise<void> {
        const isFilterGet = (r: Response) => {
            const url = new URL(r.url());
            return r.request().method() === 'GET' && /\/time-cards\/?$/.test(url.pathname);
        };
        await expect(button).toBeEnabled({ timeout: 60_000 });
        const loaded = this.page.waitForResponse(isFilterGet, { timeout: 60_000 });
        await button.click();
        const response = await loaded;
        expect(response.status(), 'GET time-cards for the filter').toBe(200);
        // A filter with no visible rows renders "No time cards match the current filter." instead of the count.
        const count = this.page.getByTestId('data-grid-count').first();
        const empty = this.grid.getByText(/^No time cards match the current filter/i);
        await expect(count.or(empty), 'the Time Cards grid shows neither a row count nor the "No time cards match" message').toBeVisible({ timeout: 30_000 });
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
        // The options come from the loaded rows: an absent name shows "No results." and a bare click would wait for the test cap.
        const option = this.page.getByRole('button', { name, exact: true });
        await expect(option, `the chip offers no "${name}" option (no loaded row carries it)`).toBeVisible({ timeout: 15_000 });
        await option.click();
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

    /** The Reference filter survives a menu re-entry of the screen, so a count after {@link rowByReference} must clear it. */
    async clearReferenceFilter(): Promise<void> {
        await this.filterByReference('');
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
        const edit = row.getByRole('button', { name: /^Edit Time Card: / });
        const sheet = this.recordSheet.or(this.page.getByRole('dialog', { name: /^Edit Time (In|Out)/ }));
        // A click that lands while the Reference filter is still re-rendering the grid is swallowed
        // (the button ends up focused, no sheet), so re-click until the sheet shows.
        await expect(async () => {
            await edit.scrollIntoViewIfNeeded({ timeout: 5_000 });
            await edit.click({ timeout: 5_000 });
            await expect(sheet.first()).toBeVisible({ timeout: 5_000 });
        }, 'the Edit Time Card button never opened the record sheet').toPass({ timeout: 45_000, intervals: [500, 1_000, 2_000] });
        await this.recordSheet.waitFor({ state: 'visible', timeout: 10_000 });
        this.openedReference = reference;
    }

    /** '' when the sheet has no such field: a Time In carries no Pieces, a tenant without GPS no reading. */
    private async fieldText(selector: string): Promise<string> {
        const control = this.recordSheet.locator(selector);
        if ((await control.count()) === 0) return '';
        return control.evaluate(
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
        // The sheet opens before its fields are filled; Date / Time is always set, so it is the hydration mark.
        await expect.poll(() => this.fieldText('#dateTime'), { timeout: 15_000, message: 'the Edit sheet never filled its Date / Time' }).not.toBe('');
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

    // ── Cluster 3, part A: toolbar, row actions, selection carry-over (WEBPET-3138/3133/3573/3819/3889/3890), measured 2026-10-31 ──
    get reportButton(): Locator { return this.page.getByTestId('view-time-cards-report'); }
    get displayReportButton(): Locator { return this.page.getByTestId('view-time-cards-display-report'); }
    get deleteButton(): Locator { return this.page.getByTestId('view-time-cards-delete'); }
    get topStripToggle(): Locator { return this.page.getByTestId('view-time-cards-top-strip-toggle'); }
    /** Legend + "Filter displayed rows" (Work Crew / Employee pickers); unmounted while hidden. */
    get topStrip(): Locator { return this.page.getByTestId('view-time-cards-top-strip'); }
    get crewPicker(): Locator { return this.page.getByTestId('view-time-cards-grid-filter-crews'); }
    get emptyState(): Locator { return this.grid.getByText(/^No time cards match the current filter/i); }
    criterionLine(field: string): Locator { return this.page.getByTestId(`view-time-cards-criteria-line-${field}`); }
    row(reference: string): Locator { return this.grid.getByRole('row', { name: reference, exact: true }); }
    rowAddButton(reference: string): Locator { return this.grid.getByRole('button', { name: `Add a record for ${reference}`, exact: true }); }
    rowTrashButton(reference: string): Locator { return this.grid.getByRole('button', { name: `Delete Time Card ${reference}`, exact: true }); }
    recordDialog(title: string): Locator { return this.page.getByRole('dialog', { name: title }); }
    toast(text: string): Locator { return this.page.locator('[data-sonner-toast]').filter({ hasText: text }); }
    textOnScreen(text: string): Locator { return this.page.getByText(text); }

    /** Search by ▸ Time Card Crew ▸ Match Contains: the selection that survives leaving the screen (the grid Work Crew chip does not). */
    async scopeToTimeCardCrew(name: string): Promise<void> {
        await this.expandFilter();
        const want = `Time Card Crew contains "${name}"`;
        const line = this.criterionLine('workCrew');
        if ((await line.count()) > 0 && (await line.innerText()).trim() === want) return;
        await this.page.getByTestId('view-time-cards-criteria-search-by').click();
        await this.page.getByTestId('view-time-cards-criteria-search-by-workCrew').click();
        await this.page.getByTestId('view-time-cards-criteria-match').click();
        await this.page.getByTestId('view-time-cards-criteria-match-like').click();
        await this.page.getByTestId('view-time-cards-criteria-workCrew-text').fill(name);
        await expect(line, `the selection must read ${want}`).toHaveText(want, { timeout: 10_000 });
    }

    /** Sticky per browser; aria-expanded is the state. */
    async setTopSection(visible: boolean): Promise<void> {
        const want = visible ? 'true' : 'false';
        if ((await this.topStripToggle.getAttribute('aria-expanded')) !== want) await this.topStripToggle.click();
        await expect(this.topStripToggle).toHaveAttribute('aria-expanded', want);
    }

    async expectScopedTo(day: string): Promise<void> {
        const [year, month, date] = day.split('-');
        const part = `0?${Number(month)}/0?${Number(date)}/(?:${year}|${year.slice(-2)})`;
        await expect(this.dateRange).toContainText(new RegExp(`${part}.*[–-].*${part}`, 's'), { timeout: 20_000 });
    }

    /** Counts the browser's own GET /time-cards (the filter query); nothing is sent by the test. */
    trackFilterRequests(): { count(): number; stop(): void } {
        let n = 0;
        const onRequest = (r: Request) => { if (r.method() === 'GET' && /\/time-cards\/?$/.test(new URL(r.url()).pathname)) n += 1; };
        this.page.on('request', onRequest);
        return { count: () => n, stop: () => this.page.off('request', onRequest) };
    }

    async settle(): Promise<void> { await this.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined); }

    /** Left edge in px; throws by name when the element has no box. */
    async leftEdge(target: Locator): Promise<number> {
        const box = await target.boundingBox();
        if (!box) throw new Error('the element has no bounding box (not rendered)');
        return box.x;
    }

    async dismissPopup(): Promise<void> { await this.page.keyboard.press('Escape'); }

    /** WEBPET-3573/3378: a single click only selects the row; a double-click opens the record, as in legacy. */
    async openRecordByDoubleClick(reference: string): Promise<void> {
        await (await this.cellByHeader(this.row(reference), 'Time')).dblclick();
        await expect(this.recordSheet).toBeVisible({ timeout: 15_000 });
        this.openedReference = reference;
    }

    async confirmDelete(heading: string, body: string): Promise<void> {
        const dialog = this.page.getByRole('alertdialog', { name: heading });
        await expect(dialog, `no "${heading}" confirmation`).toBeVisible({ timeout: 10_000 });
        await expect(dialog).toContainText(body);
        await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(dialog).toBeHidden({ timeout: 30_000 });
    }

    // ── Cluster 3, part B: Multi Update bar (WEBPET-3895/3181/3180/3574), measured 2026-10-31. No testids except the employee combobox. ──
    get multiUpdateToggle(): Locator { return this.page.getByRole('button', { name: 'Multi Update', exact: true }); }
    get muField(): Locator { return this.page.getByRole('main').getByRole('combobox', { name: 'Field', exact: true }); }
    muTextValue(label: string): Locator { return this.page.getByRole('main').getByRole('textbox', { name: label, exact: true }); }
    /** WEBPET-3181: a typeable combobox (placeholder "Select an employee…"), not a Select. */
    get muEmployeeValue(): Locator { return this.page.getByTestId('mu-employee-combobox'); }
    get muComboItems(): Locator { return this.page.locator('[data-slot="combobox-popup"][data-open] [data-slot="combobox-item"]'); }
    updateRecordsButton(n: number): Locator { return this.page.getByRole('button', { name: `Update Records (${n})`, exact: true }); }

    async openMultiUpdate(): Promise<void> {
        if ((await this.multiUpdateToggle.getAttribute('aria-pressed')) !== 'true') await this.multiUpdateToggle.click();
        await expect(this.multiUpdateToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(this.muField).toBeVisible({ timeout: 10_000 });
    }
    async muFieldLabels(): Promise<string[]> {
        await this.muField.click();
        const opts = this.page.getByRole('listbox').getByRole('option');
        await expect(opts.first()).toBeVisible();
        const labels = (await opts.allInnerTexts()).map((t) => t.trim());
        await this.page.keyboard.press('Escape');
        return labels;
    }
    async chooseMuField(label: string): Promise<void> {
        await this.muField.click();
        await this.page.getByRole('option', { name: label, exact: true }).click();
        await expect(this.muField).toHaveText(label);
    }
    async muComboLabels(): Promise<string[]> {
        await expect(this.muComboItems.first()).toBeVisible({ timeout: 10_000 });
        return (await this.muComboItems.allInnerTexts()).map((t) => t.trim());
    }

    /** Cancel leaves the sheet without saving. */
    async closeRecord(): Promise<void> {
        await this.recordSheet.getByRole('button', { name: 'Cancel', exact: true }).click();
        await this.recordSheet.waitFor({ state: 'hidden', timeout: 15_000 });
    }
}

export default ViewTimeCardsPage;
