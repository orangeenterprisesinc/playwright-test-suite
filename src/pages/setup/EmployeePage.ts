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
 * required — is optional, defaulting to Hourly. The form is one scrolling page (General /
 * Additional Info / Contact / Identification), Default Field is filtered by the chosen
 * Default Ranch, and Department is a creatable combobox — pick it by anchored label so a
 * typo never mints a department.
 */
import { Locator, Page, expect } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface NewEmployeeData {
    name: string;
    code: string;
    firstName?: string;
    lastName?: string;
    /** Home crew, as the picker lists it. */
    crew?: string;
    exportIdentifier?: string;
    department?: string;
    hourlyRate?: string;
    /** The Select's option text: Male / Female / Non-Binary. */
    gender?: string;
    /** ISO `YYYY-MM-DD`, as the `type=date` input holds it. */
    dateOfBirth?: string;
    defaultRanch?: string;
    defaultField?: string;
    defaultJob?: string;
    nfcCode?: string;
    rfidCode?: string;
    waivedFirstMeal?: boolean;
    waivedSecondMeal?: boolean;
}

/** Every value the reload check compares, as the form displays it. */
export interface EmployeeFormValues {
    name: string;
    code: string;
    exportIdentifier: string;
    lastName: string;
    department: string;
    crew: string;
    payPeriod: string;
    hourlyRate: string;
    hireDate: string;
    gender: string;
    dateOfBirth: string;
    defaultRanch: string;
    defaultField: string;
    defaultJob: string;
    nfcCode: string;
    rfidCode: string;
    waivedFirstMeal: boolean;
    waivedSecondMeal: boolean;
    active: boolean;
}

/** A light read to compare before and after an import; `readEmployeeForm` waits too long on empty pickers for that. */
export interface EmployeeProfileSummary {
    name: string;
    code: string;
    exportIdentifier: string;
    lastName: string;
    crew: string;
    payPeriod: string;
    hireDate: string;
    rfidCode: string;
    active: boolean;
}

export interface CodeHistoryRow {
    alternateCode: string;
    firstCode: string;
    codeType: string;
    startDateTime: string;
}

