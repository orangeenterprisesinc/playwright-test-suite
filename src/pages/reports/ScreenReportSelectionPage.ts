import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ReportDialog } from '../processing/ReportDialog';
import { FilterScriptDialogs } from './FilterScriptDialogs';
import { ReportsInputMenu } from './ReportsInputMenu';
import { browserDay, summaryStamp } from './reportSelectionText';

/**
 * Reports ▸ Input ▸ <screen> (`/reports/screen/<slug>`, "<Screen> Report Selection"); registered for Time In.
 * Measured on dev 2026-11-02 (su): Search by, Filter description, Execute (`screen-report-open`) / Load / Save.
 * Date In ▸ In range fills From/To (`datetime-local`, `YYYY-MM-DDTHH:mm`) with today 00:00 / 23:59; Date In ▸ Current ▸
 * This week reads "Date In is This week". Execute and Save open the Report dialog.
 */
export class ScreenReportSelectionPage extends BasePage {
    readonly pageUrl: string;
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    readonly searchBy: Locator;
    readonly match: Locator;
    readonly summaryRegion: Locator;
    readonly breadcrumb: Locator;
    readonly executeButton: Locator;
    readonly saveButton: Locator;
    readonly report: ReportDialog;
    readonly scripts: FilterScriptDialogs;
    private readonly menu: ReportsInputMenu;

    constructor(page: Page, private readonly leaf: string, pageUrl: string) {
        super(page);
        this.pageUrl = pageUrl;
        this.menu = new ReportsInputMenu(page);
        this.heading = page.getByRole('heading', { level: 1 });
        this.searchBy = page.getByTestId('screen-report-selection-search-by');
        this.match = page.getByTestId('screen-report-selection-match');
        this.summaryRegion = page.getByRole('region', { name: 'Filter description' });
        this.breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
        this.executeButton = page.getByTestId('screen-report-open');
        this.saveButton = page.getByTestId('screen-report-save');
        this.report = new ReportDialog(page, this.executeButton);
        this.scripts = new FilterScriptDialogs(page);
    }

    async openFromMenu(): Promise<void> {
        await this.menu.open(this.leaf, this.pageUrl);
        await expect(this.executeButton).toBeVisible({ timeout: 30_000 });
    }

    /** The trail's labels, split on lines and chevrons so it reads the same whether items are list entries or one text run. */
    async breadcrumbTrail(): Promise<string[]> {
        return (await this.breadcrumb.innerText()).split(/[\n›>/]+/).map((t) => t.trim()).filter(Boolean);
    }

    button(label: string): Locator {
        return this.page.getByRole('main').getByRole('button', { name: label, exact: true });
    }

    from(key: string): Locator {
        return this.page.getByTestId(`screen-report-selection-${key}-from`);
    }

    to(key: string): Locator {
        return this.page.getByTestId(`screen-report-selection-${key}-to`);
    }

    async chooseField(label: string): Promise<void> {
        await this.searchBy.click();
        await this.page.getByRole('option', { name: label, exact: true }).click();
        await expect(this.searchBy).toHaveText(label);
    }

    async chooseMatch(label: string): Promise<void> {
        await this.match.click();
        await this.page.getByRole('option', { name: label, exact: true }).click();
        await expect(this.match).toHaveText(label);
    }

    /** The Range select a Current/Last/Next match adds (`screen-report-selection-<key>-sub`). */
    async chooseRange(key: string, label: string): Promise<void> {
        const sub = this.page.getByTestId(`screen-report-selection-${key}-sub`);
        await sub.click();
        await this.page.getByRole('option', { name: label, exact: true }).click();
        await expect(sub).toHaveText(label);
    }

    async day(offset: number): Promise<string> {
        return browserDay(this.page, offset);
    }

    async stamp(day: string, hhmm: string): Promise<string> {
        return summaryStamp(this.page, day, hhmm);
    }
}

export default ScreenReportSelectionPage;
