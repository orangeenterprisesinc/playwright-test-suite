/**
 * Setup ▸ Crop (`/setup/crops`): the form, the list and its Multi Update delete.
 *
 * Barcode is left empty on New and auto-assigns. Name is the only gate on Save.
 * No "Select all rows" and no selection-bar Undo click are exposed: D8 ticks its own rows by name.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';

export interface NewCropData {
    name: string;
}

export class CropPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly exportIdentifierInput: Locator;
    readonly codeInput: Locator;
    /** The Edit form's Delete; the confirmation dialog renders outside `<main>`. */
    readonly formDeleteButton: Locator;
    readonly multiUpdateButton: Locator;
    readonly selectionBar: Locator;
    /** Exposed for a visibility check only; never clicked. */
    readonly selectionUndoButton: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/crops',
            gridName: 'Crops',
            entity: 'Crop',
            menuPath: ['Setup', 'Crop'],
            rejectionMessage: /Already in use|A crop with this name already exists\./,
        });
        this.nameInput = page.locator('#name');
        this.exportIdentifierInput = page.locator('#exportIdentifier');
        this.codeInput = page.locator('#code');
        this.formDeleteButton = page.getByRole('main').getByRole('button', { name: 'Delete', exact: true });
        this.multiUpdateButton = page.getByTestId('page-header-action-multi-update');
        this.selectionBar = page.getByRole('region', { name: 'Selected rows actions' });
        this.selectionUndoButton = this.selectionBar.getByRole('button', { name: 'Undo' });
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async createCrop(data: NewCropData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.nameInput.fill(data.name));
    }

    successToast(text: string): Locator {
        // A toast from the previous action may still be fading; either one proves the action.
        return this.page.getByText(text, { exact: true }).first();
    }

    heading(text: string): Locator {
        return this.page.getByRole('heading', { name: text, level: 1, exact: true });
    }

    deleteDialog(name: string): Locator {
        return this.page.getByRole('alertdialog', { name: `Delete "${name}"?` });
    }

    /** Edit form ▸ Delete ▸ confirm. `inspect` runs while the dialog is open, before the confirm click. */
    async deleteFromForm(name: string, inspect?: (dialog: Locator) => Promise<void>): Promise<void> {
        await this.formDeleteButton.click();
        const dialog = this.deleteDialog(name);
        await dialog.waitFor({ state: 'visible' });
        await inspect?.(dialog);
        await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
        await this.page.waitForURL(/\/setup\/crops(\?|$)/);
        await this.newButton.waitFor({ state: 'visible' });
    }

    /** Name filter is a contains match and the URL gains `?name=`; re-apply after every navigation. */
    async filterToStem(stem: string): Promise<void> {
        await this.grid.nameFilter.waitFor({ state: 'visible' });
        await this.grid.nameFilter.fill(stem);
    }

    /** Polls the "Total N rows" footer, which lags the filter. */
    async expectTotal(count: number, message: string): Promise<void> {
        await expect
            .poll(
                async () => {
                    const text = await this.grid.totalRowsStatus.textContent({ timeout: 2_000 }).catch(() => null);
                    const match = /Total (\d+) rows/.exec(text ?? '');
                    return match ? Number(match[1]) : -1;
                },
                { message, timeout: 30_000 },
            )
            .toBe(count);
    }

    /** Rows whose Edit link starts with the run's name stem. */
    ownRows(stem: string): Locator {
        const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return this.page
            .getByRole('row')
            .filter({ has: this.page.getByRole('link', { name: new RegExp(`^Edit Crop: ${escaped}`) }) });
    }

    /** Full reload of the list; the filter is dropped, so re-apply it. */
    async reloadList(): Promise<void> {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.newButton.waitFor({ state: 'visible' });
    }

    async enableMultiUpdate(): Promise<void> {
        await this.multiUpdateButton.click();
        await expect(this.multiUpdateButton).toHaveAttribute('aria-pressed', 'true');
    }

    /** By name, exact: never "Select all rows". */
    rowCheckbox(name: string): Locator {
        return this.page.getByRole('checkbox', { name: `Select ${name}`, exact: true });
    }

    /** The "N selected" count in the selection bar's text. */
    async selectedCount(): Promise<number> {
        await this.selectionBar.waitFor({ state: 'visible', timeout: 15_000 });
        const text = (await this.selectionBar.textContent()) ?? '';
        return Number(/(\d+)\s*selected/i.exec(text)?.[1] ?? 0);
    }

    /** Selection bar ▸ More actions ▸ Delete ▸ confirm. `inspect` runs while the dialog is open. */
    async deleteSelected(count: number, inspect?: (dialog: Locator) => Promise<void>): Promise<void> {
        // The page header has its own "More actions"; scope to the bar.
        await this.selectionBar.getByRole('button', { name: 'More actions' }).click();
        await this.page.getByRole('menuitem', { name: 'Delete' }).click();
        const dialog = this.page.getByRole('alertdialog', { name: `Delete ${String(count)} selected rows?` });
        await dialog.waitFor({ state: 'visible' });
        await inspect?.(dialog);
        await dialog.getByRole('button', { name: `Delete ${String(count)}`, exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
    }
}

export default CropPage;