export class EmployeePage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly generalSection: Locator;
    readonly faceIrisLabel: Locator;
    readonly clearTemplateButton: Locator;
    readonly photoGroup: Locator;
    readonly photoClearButton: Locator;
    readonly photoImage: Locator;
    readonly irisSection: Locator;
    readonly codeHistorySection: Locator;
    readonly codeInput: Locator;
    readonly firstNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly crewCombobox: Locator;
    readonly exportIdentifierInput: Locator;
    readonly departmentCombobox: Locator;
    readonly payPeriodSelect: Locator;
    readonly hourlyRateInput: Locator;
    readonly hireDateButton: Locator;
    readonly genderSelect: Locator;
    readonly dateOfBirthInput: Locator;
    readonly defaultRanchSelect: Locator;
    readonly defaultFieldCombobox: Locator;
    readonly defaultJobCombobox: Locator;
    readonly nfcCodeInput: Locator;
    readonly rfidCodeInput: Locator;
    readonly waivedFirstMealSwitch: Locator;
    readonly waivedSecondMealSwitch: Locator;
    readonly createdToast: Locator;
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
        this.exportIdentifierInput = page.locator('#exportIdentifier');
        this.departmentCombobox = page.locator('input#departmentCounter');
        this.payPeriodSelect = page.locator('button#payPeriod');
        this.hourlyRateInput = page.locator('input#rate');
        // Employment History on the Edit form also has a "Hire Date" label, but as a textbox, so role+exact is unique.
        this.hireDateButton = page.getByRole('button', { name: 'Hire Date', exact: true });
        this.genderSelect = page.locator('button#gender');
        this.dateOfBirthInput = page.locator('input#dateOfBirth');
        this.defaultRanchSelect = page.locator('button#defaultRanchCounter');
        this.defaultFieldCombobox = page.locator('input#defaultFieldCounter');
        this.defaultJobCombobox = page.locator('input#defaultJobCounter');
        this.nfcCodeInput = page.locator('#nfcCode');
        this.rfidCodeInput = page.locator('#rfidCode');
        this.waivedFirstMealSwitch = page.getByRole('switch', { name: 'Waived First Meal' });
        this.waivedSecondMealSwitch = page.getByRole('switch', { name: 'Waived Second Meal' });
        this.createdToast = page.locator('[data-sonner-toast][data-type="success"]', { hasText: 'Employee created' });
        this.generalSection = page.locator('section#general');
        // Absent until the tenant has a face/iris device (WEBPET-2415 gate).
        this.faceIrisLabel = this.generalSection.getByText('Face-Iris Template', { exact: true });
        this.clearTemplateButton = page.getByRole('button', { name: 'Clear template' });
        // Crew and Hire Date also have a "Clear" button, so Photo's is scoped through its own label group.
        this.photoGroup = this.generalSection.locator('[data-slot="label"]').filter({ hasText: /^Photo$/ }).locator('..');
        this.photoClearButton = this.photoGroup.getByRole('button', { name: 'Clear', exact: true });
        this.photoImage = this.photoGroup.locator('img');
        this.irisSection = page.locator('section#iris');
        this.codeHistorySection = page.locator('section#codeHistory');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    editHeading(name: string): Locator {
        return this.page.getByRole('heading', { level: 1, name: `Edit Employee: ${name}` });
    }

    async fillForm(data: NewEmployeeData): Promise<void> {
        await this.assertCodeEditable(this.codeInput);
        await this.codeInput.fill(data.code);
        if (data.exportIdentifier) await this.exportIdentifierInput.fill(data.exportIdentifier);
        if (data.firstName) await this.firstNameInput.fill(data.firstName);
        if (data.lastName) await this.lastNameInput.fill(data.lastName);
        if (data.department) await this.pickers.pickCombobox(this.departmentCombobox, data.department);
        if (data.crew) await this.pickers.pickCombobox(this.crewCombobox, data.crew);
        if (data.hourlyRate) await this.hourlyRateInput.fill(data.hourlyRate);
        if (data.gender) await this.pickers.pickSelect(this.genderSelect, data.gender);
        if (data.dateOfBirth) await this.dateOfBirthInput.fill(data.dateOfBirth);
        if (data.defaultRanch) await this.pickers.pickSelect(this.defaultRanchSelect, data.defaultRanch);
        if (data.defaultField) await this.pickers.pickCombobox(this.defaultFieldCombobox, data.defaultField);
        if (data.defaultJob) await this.pickers.pickCombobox(this.defaultJobCombobox, data.defaultJob);
        if (data.nfcCode) await this.nfcCodeInput.fill(data.nfcCode);
        if (data.rfidCode) await this.rfidCodeInput.fill(data.rfidCode);
        if (data.waivedFirstMeal) await this.switchOn(this.waivedFirstMealSwitch);
        if (data.waivedSecondMeal) await this.switchOn(this.waivedSecondMealSwitch);
        await this.nameInput.fill(data.name);
    }

    async createEmployee(data: NewEmployeeData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }

    /** Click only when off: a second click would switch it back. */
    private async switchOn(toggle: Locator): Promise<void> {
        if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }

    async readHireDate(): Promise<string> {
        return (await this.hireDateButton.innerText()).trim();
    }

    /** Today on the browser's clock — the one that fills Hire Date — as ISO. */
    async browserToday(): Promise<string> {
        return this.page.evaluate(() => new Date().toLocaleDateString('en-CA'));
    }

    async readEmployeeForm(): Promise<EmployeeFormValues> {
        // Pickers show "<exportId> : <name>" when the row has an export id.
        // The pickers fill in after the form renders: empty until their options load, and the
        // ranch select shows its raw counter id. Give them time, then read whatever is there so
        // a genuinely unset picker still comes back empty.
        const settled = async (read: () => Promise<string>, loaded: (v: string) => boolean): Promise<string> => {
            await expect.poll(async () => loaded(await read()), { timeout: 10_000 }).toBe(true).catch(() => undefined);
            return read();
        };
        const label = async (picker: Locator) =>
            (await settled(() => picker.inputValue(), (v) => v !== '')).replace(/^\S+ : /, '');
        const text = async (trigger: Locator) => (await trigger.innerText()).trim();
        const ranch = () => settled(() => text(this.defaultRanchSelect), (v) => v !== '' && !/^\d+$/.test(v));
        const on = async (toggle: Locator) => (await toggle.getAttribute('aria-checked')) === 'true';
        return {
            name: await this.nameInput.inputValue(),
            code: await this.codeInput.inputValue(),
            exportIdentifier: await this.exportIdentifierInput.inputValue(),
            lastName: await this.lastNameInput.inputValue(),
            department: await label(this.departmentCombobox),
            crew: await label(this.crewCombobox),
            payPeriod: await text(this.payPeriodSelect),
            hourlyRate: await this.hourlyRateInput.inputValue(),
            hireDate: await this.readHireDate(),
            gender: await text(this.genderSelect),
            dateOfBirth: await this.dateOfBirthInput.inputValue(),
            defaultRanch: await ranch(),
            defaultField: await label(this.defaultFieldCombobox),
            defaultJob: await label(this.defaultJobCombobox),
            nfcCode: await this.nfcCodeInput.inputValue(),
            rfidCode: await this.rfidCodeInput.inputValue(),
            waivedFirstMeal: await on(this.waivedFirstMealSwitch),
            waivedSecondMeal: await on(this.waivedSecondMealSwitch),
            active: await on(this.activeSwitch),
        };
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

    /** `Face: Enrolled` / `Left iris: Not enrolled` … chip for one slot. */
    faceIrisChip(slot: string): Locator {
        return this.generalSection.getByText(new RegExp(`^${slot}: (Enrolled|Not enrolled)$`));
    }

    /** Slot → the status part of its chip; throws when a chip is missing, so callers poll it. */
    async readFaceIrisChips(slots: readonly string[]): Promise<Record<string, string>> {
        const entries: [string, string][] = [];
        for (const slot of slots) {
            const text = await this.faceIrisChip(slot).innerText({ timeout: 15_000 });
            entries.push([slot, text.slice(text.indexOf(': ') + 2).trim()]);
        }
        return Object.fromEntries(entries);
    }

    async readPhotoSize(): Promise<{ width: number; height: number }> {
        await expect(this.photoImage).toBeVisible();
        await expect
            .poll(() => this.photoImage.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
            .toBe(true);
        return this.photoImage.evaluate((img: HTMLImageElement) => ({ width: img.naturalWidth, height: img.naturalHeight }));
    }

    /** "Iris / Face Enrollment" rows: `dt` label → `dd` badge text. */
    async readIrisEnrollment(): Promise<Record<string, string>> {
        await this.irisSection.waitFor({ state: 'visible', timeout: 15_000 });
        const rows = await this.irisSection
            .locator('dl > div')
            .evaluateAll((items) =>
                items.map((item): [string, string] => [
                    item.querySelector('dt')?.textContent?.trim() ?? '',
                    item.querySelector('dd')?.textContent?.trim() ?? '',
                ]),
            );
        return Object.fromEntries(rows);
    }

    /** Code Badge History rows as the editable inputs hold them. Read-only: never Save, leave through Cancel/back. */
    async readCodeHistory(): Promise<CodeHistoryRow[]> {
        const section = this.codeHistorySection;
        await expect(section, 'the employee form has no Code Badge History section').toBeVisible({ timeout: 30_000 });
        const empty = section.getByText('No code history records.');
        // `has` is resolved inside each row, so it must not be rooted at `section` (that matched no row at all).
        const rows = section.getByRole('row').filter({ has: this.page.getByRole('textbox', { name: 'Alternate Code', exact: true }) });
        await expect(empty.or(rows.first()), 'Code Badge History shows neither rows nor "No code history records."').toBeVisible({ timeout: 30_000 });
        if (await empty.isVisible()) return [];
        const total = Number(/(\d+)/.exec((await section.getByTestId('code-history-count').innerText()) ?? '')?.[1] ?? NaN);
        const count = await rows.count();
        if (count !== total) throw new Error(`Code Badge History reports ${total} records but renders ${count} rows`);
        const out: CodeHistoryRow[] = [];
        for (let i = 0; i < count; i += 1) {
            const row = rows.nth(i);
            out.push({
                alternateCode: await row.getByRole('textbox', { name: 'Alternate Code', exact: true }).inputValue(),
                firstCode: await row.getByRole('textbox', { name: 'First Code', exact: true }).inputValue(),
                codeType: (((await row.getByRole('combobox').first().textContent()) ?? '')).trim(),
                startDateTime: await row.getByLabel('Start Date/Time').inputValue(),
            });
        }
        return out;
    }

    async readProfileSummary(): Promise<EmployeeProfileSummary> {
        // The crew picker fills in after the form renders; an unset crew still reads empty.
        await expect(this.crewCombobox).not.toHaveValue('', { timeout: 10_000 }).catch(() => undefined);
        return {
            name: await this.nameInput.inputValue(),
            code: await this.codeInput.inputValue(),
            exportIdentifier: await this.exportIdentifierInput.inputValue(),
            lastName: await this.lastNameInput.inputValue(),
            crew: (await this.readHomeCrew()).replace(/^\S+ : /, ''),
            payPeriod: (await this.payPeriodSelect.innerText()).trim(),
            hireDate: await this.readHireDate(),
            rfidCode: await this.rfidCodeInput.inputValue(),
            active: (await this.activeSwitch.getAttribute('aria-checked')) === 'true',
        };
    }

    /** Identification ▸ Cards ▸ RFID Code; `saveEdit` waits for the PUT and re-opens the record. */
    async setRfidCode(code: string): Promise<void> {
        await this.rfidCodeInput.fill(code);
        await expect(this.unsavedChangesBar).toBeVisible();
        await this.saveEdit();
    }
}

export default EmployeePage;
