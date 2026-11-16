import { Locator, Page, expect } from '@playwright/test';
import { PickerComponent } from '../../components/PickerComponent';

/**
 * The "Add Alias Set" form a double-click on the User form's Alias Set field opens (web-pet #1547). Measured 2026-11-11:
 * heading "Add Alias Set", "Name *", "Alias Type *", Comment, an "Alias Fields Records: N" header with a table below
 * (or "No alias fields available." while empty), buttons Cancel / Save / Close.
 */
export class AliasSetDialog {
    readonly root: Locator;
    readonly nameInput: Locator;
    readonly aliasTypeSelect: Locator;
    readonly fieldsHeader: Locator;
    readonly fieldsGrid: Locator;
    private readonly pickers: PickerComponent;

    constructor(private readonly page: Page) {
        this.root = page.getByRole('dialog', { name: 'Add Alias Set' });
        this.nameInput = this.root.locator('#name');
        this.aliasTypeSelect = this.root.locator('#aliasType').or(this.root.getByRole('combobox', { name: /^Alias Type/ })).first();
        this.fieldsHeader = this.root.getByText(/Alias Fields\s*Records:\s*\d+/).first();
        this.fieldsGrid = this.root.getByRole('grid').or(this.root.getByRole('table')).first();
        this.pickers = new PickerComponent(page);
    }

    /** Blank: nothing shown, or the trigger carries the placeholder marker. */
    async aliasTypeIsBlank(): Promise<boolean> {
        const shown = await this.aliasTypeSelect.evaluate((el) => (el instanceof HTMLInputElement ? el.value : (el.textContent ?? '')).trim());
        return shown === '' || (await this.aliasTypeSelect.getAttribute('data-placeholder')) !== null;
    }

    async chooseAliasType(label: string): Promise<void> {
        await this.pickers.pickSelect(this.aliasTypeSelect, label);
    }

    /** One column of the Alias Fields table, read once the row count stops changing. */
    async aliasFieldNames(column: string): Promise<string[]> {
        const headers = (await this.fieldsGrid.getByRole('columnheader').allInnerTexts()).map((h) => h.trim());
        const index = headers.findIndex((h) => h === column || h.startsWith(column));
        if (index < 0) throw new Error(`Alias Fields grid has no '${column}' column; it shows: ${headers.join(' · ')}`);
        const rows = this.fieldsGrid.getByRole('row').filter({ has: this.page.getByRole('cell') });
        let last = -1;
        await expect
            .poll(async () => {
                const n = await rows.count();
                const settled = n > 0 && n === last;
                last = n;
                return settled;
            }, { timeout: 20_000, message: 'the Alias Fields rows never settled' })
            .toBe(true);
        return rows.evaluateAll(
            (trs, i) => trs.map((tr) => (tr.querySelectorAll('[role="cell"], td')[i]?.textContent ?? '').trim()),
            index,
        );
    }

    /** Save inside the dialog: waits for POST alias-sets, then the dialog closes. */
    async save(): Promise<void> {
        const posted = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/alias-sets\/?$/.test(new URL(r.url()).pathname),
            { timeout: 30_000 },
        );
        // Validation is react-hook-form onBlur: the form stays invalid (Save disabled) until Name blurs.
        await this.nameInput.blur();
        const saveButton = this.root.getByRole('button', { name: 'Save', exact: true });
        await expect(saveButton, 'Save enabled once Name and Alias Type are set').toBeEnabled({ timeout: 15_000 });
        await saveButton.click();
        expect((await posted).status(), 'POST alias-sets').toBeLessThan(300);
        await expect(this.root).toBeHidden({ timeout: 15_000 });
    }
}
