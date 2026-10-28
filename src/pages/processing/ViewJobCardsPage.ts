import { Locator, Page, Response, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { ReportDialog, type ReportOutput } from './ReportDialog';
import { TestFileSheet } from './TestFileSheet';
import { pickRangeInPopup, usDate } from './dateRangePopup';

/** The Totals bar, read by label. Numbers are NaN while a value is empty. */
export interface JobCardTotals {
    gross: number;
    net: number;
    meals: number;
    nonLaborUnits: number;
    amount: number;
    regular: number;
    overtime: number;
    double: number;
    /** `MM/DD/YY`. */
    firstDate: string;
}

/** "1 of 10 record" reads shown 1, loaded 10; an unfiltered "1 record" reads 1 of 1. */
export interface DisplayedOfLoaded {
    shown: number;
    loaded: number;
}

export interface JobCardCounts {
    records: DisplayedOfLoaded;
    employees: DisplayedOfLoaded;
    pieces: DisplayedOfLoaded;
}

export const ordinal = (n: number): string => {
    if (n % 10 === 1 && n % 100 !== 11) return 'st';
    if (n % 10 === 2 && n % 100 !== 12) return 'nd';
    if (n % 10 === 3 && n % 100 !== 13) return 'rd';
    return 'th';
};

const REVERSE_REQUEST = /\/transfer-to-job-cards\/runs\/(\d+)\/reverse$/;

/**
 * View ▸ Job Cards (`/view/job-cards`) — where a transfer lands when `viewJobCardsAfterTransfer` is
 * true, with `transferRun=N` in the URL. A different screen from `/input/job-cards` (JobCardsPage):
 * its testids are `view-job-cards-*`. Locators measured live 2026-10-15.
 *
 * Reverse, the filter, the Totals bar, Report and Test File. No delete, Delete ▾ menu, recalculate,
 * multi-edit, Export to Accounting or Clear Export Flag member exists on purpose — Delete ▾ carries
 * `view-job-cards-delete-all`, and a "delete all loaded" once wiped ~9.5k dev job cards.
 */
export class ViewJobCardsPage extends BasePage {
    readonly pageUrl = '/view/job-cards';
    readonly pageTitle: string | RegExp = /Job Cards/i;

    readonly heading: Locator;
    readonly grid: Locator;
    readonly reverseButton: Locator;
    readonly reverseDialog: Locator;
    readonly confirmReverseButton: Locator;
    readonly cancelReverseButton: Locator;
    /** The second "Confirm Reverse" dialog of the edited-cards path. Only ever waited for, never clicked. */
    readonly editedConfirmDialog: Locator;
    readonly dateRange: Locator;
    readonly includeExportedSwitch: Locator;
    readonly crewChips: Locator;
    readonly employeeChips: Locator;
    readonly totalsBar: Locator;
    readonly report: ReportDialog;
    readonly testFile: TestFileSheet;

    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.heading = page.getByRole('heading', { name: 'Job Cards', level: 1 });
        this.grid = page.getByRole('grid', { name: 'Job Cards' });
        this.reverseButton = page.getByTestId('view-job-cards-reverse-transfer');
        this.reverseDialog = page.getByTestId('view-job-cards-reverse-transfer-confirm');
        this.confirmReverseButton = page.getByTestId('view-job-cards-reverse-transfer-confirm-action');
        this.cancelReverseButton = this.reverseDialog.getByRole('button', { name: 'Cancel' });
        this.editedConfirmDialog = page.getByTestId('reverse-transfer-edited-confirm');
        this.dateRange = page.getByTestId('selection-date-range');
        this.includeExportedSwitch = page.getByRole('switch', { name: 'Include Exported' });
        this.crewChips = page.getByTestId('view-job-cards-filter-crews-chips');
        this.employeeChips = page.getByTestId('view-job-cards-filter-employees-chips');
        this.totalsBar = page.getByTestId('view-job-cards-shift-totals');
        this.report = new ReportDialog(page);
        this.testFile = new TestFileSheet(page);
    }

    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(['View', 'Job Cards'], this.pageUrl);
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /**
     * Scope the filter to one day through the calendar's day cell (the segment inputs commit nothing for a
     * past date). One click moves one end of the range, so the collapse is read back before Apply. Mirrors
     * the Transfer screen's day-cell branch. Nothing loads until {@link applyFilter}.
     */
    async scopeToDay(day: string): Promise<void> {
        const [year, month, date] = day.split('-');
        const target = new Date(Number(year), Number(month) - 1, Number(date));
        await this.expandFilter();
        await this.dateRange.getByRole('button', { name: 'First Day Start – Last Day Start' }).click({ timeout: 15_000 });
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

        const end = `${month}/${date}/${year}`;
        await expect(this.dateRange, `the date scope must read ${end} – ${end}`).toContainText(new RegExp(`${end}\\s*[–-]\\s*${end}`), { timeout: 20_000 });
    }

    /** A multi-day scope: two day-cell clicks, read back before Apply, the chip asserted at both ends. Nothing loads until {@link applyFilter}. */
    async scopeToRange(from: string, to: string): Promise<void> {
        await this.expandFilter();
        await this.dateRange.getByRole('button', { name: 'First Day Start – Last Day Start' }).click({ timeout: 15_000 });
        const popup = this.page.getByRole('dialog');
        await popup.waitFor({ state: 'visible', timeout: 10_000 });
        await pickRangeInPopup(popup, from, to);
        await popup.getByRole('button', { name: /^apply$/i }).click();
        await expect(this.dateRange, `the date scope must read ${usDate(from)} – ${usDate(to)}`).toContainText(
            new RegExp(`${usDate(from)}\\s*[–-]\\s*${usDate(to)}`),
            { timeout: 20_000 },
        );
    }

    /**
     * Once loaded (a transfer landing, Apply or Refresh) the filter collapses to "<from> – <to> · Edit filter",
     * hiding the date button and the Include Exported switch.
     */
    async expandFilter(): Promise<void> {
        const editFilter = this.page.getByRole('main').getByRole('button', { name: 'Edit filter' });
        if (await editFilter.isVisible()) await editFilter.click();
        await this.includeExportedSwitch.waitFor({ state: 'visible', timeout: 10_000 });
    }

    async applyFilter(): Promise<void> {
        await this.load(this.page.getByTestId('view-job-cards-apply'));
    }

    /** Expands the filter, flips the Include Exported switch only if its state differs, and asserts it. Apply after. */
    async setIncludeExported(on: boolean): Promise<void> {
        await this.expandFilter();
        if ((await this.includeExportedSwitch.isChecked()) !== on) await this.includeExportedSwitch.click();
        if (on) await expect(this.includeExportedSwitch, 'Include Exported must be on').toBeChecked({ timeout: 10_000 });
        else await expect(this.includeExportedSwitch, 'Include Exported must be off').not.toBeChecked({ timeout: 10_000 });
    }

    async refresh(): Promise<void> {
        await this.load(this.page.getByTestId('view-job-cards-filter-refresh'));
    }

    private async load(button: Locator): Promise<void> {
        const isFilterGet = (r: Response) => {
            const url = new URL(r.url());
            return r.request().method() === 'GET' && /\/job-cards$/.test(url.pathname) && url.searchParams.has('from');
        };
        const loaded = this.page.waitForResponse(isFilterGet, { timeout: 15_000 });
        loaded.catch(() => undefined);
        await button.click();
        let response = await loaded.catch(() => null);
        if (!response) {
            // Apply Filter with unchanged criteria serves the cached query and sends nothing (2026-10-22); Refresh refetches.
            const refetched = this.page.waitForResponse(isFilterGet, { timeout: 60_000 });
            await this.page.getByTestId('view-job-cards-filter-refresh').click({ timeout: 15_000 });
            response = await refetched;
        }
        expect(response.status(), 'GET job-cards for the filter').toBe(200);
        // Mirrors Time Cards: an empty filter renders a "No ... match the current filter." line instead of the count (empty text not measured here).
        const count = this.page.getByTestId('data-grid-count').first();
        const empty = this.page.getByText(/^No job cards .*match/i);
        await expect(count.or(empty), 'the Job Cards grid shows neither a row count nor a "No job cards ... match" message').toBeVisible({ timeout: 30_000 });
    }

    /** Options come from the loaded rows, so this only works after {@link applyFilter}. Client-side: the totals re-compute at once. */
    async filterByCrew(name: string): Promise<void> {
        await this.page.getByTestId('view-job-cards-filter-crews').click();
        const search = this.page.getByRole('searchbox', { name: /Search crews/i });
        await search.fill(name);
        // The options come from the loaded rows: an absent crew shows "No results." and a bare click would wait for the test cap.
        const option = this.page.getByRole('button', { name, exact: true });
        await expect(option, `the Crews chip offers no "${name}" option (no loaded row belongs to it)`).toBeVisible({ timeout: 15_000 });
        await option.click();
        // The list re-renders after the search debounce and drops a toggle made in between (E1/E3/E13, 2026-10-27), so the
        // pressed state is read back and the click repeated once; Clear (N) below is the proof either way.
        const pressed = await expect(option).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 }).then(() => true, () => false);
        if (!pressed) await option.click();
        await expect(this.page.getByRole('button', { name: /^Clear \(\d+\)$/ })).toBeVisible({ timeout: 10_000 });
        await this.page.keyboard.press('Escape');
        await expect(search).toBeHidden({ timeout: 10_000 });
    }

    /** By label, never by index. Throws by name on a missing label and on an `HH:MM` value. */
    async readTotals(): Promise<JobCardTotals> {
        const pairs = await this.totalsBar.evaluate(
            (bar) =>
                Array.from(bar.children)
                    .map((metric) => Array.from(metric.children).map((part) => (part.textContent ?? '').trim()))
                    .filter((parts) => parts.length >= 2),
            undefined,
            { timeout: 10_000 },
        );
        const byLabel = new Map(pairs.map(([label, value]) => [label, value] as const));
        const raw = (label: string): string => {
            const value = byLabel.get(label);
            if (value === undefined) throw new Error(`The Totals bar has no '${label}'; labels seen: ${JSON.stringify([...byLabel.keys()])}`);
            return value;
        };
        const num = (label: string): number => {
            const text = raw(label);
            if (/^\d+:\d{2}$/.test(text)) throw new Error(`The Totals bar renders '${label}' as HH:MM ("${text}"), not a decimal.`);
            const digits = text.replace(/[^0-9.-]/g, '');
            return digits === '' ? NaN : Number(digits);
        };
        return {
            gross: num('Gross'),
            net: num('Net'),
            meals: num('Meals'),
            nonLaborUnits: num('Non-Labor Units'),
            amount: num('Amount'),
            regular: num('Regular'),
            overtime: num('Overtime'),
            double: num('Double'),
            firstDate: raw('First Date'),
        };
    }

    async readCounts(): Promise<JobCardCounts> {
        const read = async (testId: string): Promise<DisplayedOfLoaded> => {
            const text = (await this.page.getByTestId(testId).innerText()).trim();
            const match = /([\d.,]+)(?:\s+of\s+([\d.,]+))?/.exec(text);
            if (!match) throw new Error(`${testId} reads "${text}", which carries no number`);
            const num = (value: string) => Number(value.replace(/,/g, ''));
            return { shown: num(match[1]), loaded: match[2] ? num(match[2]) : num(match[1]) };
        };
        return {
            records: await read('view-job-cards-record-count'),
            employees: await read('view-job-cards-employee-count'),
            pieces: await read('view-job-cards-piece-count'),
        };
    }

    async runReport(name: string, format: 'excel' | 'pdf', saveTo: string): Promise<ReportOutput> {
        await this.report.open();
        await this.report.selectReport(name);
        return this.report.run(format, saveTo);
    }

    /** The `transferRun` the app navigated with; NaN when the URL carries none. */
    transferRunParam(): number {
        return Number(new URL(this.page.url()).searchParams.get('transferRun'));
    }

    async waitForTransferLanding(): Promise<void> {
        await this.page.waitForURL(/\/view\/job-cards\?.*transferRun=\d+/, { timeout: 60_000 });
        await this.heading.waitFor({ state: 'visible', timeout: 30_000 });
    }

    async openReverse(): Promise<void> {
        await this.reverseButton.click({ timeout: 15_000 });
        await this.reverseDialog.waitFor({ state: 'visible', timeout: 15_000 });
    }

    /**
     * Confirm the reverse and return the run id the browser's own POST carried. Throws, without
     * clicking anything, if the edited-cards dialog appears instead of the app returning to Transfer.
     */
    async confirmReverse(): Promise<number> {
        const posted = this.page.waitForRequest(
            (r) => r.method() === 'POST' && REVERSE_REQUEST.test(new URL(r.url()).pathname),
            { timeout: 30_000 },
        );
        await this.confirmReverseButton.click();
        const request = await posted;
        const runId = Number(REVERSE_REQUEST.exec(new URL(request.url()).pathname)?.[1]);

        const outcome = await Promise.race([
            this.page.waitForURL(/\/transfer-to-job-cards/, { timeout: 60_000 }).then(() => 'landed' as const, () => 'timeout' as const),
            this.editedConfirmDialog.waitFor({ state: 'visible', timeout: 60_000 }).then(() => 'edited' as const, () => 'timeout' as const),
        ]);
        if (outcome === 'edited') {
            throw new Error('The reverse asked for a second "Confirm Reverse": a job card of this run was edited. Refusing to confirm it.');
        }
        if (outcome === 'timeout') throw new Error(`POST …/runs/${runId}/reverse was sent but the app never returned to Transfer to Job Cards.`);
        return runId;
    }

    /** Data rows for one crew and one job; both cells matched exactly. */
    rowsForCrewAndJob(crew: string, job: string): Locator {
        return this.rowsForCrew(crew).filter({ has: this.page.getByRole('cell', { name: job, exact: true }) });
    }

    async readCell(row: Locator, header: string): Promise<string> {
        return ((await (await this.cellByHeader(row, header)).innerText()) ?? '').trim();
    }

    /** Commas and currency stripped, '' reads 0. An `HH:MM` cell throws rather than parse as 730. */
    async readNumber(row: Locator, header: string): Promise<number> {
        const text = await this.readCell(row, header);
        if (/^\d+:\d{2}$/.test(text)) throw new Error(`Job Cards '${header}' renders as HH:MM ("${text}"), not a decimal`);
        const digits = text.replace(/[^0-9.-]/g, '');
        return digits === '' ? 0 : Number(digits);
    }

    /** "9/23/26 7:00 AM" → "07:00". */
    async readClock(row: Locator, header: string): Promise<string> {
        const text = await this.readCell(row, header);
        const match = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(text);
        if (!match) throw new Error(`Job Cards '${header}' reads "${text}", which carries no clock time`);
        const hour = (Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0);
        return `${String(hour).padStart(2, '0')}:${match[2]}`;
    }

    /** "9/23/26 7:00 AM" → "2026-09-23". */
    async readDay(row: Locator, header: string): Promise<string> {
        const text = await this.readCell(row, header);
        const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text);
        if (!match) throw new Error(`Job Cards '${header}' reads "${text}", which carries no date`);
        const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
        return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    }

    /** The row's Reference is its aria-label. */
    async referenceOf(row: Locator): Promise<string> {
        const label = await row.getAttribute('aria-label', { timeout: 10_000 });
        if (!label) throw new Error('The Job Cards row carries no aria-label Reference');
        return label.trim();
    }

    /** Data rows whose Work Crew cell is exactly `name`. */
    rowsForCrew(name: string): Locator {
        return this.grid.getByRole('row').filter({ has: this.page.getByRole('cell', { name, exact: true }) });
    }

    /** The grid's column headers in their current order, "Reorder column " prefix dropped. */
    async columnHeaders(): Promise<string[]> {
        await expect(this.grid.getByRole('columnheader').first()).toBeVisible({ timeout: 15_000 });
        return (await this.grid.getByRole('columnheader').allInnerTexts()).map((h) => h.replace(/^Reorder column /, '').trim());
    }

    /** One row's cell by column header. The layout is user-reorderable, so the index is read, never hard-coded. */
    async cellByHeader(row: Locator, header: string): Promise<Locator> {
        const headers = await this.columnHeaders();
        const index = headers.findIndex((h) => h === header || h.startsWith(`${header}\n`));
        if (index < 0) throw new Error(`Job Cards grid has no '${header}' column; headers are ${JSON.stringify(headers)}`);
        return row.getByRole('cell').nth(index);
    }
}
