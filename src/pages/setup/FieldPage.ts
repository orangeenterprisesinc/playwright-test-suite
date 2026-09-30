/**
 * Setup ▸ Field (`/setup/fields`).
 *
 * The awkward screen of the set. Only `Ranch *` and `Name *` are marked required, but
 * the form's schema requires six: Area, Flow Rate, Flow Rate Unit and Irrigation
 * Efficiency gate Save too, with no asterisk, no inline error, nothing `aria-invalid`
 * and no error-summary chip — the sole signal is the disabled-Save tooltip "Fix errors
 * to save" (measured live 2026-09-30, see test-plans/ui-first/page-objects-setup.md).
 * That is a candidate product bug; until it is settled, `createField` fills all six and
 * `IRRIGATION_DEFAULTS` is the one place to change when it is.
 *
 * Ranch, Crop and State are base-ui **Selects** — button triggers with no filter, Ranch
 * listing the whole tenant's 13 ranches. Note `#overTimeRulesCounter` here carries a
 * capital T; the Job form spells the same field with a lower-case one.
 */
import { Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface NewFieldData {
    name: string;
    code: string;
    /** Ranch name as the picker lists it. */
    ranch: string;
    crop?: string;
    state?: string;
}

/**
 * Values for the four fields the form requires without saying so. They carry no
 * fixture meaning — a journey never asserts on a field's irrigation — so they exist
 * only to get past the gate.
 */
const IRRIGATION_DEFAULTS = { area: '1', flowRate: '1', flowRateUnit: 'GPM', efficiency: '100' };

export class FieldPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly codeInput: Locator;
    readonly ranchSelect: Locator;
    readonly cropSelect: Locator;
    readonly stateSelect: Locator;
    readonly areaInput: Locator;
    readonly flowRateInput: Locator;
    readonly flowRateUnitSelect: Locator;
    readonly irrigationEfficiencyInput: Locator;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/fields',
            gridName: 'Fields',
            entity: 'Field',
            menuPath: ['Setup', 'Field'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update) field/i,
        });
        this.nameInput = page.locator('#name');
        this.codeInput = page.locator('#code');
        this.ranchSelect = page.locator('#ranchCounter');
        this.cropSelect = page.locator('#cropCounter');
        this.stateSelect = page.locator('#stateCounter');
        this.areaInput = page.locator('#area');
        this.flowRateInput = page.locator('#flowRate');
        // The only picker on these screens with no stable id — addressed by its label.
        this.flowRateUnitSelect = page.getByRole('combobox', { name: 'Flow Rate Unit' });
        this.irrigationEfficiencyInput = page.locator('#percentIrrigationEfficiency');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async selectRanch(ranch: string): Promise<void> {
        await this.pickers.pickSelect(this.ranchSelect, ranch);
    }

    async fillForm(data: NewFieldData): Promise<void> {
        await this.assertCodeEditable(this.codeInput);
        await this.selectRanch(data.ranch);
        if (data.crop) await this.pickers.pickSelect(this.cropSelect, data.crop);
        if (data.state) await this.pickers.pickSelect(this.stateSelect, data.state);

        // The four unmarked requirements.
        await this.areaInput.fill(IRRIGATION_DEFAULTS.area);
        await this.flowRateInput.fill(IRRIGATION_DEFAULTS.flowRate);
        await this.pickers.pickSelect(this.flowRateUnitSelect, IRRIGATION_DEFAULTS.flowRateUnit);
        await this.irrigationEfficiencyInput.fill(IRRIGATION_DEFAULTS.efficiency);

        await this.codeInput.fill(data.code);
        // Name last: whole-form validity only recomputes when a text input blurs, and
        // the base blurs Name after this returns.
        await this.nameInput.fill(data.name);
    }

    async createField(data: NewFieldData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }
}

export default FieldPage;
