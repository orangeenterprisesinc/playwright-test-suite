/**
 * Setup ▸ Job (`/setup/jobs`): the job record D6 re-rates. Grid, on-blur validation and the Save
 * dance come from SetupScreenPage.
 *
 * The rate change is catalog D6's own step 1 ("change the pay rate or setup record"), so it is
 * driven here rather than through `PUT /jobs/{id}` — a workflow step a user performs belongs on
 * screen, and a repro recording that skips it shows nothing.
 *
 * Live 2026-09-29: editing a Piece job renders both `#pieceRate` ("Piece Rate *") and `#hourlyRate`
 * ("Hourly Rate"); the piece one is the required field. The form hydrates after `GET /jobs/{id}`
 * answers, and anything typed before that lands is wiped by the reset — hence the wait on Name
 * holding the record's value before touching the rate.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

/** `#paymentType`'s wire values. The full enum runs to 16; a journey needs these two. */
export const PAYMENT_TYPE = { Time: '0', Piece: '1' } as const;

export type PaymentType = keyof typeof PAYMENT_TYPE;

export interface NewJobData {
    name: string;
    code: string;
    paymentType: PaymentType;
    /** Required for a Time job. */
    hourlyRate?: number;
    /** Required for a Piece job. */
    pieceRate?: number;
}

