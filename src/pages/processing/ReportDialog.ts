import { promises as fs } from 'node:fs';
import { Locator, Page, expect } from '@playwright/test';
import { PdfViewerDialog } from '../reports/PdfViewerDialog';

export interface ReportOutput {
    format: 'excel' | 'pdf';
    status: number;
    contentType: string;
    contentDisposition: string;
    reportName: string | undefined;
    /** The screen's filter as the request carried it. */
    filters: Array<Record<string, unknown>>;
    suggestedFilename: string;
    savedPath: string;
    savedBytes: number;
    /** PDF only: the viewer's iframe. */
    viewerSrc?: string;
    viewerTitle?: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The Report dialog opened from a View screen's toolbar. Never touches Save, Load, Edit in Report Editor or
 * Export (CSV/Text/XML): Save writes a shared report layout. Locators measured live 2026-10-22.
 */
export class ReportDialog {
    readonly trigger: Locator;
    readonly dialog: Locator;
    readonly closeButton: Locator;
    private readonly viewer: PdfViewerDialog;

    constructor(private readonly page: Page) {
        this.trigger = page.getByTestId('view-job-cards-print-report');
        this.dialog = page.getByRole('alertdialog', { name: /^Report: / });
        this.closeButton = page.getByTestId('report-close');
        this.viewer = new PdfViewerDialog(page);
    }

    async open(): Promise<void> {
        await expect(this.trigger, 'Report stays disabled until the filter has loaded').toBeEnabled({ timeout: 30_000 });
        await this.trigger.click();
        await this.dialog.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** The dialog always reopens on "All Data", so the report is picked on every open. */
    async selectReport(name: string): Promise<void> {
        await this.dialog.getByRole('combobox').first().click();
        await this.page.getByRole('option', { name, exact: true }).click();
        await expect(
            this.dialog.getByRole('heading', { name: new RegExp(`^Report: ${escapeRegExp(name)} — `) }),
            `the dialog heading must name ${name}`,
        ).toBeVisible({ timeout: 15_000 });
    }

    async run(format: 'excel' | 'pdf', saveTo: string): Promise<ReportOutput> {
        const path = format === 'excel' ? '/reports/run-excel' : '/reports/run';
        const button = this.dialog.getByRole('button', { name: format === 'excel' ? 'Excel' : 'PDF', exact: true });

        const responded = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(path),
            { timeout: 120_000 },
        );
        responded.catch(() => undefined);
        const downloaded = format === 'excel' ? this.page.waitForEvent('download', { timeout: 120_000 }) : undefined;
        downloaded?.catch(() => undefined);

        await button.click();
        const response = await responded.catch((cause: unknown) => {
            throw new Error(`POST ${path} sent no response within 120 s. A whole-day report can exceed the server's 2-minute limit (WEBPET-2658).`, { cause });
        });
        if (response.status() === 504) {
            throw new Error(`POST ${path} answered 504 "The report took too long to produce…" (WEBPET-2658): the report ran wider than one crew and one day.`);
        }

        const posted = JSON.parse(response.request().postData() ?? '{}') as { reportName?: string; filters?: Array<Record<string, unknown>> };
        const headers = response.headers();
        const output: ReportOutput = {
            format,
            status: response.status(),
            contentType: headers['content-type'] ?? '',
            contentDisposition: headers['content-disposition'] ?? '',
            reportName: posted.reportName,
            filters: posted.filters ?? [],
            suggestedFilename: '',
            savedPath: saveTo,
            savedBytes: 0,
        };
        if (output.status !== 200) return output;

        if (downloaded) {
            const download = await downloaded;
            output.suggestedFilename = download.suggestedFilename();
            await download.saveAs(saveTo);
            output.savedBytes = (await fs.stat(saveTo)).size;
            await this.closeIfOpen();
            return output;
        }

        const opened = await this.viewer.waitOpen();
        output.viewerSrc = opened.src;
        output.viewerTitle = opened.title;
        const saved = await this.viewer.download(saveTo);
        output.suggestedFilename = saved.suggestedFilename;
        output.savedBytes = saved.savedBytes;
        await this.viewer.close();
        await this.closeIfOpen();
        return output;
    }

    // The dialog can re-render or close itself after a download, detaching the Close button mid-click;
    // an unbounded click then waited out the whole test (E8, run 40188410670).
    private async closeIfOpen(): Promise<void> {
        await expect(async () => {
            if (await this.dialog.isVisible()) await this.closeButton.click({ timeout: 5_000 });
            await expect(this.dialog).toBeHidden({ timeout: 2_000 });
        }, 'the Report dialog must close').toPass({ timeout: 30_000 });
    }
}
