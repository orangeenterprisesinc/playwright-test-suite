import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { DataGridComponent } from '../../components/DataGridComponent';
import { PdfViewerDialog } from './PdfViewerDialog';

export interface ScriptRun {
    reportName?: string;
    /** The criteria the browser sent with POST /reports/run, parsed. */
    criteria: unknown[];
}

const isRunRequest = (method: string, url: string): boolean => method === 'POST' && new URL(url).pathname.endsWith('/reports/run');

/**
 * Reports ▸ Report Scripts, `/reports/scripts`: grid "Report Scripts" (Name / Part Name / Comment / Script Type), a row
 * click selects it, the header Execute runs the selection. Measured 2026-11-02 (su): a Time In script with Execute
 * Report = Yes lands on `/reports/screen/time-in` with its criterion and opens the PDF viewer straight away, with no
 * Report dialog. No delete here; scripts are deleted under File ▸ Administration ▸ Setup ▸ Scripts.
 */
export class ReportScriptsPage extends BasePage {
    static readonly MENU_PATH = ['Reports', 'Report Scripts'];
    readonly pageUrl = '/reports/scripts';
    readonly pageTitle: string | RegExp = /.*/;

    readonly grid: DataGridComponent;
    readonly executeButton: Locator;
    readonly viewer: PdfViewerDialog;
    private readonly bodyRows: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.grid = new DataGridComponent(page, 'Report Scripts', 'Report Script');
        this.executeButton = page.getByTestId('page-header-action-execute');
        this.viewer = new PdfViewerDialog(page);
        // Filtered, the header filter row takes the filter text as its name, so body rows are the ones with cells.
        this.bodyRows = page.getByRole('grid', { name: 'Report Scripts' }).getByRole('row').filter({ has: page.getByRole('cell') });
    }

    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(ReportScriptsPage.MENU_PATH, this.pageUrl);
        await this.grid.nameFilter.waitFor({ state: 'visible', timeout: 30_000 });
    }

    row(name: string): Locator {
        return this.bodyRows.and(this.page.getByRole('row', { name, exact: true }));
    }

    async select(name: string): Promise<void> {
        await this.grid.nameFilter.fill(name);
        await expect
            .poll(() => this.grid.totalRowCount().catch(() => -1), { timeout: 30_000, message: `the Name filter leaves only '${name}'` })
            .toBe(1);
        await this.row(name).click();
        await expect(this.row(name)).toHaveAttribute('aria-selected', 'true');
    }

    /** Executes the selected script; returns what the browser sent (the screen's own request, read, never called). */
    async execute(): Promise<ScriptRun> {
        const sent = this.page.waitForRequest((r) => isRunRequest(r.method(), r.url()), { timeout: 60_000 });
        sent.catch(() => undefined);
        await this.executeButton.click();
        const request = await sent.catch((cause: unknown) => {
            throw new Error('Execute sent no POST /reports/run within 60 s', { cause });
        });
        const body = JSON.parse(request.postData() ?? '{}') as { reportName?: string; criteria?: string };
        return { reportName: body.reportName, criteria: body.criteria ? (JSON.parse(body.criteria) as unknown[]) : [] };
    }
}

export default ReportScriptsPage;
