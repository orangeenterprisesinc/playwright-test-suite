import { Locator, Page, expect } from '@playwright/test';

/**
 * The Save Filter Script dialog of a report dialog (Reports ▸ Input screens). Measured 2026-11-02 (su):
 * Save ▸ Save as New → "Save Filter Script" (Name `report-save-name`, maxlength 100; Active, Execute report and
 * Include for report reviewer on by default; toasts `Filter script "<name>" saved.` + "Filter script created").
 * A soft-deleted name stays reserved: saving it again answers 500, so names are always run-minted.
 */
export class FilterScriptDialogs {
    readonly saveDialog: Locator;
    readonly nameInput: Locator;
    readonly executeReport: Locator;
    private readonly saveAsNewItem: Locator;
    private readonly saveSubmit: Locator;

    constructor(private readonly page: Page) {
        this.saveDialog = page.getByRole('dialog', { name: 'Save Filter Script' });
        this.nameInput = page.getByTestId('report-save-name');
        this.executeReport = this.saveDialog.getByRole('checkbox', { name: 'Execute report' });
        this.saveAsNewItem = page.getByTestId('report-save-item-new');
        this.saveSubmit = page.getByTestId('report-save-submit');
    }

    toast(text: string): Locator {
        return this.page.locator('[data-sonner-toast]').filter({ hasText: text });
    }

    /** A screen's Save opens the Report dialog with this menu already expanded; the trigger is the fallback. */
    async saveAsNew(name: string, savedToast: string): Promise<void> {
        const menuOpen = await this.saveAsNewItem.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
        if (!menuOpen) await this.page.getByTestId('report-save-trigger').click();
        await this.saveAsNewItem.click();
        await expect(this.saveDialog).toBeVisible({ timeout: 15_000 });
        await this.nameInput.fill(name);
        await expect(this.executeReport, 'Execute report is on by default').toBeChecked();
        await this.saveSubmit.click();
        await expect(this.toast(savedToast)).toBeVisible({ timeout: 15_000 });
        await expect(this.saveDialog).toBeHidden({ timeout: 15_000 });
    }
}