export class JobPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly codeInput: Locator;
    readonly pieceRateInput: Locator;
    readonly hourlyRateInput: Locator;
    readonly paymentTypeSelect: Locator;
    readonly overtimeRulesCombobox: Locator;
    readonly considerEmployeeRateControl: Locator;
    /** Textbox "Earning Code" (measured 2026-10-26); comma-separated, e.g. RH,,OT,,DT,,RDP,,ODT,,DDT. */
    readonly earningCodesInput: Locator;
    /** Textbox "Export Identifier" (`#exportIdentifier`); defaults to the name on a new job, editable for SU. */
    readonly exportIdentifierInput: Locator;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/jobs',
            gridName: 'Jobs',
            entity: 'Job',
            menuPath: ['Setup', 'Job'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update) job/i,
        });
        this.nameInput = page.locator('#name');
        this.codeInput = page.locator('#code');
        this.pieceRateInput = page.locator('#pieceRate');
        this.hourlyRateInput = page.locator('#hourlyRate');
        this.paymentTypeSelect = page.locator('#paymentType');
        // Lower-case t here; Setup ▸ Field spells the same field `#overTimeRulesCounter`.
        this.overtimeRulesCombobox = page.locator('#overtimeRulesCounter');
        this.considerEmployeeRateControl = page.getByLabel(/Consider Employee Rate/i);
        this.earningCodesInput = page.getByRole('textbox', { name: 'Earning Code', exact: true });
        this.exportIdentifierInput = page.locator('#exportIdentifier');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    /**
     * Choose the payment type by its wire value rather than its label: the enum is the
     * contract the rest of the suite joins on, and picking `1` cannot drift the way
     * matching the word "Piece" can.
     */
    async selectPaymentType(type: PaymentType): Promise<void> {
        await this.pickers.pickSelectByValue(this.paymentTypeSelect, PAYMENT_TYPE[type]);
    }

    /**
     * Pick the first Overtime Rule offered. Save is gated on it for **both** payment
     * types, and no journey asserts which rule a fixture job carries — so any valid one
     * will do, and naming a specific one would only couple the fixture to tenant data.
     */
    async pickFirstOvertimeRule(): Promise<void> {
        await this.overtimeRulesCombobox.click();
        const options = this.page.getByRole('listbox').getByRole('option');
        await options.first().waitFor({ state: 'visible' });
        await options.first().click();
    }

    async fillForm(data: NewJobData): Promise<void> {
        await this.assertCodeEditable(this.codeInput);
        await this.codeInput.fill(data.code);
        await this.selectPaymentType(data.paymentType);
        await this.pickFirstOvertimeRule();
        // Both rate fields are always in the DOM — presence is not the signal, the
        // payment type is. Writing the wrong one leaves Save disabled with no message.
        if (data.paymentType === 'Piece') {
            await this.pieceRateInput.fill(String(data.pieceRate ?? 0));
        } else {
            await this.hourlyRateInput.fill(String(data.hourlyRate ?? 0));
        }
        await this.nameInput.fill(data.name);
    }

    async createJob(data: NewJobData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }

    /** The saved job's id from the Edit URL. */
    savedJobId(): number {
        return this.savedIdFromUrl();
    }

    /**
     * Set the job's piece rate on screen and save. Returns the value the form holds afterwards, so
     * the caller asserts the change against the UI it just drove rather than against its own input.
     */
    async setPieceRate(rate: number): Promise<string> {
        const current = await this.pieceRateInput.inputValue();
        // Writing the value it already holds leaves the form clean, and Save correctly never
        // enables — so there is nothing to save, not a failure.
        if (Number(current) === rate) return current;

        const id = this.savedIdFromUrl();
        const name = await this.nameInput.inputValue();
        await this.pieceRateInput.fill(String(rate));
        // Validation runs on blur, and Save stays disabled until it has.
        await this.pieceRateInput.blur();
        await expect(this.saveButton, `Save stayed disabled after setting Piece Rate to ${rate}`).toBeEnabled({ timeout: 15_000 });
        await this.saveButton.click();
        // The Unsaved-changes bar clears once the update commits.
        await expect(this.unsavedChangesBar).toBeHidden({ timeout: 15_000 });

        // Saving leaves the form, so read the rate back from a fresh load of the record rather than
        // from the fields we just typed into - that is what makes this a UI verification.
        await this.gotoEditById(id, name);
        await this.pieceRateInput.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(this.pieceRateInput).not.toHaveValue('', { timeout: 30_000 });
        return this.pieceRateInput.inputValue();
    }

    /** The Overtime Rule combobox's label, once its options have hydrated. */
    async readOvertimeRule(): Promise<string> {
        // The combobox fetches its own options after the rest of the form has settled; read it too
        // early and an already-correct record looks unset.
        await expect(this.overtimeRulesCombobox).not.toHaveAttribute('placeholder', /^Loading/);
        return this.overtimeRulesCombobox.inputValue();
    }

    /**
     * Pickers label an option bare or as "<exportIdentifier> : <name>", so the no-op check is the
     * label pattern, never `===`. A wrong "different" re-picks, leaves the form clean, Save never
     * enables, and the failure reads "Save stayed disabled".
     */
    async setOvertimeRule(name: string): Promise<string> {
        const current = await this.readOvertimeRule();
        if (PickerComponent.labelPattern(name).test(current)) return current;

        await this.pickers.pickCombobox(this.overtimeRulesCombobox, name);
        // saveEdit re-opens the record, so the rule is read back from a fresh load.
        await this.saveEdit();
        return this.readOvertimeRule();
    }

    async setHourlyRate(rate: number): Promise<string> {
        const current = await this.hourlyRateInput.inputValue();
        if (Number(current) === rate) return current;

        const id = this.savedIdFromUrl();
        const name = await this.nameInput.inputValue();
        await this.hourlyRateInput.fill(String(rate));
        // Validation runs on blur, and Save stays disabled until it has.
        await this.hourlyRateInput.blur();
        await expect(this.saveButton, `Save stayed disabled after setting Hourly Rate to ${rate}`).toBeEnabled({ timeout: 15_000 });
        await this.saveButton.click();
        await expect(this.unsavedChangesBar).toBeHidden({ timeout: 15_000 });

        await this.gotoEditById(id, name);
        await this.hourlyRateInput.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(this.hourlyRateInput).not.toHaveValue('', { timeout: 30_000 });
        return this.hourlyRateInput.inputValue();
    }

    /** Read once the form has hydrated (Name holds the record's value), or an already-set field looks empty. */
    async readEarningCodes(): Promise<string> {
        await expect(this.nameInput).not.toHaveValue('', { timeout: 30_000 });
        await this.earningCodesInput.waitFor({ state: 'visible', timeout: 15_000 });
        return this.earningCodesInput.inputValue();
    }

    /** Read-first no-op; otherwise types, saves and returns what a fresh load of the record shows. */
    async setEarningCodes(value: string): Promise<string> {
        const current = await this.readEarningCodes();
        if (current === value) return current;

        const id = this.savedIdFromUrl();
        const name = await this.nameInput.inputValue();
        await this.earningCodesInput.fill(value);
        await this.earningCodesInput.blur();
        await expect(this.saveButton, `Save stayed disabled after setting Earning Codes to ${value}`).toBeEnabled({ timeout: 15_000 });
        await this.saveButton.click();
        await expect(this.unsavedChangesBar).toBeHidden({ timeout: 15_000 });

        await this.gotoEditById(id, name);
        return this.readEarningCodes();
    }

    /** Read once the form has hydrated (Name holds the record's value), or an already-set field looks empty. */
    async readExportIdentifier(): Promise<string> {
        await expect(this.nameInput).not.toHaveValue('', { timeout: 30_000 });
        await this.exportIdentifierInput.waitFor({ state: 'visible', timeout: 15_000 });
        return this.exportIdentifierInput.inputValue();
    }

    /** Read-first no-op; otherwise types, saves and returns what a fresh load of the record shows. */
    async setExportIdentifier(value: string): Promise<string> {
        const current = await this.readExportIdentifier();
        if (current === value) return current;
        await expect(this.exportIdentifierInput, 'Export Identifier is read-only — allowRecordExportIdModify / SU gate').toBeEnabled();

        const id = this.savedIdFromUrl();
        const name = await this.nameInput.inputValue();
        await this.exportIdentifierInput.fill(value);
        await this.exportIdentifierInput.blur();
        await expect(this.saveButton, `Save stayed disabled after setting Export Identifier to ${value}`).toBeEnabled({ timeout: 15_000 });
        await this.saveButton.click();
        await expect(this.unsavedChangesBar).toBeHidden({ timeout: 15_000 });

        await this.gotoEditById(id, name);
        return this.readExportIdentifier();
    }

    /** Control shape is unverified (checkbox, switch or select), so try each reading in turn. */
    async readConsiderEmployeeRate(): Promise<string> {
        const control = this.considerEmployeeRateControl.first();
        await control.waitFor({ state: 'attached', timeout: 15_000 });
        const aria = await control.getAttribute('aria-checked');
        if (aria !== null) return aria;
        return control.isChecked().then(String, () => control.innerText());
    }
}

export default JobPage;
