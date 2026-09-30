/**
 * Setup ▸ Employee (`/setup/employees`).
 *
 * The screen every Journey B run depends on. Three things bite:
 *
 * - **Always fill Barcode.** A code-less create hits the auto-barcode counter wedge and
 *   mints a code that is not the one the fixture's XML envelopes reference, so the
 *   import dangles. `assertCodeEditable` fails by name rather than letting that happen.
 * - **Crew arrives pre-filled** on a New form (from preferences), so `setHomeCrew`
 *   overwrites rather than assuming an empty picker.
 * - **The grid renders surname-first**, so a created employee is verified by reading the
 *   record back, never by matching grid text.
 *
 * Active is the shared header switch, and Pay Period — which the plan suspected of being
 * required — is optional, defaulting to Hourly.
 */
import { Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface NewEmployeeData {
    name: string;
    code: string;
    firstName?: string;
    lastName?: string;
    /** Home crew, as the picker lists it. */
    crew?: string;
}

export class EmployeePage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly codeInput: Locator;
    readonly firstNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly crewCombobox: Locator;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/employees',
            gridName: 'Employees',
            entity: 'Employee',
            menuPath: ['Setup', 'Employee'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update) employee/i,
        });
        this.nameInput = page.locator('#name');
        this.codeInput = page.locator('#code');
        this.firstNameInput = page.locator('#firstName');
        this.lastNameInput = page.locator('#lastName');
        this.crewCombobox = page.locator('#crewCounter');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async fillForm(data: NewEmployeeData): Promise<void> {
        await this.assertCodeEditable(this.codeInput);
        await this.codeInput.fill(data.code);
        if (data.firstName) await this.firstNameInput.fill(data.firstName);
        if (data.lastName) await this.lastNameInput.fill(data.lastName);
        if (data.crew) await this.pickers.pickCombobox(this.crewCombobox, data.crew);
        await this.nameInput.fill(data.name);
    }

    async createEmployee(data: NewEmployeeData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }

    /** The home crew as the picker displays it — empty string when unset. */
    async readHomeCrew(): Promise<string> {
        return this.crewCombobox.inputValue();
    }

    /**
     * Put the employee in a crew and save. A no-op when already there: D6 proved that
     * an employee with no home crew is exactly the invalid fixture an API-driven
     * journey never notices, so this is a repair, run only when the read says so.
     */
    async setHomeCrew(crewName: string): Promise<void> {
        if (PickerComponent.labelPattern(crewName).test(await this.readHomeCrew())) return;
        await this.pickers.pickCombobox(this.crewCombobox, crewName);
        await this.saveEdit();
    }
}

export default EmployeePage;
