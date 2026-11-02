import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { ListDateRangeComponent } from '../../components/ListDateRangeComponent';
import { ReportDialog } from '../processing/ReportDialog';
import { ReportsInputMenu } from './ReportsInputMenu';
import { browserDay, summaryStamp } from './reportSelectionText';

/**
 * Reports ▸ Input ▸ Job Card, `/reports/input/job-card` ("Job Card Report Selection"). Measured on dev 2026-11-02 (su):
 * opens on the current week (Mon–Sun, 12:00 AM – 11:59 PM) in the shared `selection-date-range` strip; the criteria
 * builder is View ▸ Job Cards' (`view-job-cards-criteria-*`). Execute opens the Report dialog.
 */
export class JobCardReportSelectionPage extends BasePage {
    readonly pageUrl = '/reports/input/job-card';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    readonly dates: ListDateRangeComponent;
    readonly dateRange: Locator;
    readonly startTime: Locator;
    readonly endTime: Locator;
    readonly summaryRegion: Locator;
    readonly executeButton: Locator;
    readonly report: ReportDialog;
    private readonly menu: ReportsInputMenu;
    private readonly searchBy: Locator;
    private readonly match: Locator;
    private readonly crewText: Locator;
    private readonly crewCriterion: Locator;

    constructor(page: Page) {
        super(page);
        this.menu = new ReportsInputMenu(page);
        this.heading = page.getByRole('heading', { level: 1 });
        this.dates = new ListDateRangeComponent(page);
        this.dateRange = page.getByTestId('selection-date-range');
        this.startTime = page.getByTestId('selection-date-range-start-time').locator('[data-slot="time-picker"]');
        this.endTime = page.getByTestId('selection-date-range-end-time').locator('[data-slot="time-picker"]');
        this.summaryRegion = page.getByRole('region', { name: 'Filter description' });
        this.executeButton = page.getByTestId('reports-input-job-card-execute');
        this.searchBy = page.getByTestId('view-job-cards-criteria-search-by');
        this.match = page.getByTestId('view-job-cards-criteria-match');
        this.crewText = page.getByTestId('view-job-cards-criteria-jobCardCrew-text');
        this.crewCriterion = page.getByTestId('view-job-cards-criteria-line-jobCardCrew-edit');
        this.report = new ReportDialog(page, this.executeButton);
    }

    async openFromMenu(): Promise<void> {
        await this.menu.open('Job Card', this.pageUrl);
        await expect(this.executeButton).toBeVisible({ timeout: 30_000 });
    }

    button(label: string): Locator {
        return this.page.getByRole('main').getByRole('button', { name: label, exact: true });
    }

    async day(offset: number): Promise<string> {
        return browserDay(this.page, offset);
    }

    async stamp(day: string, hhmm: string): Promise<string> {
        return summaryStamp(this.page, day, hhmm);
    }

    /** Search by Job Card Crew, Match Contains (Position stays Contains), then the text; waits for the criterion chip. */
    async crewContains(text: string): Promise<void> {
        await this.searchBy.click();
        await this.page.getByTestId('view-job-cards-criteria-search-by-jobCardCrew').click();
        await this.match.click();
        await this.page.getByTestId('view-job-cards-criteria-match-like').click();
        await this.crewText.fill(text);
        await expect(this.crewCriterion).toContainText(text, { timeout: 15_000 });
    }
}

export default JobCardReportSelectionPage;
