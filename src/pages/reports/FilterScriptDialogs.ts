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
    /** Report ▸ Load: the "Load Filter Script" picker (probed on dev 2026-11-20). */
    readonly loadDialog: Locator;
    readonly loadScript: Locator;
    readonly loadSubmit: Locator;
    readonly loadEmpty: Locator;
    readonly loadCancel: Locator;

    constructor(private readonly page: Page) {
        this.saveDialog = page.getByRole('dialog', { name: 'Save Filter Script' });
        this.nameInput = page.getByTestId('report-save-name');
        this.executeReport = this.saveDialog.getByRole('checkbox', { name: 'Execute report' });
        this.saveAsNewItem = page.getByTestId('report-save-item-new');
        this.saveSubmit = page.getByTestId('report-save-submit');
        this.loadDialog = page.getByRole('dialog', { name: 'Load Filter Script' });
        this.loadScript = page.getByTestId('report-load-script');
        this.loadSubmit = page.getByTestId('report-load-submit');
        this.loadEmpty = page.getByTestId('report-load-picker-empty');
        this.loadCancel = this.loadDialog.getByRole('button', { name: 'Cancel', exact: true });
    }

    /** Opens the script select and returns every option; picks `name` only when it is listed ([] when the picker shows the empty state). */
    async pickScript(name: string): Promise<string[]> {
        await this.loadScript.or(this.loadEmpty).first().waitFor({ state: 'visible', timeout: 15_000 });
        if (await this.loadEmpty.isVisible()) return [];
        await this.loadScript.click();
        const listbox = this.page.getByRole('listbox');
        await listbox.waitFor({ state: 'visible', timeout: 15_000 });
        const options = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim());
        if (options.includes(name)) await this.page.getByRole('option', { name, exact: true }).click();
        else await this.page.keyboard.press('Escape');
        return options;
    }

    async confirmLoad(): Promise<void> {
        await this.loadSubmit.click();
        await expect(this.loadDialog).toBeHidden({ timeout: 15_000 });
    }

    toast(text: string): Locator {
        return this.page.locator('[data-sonner-toast]').filter({ hasText: text });
    }

    /** A screen's Save opens the Report dialog with this menu already expanded; the trigger is the fallback. */
    async saveAsNew(name: string, savedToast: string, opts: { executeReport?: boolean } = {}): Promise<void> {
        const menuOpen = await this.saveAsNewItem.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false);
        if (!menuOpen) await this.page.getByTestId('report-save-trigger').click();
        await this.saveAsNewItem.click();
        await expect(this.saveDialog).toBeVisible({ timeout: 15_000 });
        await this.nameInput.fill(name);
        await expect(this.executeReport, 'Execute report is on by default').toBeChecked();
        // Saving with it on auto-runs the report and closes the dialog (PET-13151), so a Load check saves with it off.
        if (opts.executeReport === false) {
            await this.executeReport.uncheck();
            await expect(this.executeReport).not.toBeChecked();
        }
        await this.saveSubmit.click();
        await expect(this.toast(savedToast)).toBeVisible({ timeout: 15_000 });
        await expect(this.saveDialog).toBeHidden({ timeout: 15_000 });
    }
}
