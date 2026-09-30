/**
 * Setup ▸ Ranch (`/setup/ranches`).
 *
 * Under the UI-first rule the journey fixture's ranches are created and repaired
 * through this form, not through `POST /ranches` — an API-created row can hold a
 * combination the form would reject, and then the journey proves nothing.
 *
 * Live 2026-09-30: Ranch Name is the only thing gating Save; Department is optional
 * despite the plan assuming otherwise. The Map section is never waited on.
 */
import { Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface NewRanchData {
    name: string;
    code: string;
    exportIdentifier?: string;
    department?: string;
}

export class RanchPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly codeInput: Locator;
    readonly exportIdentifierInput: Locator;
    readonly departmentCombobox: Locator;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/ranches',
            gridName: 'Ranches',
            entity: 'Ranch',
            menuPath: ['Setup', 'Ranch'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update) ranch/i,
        });
        this.nameInput = page.locator('#name');
        this.codeInput = page.locator('#code');
        this.exportIdentifierInput = page.locator('#exportIdentifier');
        this.departmentCombobox = page.locator('#departmentCounter');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async fillForm(data: NewRanchData): Promise<void> {
        await this.assertCodeEditable(this.codeInput);
        await this.codeInput.fill(data.code);
        if (data.department) await this.pickers.pickCombobox(this.departmentCombobox, data.department);
        // Export Identifier auto-fills from Name on blur, so an explicit one is written
        // after Name — and Name is filled last regardless, to settle form validity.
        await this.nameInput.fill(data.name);
        if (data.exportIdentifier) {
            await this.nameInput.blur();
            await this.exportIdentifierInput.fill(data.exportIdentifier);
        }
    }

    /** List → New → fill → save. `'rejected'` means the name or code is taken. */
    async createRanch(data: NewRanchData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }
}

export default RanchPage;
