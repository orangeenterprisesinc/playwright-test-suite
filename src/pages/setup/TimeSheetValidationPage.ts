/**
 * Setup ▸ TimeSheet Setup (`/setup/timesheet/validations`, heading "TimeSheet Validations"): WEBPET-3706.
 *
 * Measured on dev 2026-11-02 (su): Name is the only field. Multi-Edit (page-header-action-multi-update) reveals
 * "Select <name>" checkboxes and the "Selected rows actions" bar (N selected, Undo, More actions). More actions ▸ Delete
 * opens "Delete N selected rows?" (Cancel / "Delete N"); then toast "Records deleted", grid "No validations found.", and
 * the bar holds only Undo (POST validations/bulk-delete-undo/<batch>), which brings the rows back with toast "Delete undone".
 * Deletes are soft and a deleted name stays reserved (WEBPET-1798), so every name is run-minted.
 */
import { Locator, Page, expect } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';

export class TimeSheetValidationPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly multiEditButton: Locator;
    readonly selectionBar: Locator;
    readonly undoButton: Locator;
    readonly emptyGridMessage: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/timesheet/validations',
            gridName: 'TimeSheet Validations',
            entity: 'Validation',
            menuPath: ['Setup', 'TimeSheet Setup'],
            rejectionMessage: /Already in use|already exists/i,
        });
        this.nameInput = page.locator('#name');
        this.multiEditButton = page.getByTestId('page-header-action-multi-update');
        this.selectionBar = page.getByRole('region', { name: 'Selected rows actions' });
        this.undoButton = this.selectionBar.getByRole('button', { name: 'Undo', exact: true });
        this.emptyGridMessage = page.getByText('No validations found.', { exact: true });
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async createValidation(name: string): Promise<FormOutcome> {
        return this.createOnScreen(() => this.nameInput.fill(name));
    }

    /** One row by its exact name; `grid.rowFor` matches by substring and would also find `<name>-2`. */
    ownRow(name: string): Locator {
        return this.page.getByRole('row').filter({ has: this.page.getByRole('link', { name: `Edit Validation: ${name}`, exact: true }) });
    }

    toast(text: string): Locator {
        return this.page.locator('[data-sonner-toast][data-type="success"]', { hasText: text });
    }

    get errorToasts(): Locator {
        return this.page.locator('[data-sonner-toast][data-type="error"]');
    }

    async setMultiEdit(on: boolean): Promise<void> {
        if (((await this.multiEditButton.getAttribute('aria-pressed')) === 'true') !== on) await this.multiEditButton.click();
        await expect(this.multiEditButton).toHaveAttribute('aria-pressed', String(on));
    }

    async selectedCount(): Promise<number> {
        await this.selectionBar.waitFor({ state: 'visible', timeout: 15_000 });
        return Number(/(\d+)\s*selected/i.exec((await this.selectionBar.textContent()) ?? '')?.[1] ?? 0);
    }

    /** Selection bar ▸ More actions ▸ Delete ▸ "Delete N". */
    async deleteSelected(count: number): Promise<void> {
        await this.selectionBar.getByRole('button', { name: 'More actions' }).click();
        await this.page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
        const dialog = this.page.getByRole('alertdialog', { name: `Delete ${String(count)} selected rows?` });
        await dialog.getByRole('button', { name: `Delete ${String(count)}`, exact: true }).click();
        await expect(dialog).toBeHidden({ timeout: 15_000 });
    }
}

export default TimeSheetValidationPage;
