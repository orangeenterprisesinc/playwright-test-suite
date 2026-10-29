import { promises as fs } from 'node:fs';
import { Locator, Page, expect } from '@playwright/test';

/**
 * The PDF viewer dialog a report run opens (an iframe on a blob: URL). Extracted from ReportDialog so the
 * Reports hub's Run dialog (R2) and View ▸ Job Cards' Report dialog (E8) drive the same viewer.
 */
export class PdfViewerDialog {
    readonly root: Locator;

    constructor(private readonly page: Page) {
        this.root = page.getByRole('dialog').filter({ has: page.locator('iframe[src^="blob:"]') });
    }

    async waitOpen(timeout = 30_000): Promise<{ heading: string; src: string; title: string }> {
        await expect(this.root, 'the PDF viewer must open').toBeVisible({ timeout });
        const frame = this.root.locator('iframe');
        const heading = await this.root.getByRole('heading').first().textContent({ timeout: 5_000 }).catch(() => '');
        return {
            heading: (heading ?? '').trim(),
            src: (await frame.getAttribute('src')) ?? '',
            title: (await frame.getAttribute('title')) ?? '',
        };
    }

    async download(saveTo: string): Promise<{ suggestedFilename: string; savedBytes: number }> {
        const pdfDownload = this.page.waitForEvent('download', { timeout: 30_000 });
        await this.root.getByRole('link', { name: 'Download' }).or(this.root.getByRole('button', { name: 'Download' })).first().click();
        const download = await pdfDownload;
        await download.saveAs(saveTo);
        return { suggestedFilename: download.suggestedFilename(), savedBytes: (await fs.stat(saveTo)).size };
    }

    async close(): Promise<void> {
        // The footer Close follows the header's in the DOM.
        await this.root.getByRole('button', { name: 'Close', exact: true }).last().click();
        await expect(this.root).toBeHidden({ timeout: 15_000 });
    }
}
