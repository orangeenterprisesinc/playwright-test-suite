import { promises as fs } from 'node:fs';
import { Locator, Page, expect } from '@playwright/test';

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

    constructor(private readonly page: Page) {
        this.trigger = page.getByTestId('view-job-cards-print-report');
        this.dialog = page.getByRole('alertdialog', { name: /^Report: / });
        this.closeButton = page.getByTestId('report-close');
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

        const viewer = this.page.getByRole('dialog').filter({ has: this.page.locator('iframe[src^="blob:"]') });
        await expect(viewer, 'the PDF viewer must open').toBeVisible({ timeout: 30_000 });
        output.viewerSrc = (await viewer.locator('iframe').getAttribute('src')) ?? '';
        output.viewerTitle = (await viewer.locator('iframe').getAttribute('title')) ?? '';
        const pdfDownload = this.page.waitForEvent('download', { timeout: 30_000 });
        await viewer.getByRole('link', { name: 'Download' }).or(viewer.getByRole('button', { name: 'Download' })).first().click();
        const download = await pdfDownload;
        output.suggestedFilename = download.suggestedFilename();
        await download.saveAs(saveTo);
        output.savedBytes = (await fs.stat(saveTo)).size;
        // The footer Close follows the header's in the DOM.
        await viewer.getByRole('button', { name: 'Close', exact: true }).last().click();
        await expect(viewer).toBeHidden({ timeout: 15_000 });
        await this.closeIfOpen();
        return output;
    }

    private async closeIfOpen(): Promise<void> {
        if (await this.dialog.isVisible().catch(() => false)) {
            await this.closeButton.click();
            await expect(this.dialog).toBeHidden({ timeout: 15_000 });
        }
    }
}
