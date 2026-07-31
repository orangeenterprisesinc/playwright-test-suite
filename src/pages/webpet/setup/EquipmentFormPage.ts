/**
 * @fileoverview Equipment create/edit form — `/setup/equipments/{new,:id}`.
 *
 * Save on the create form is gated on an Equipment Type foreign key (schema
 * `superRefine`) as well as Name. Two tests that need to clear that gate are
 * skipped: selecting a combobox value does not currently register with the
 * form, so Save never enables (OPEN_QUESTIONS.md, WEBPET-831). The gating
 * itself is correct — it is the test-side selection that is unresolved, which
 * is why {@link pickEquipmentType} is kept here ready for the skip to lift.
 *
 * On the edit form the Equipment Type picker is **disabled** rather than
 * readonly — it is a combobox, not a text input, so `toBeDisabled()` is the
 * right assertion and `toHaveAttribute('readonly')` would never pass.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';
import { ParentPickerComponent } from '../../../components/webpet/ParentPickerComponent';

/**
 * @extends WebpetFormPage
 */
export class EquipmentFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** A native checkbox on this screen, not the ActiveField Switch. */
    readonly activeCheckbox: Locator;
    /** Editable on the edit form. */
    readonly hourlyCostInput: Locator;
    /** Required FK on create; disabled on edit. */
    readonly equipmentTypePicker: ParentPickerComponent;
    /**
     * Shown when the id in the URL does not resolve. The bare `"Failed to load"`
     * the lifted spec used.
     */
    readonly notFoundMessage: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/equipments', entity: 'Equipment' });

        this.codeInput = page.locator('input#code');
        this.activeCheckbox = page.locator('input#active');
        this.hourlyCostInput = page.locator('input#hourlyCost');
        this.equipmentTypePicker = new ParentPickerComponent(page, 'Equipment Type');
        this.notFoundMessage = page.locator('text=Failed to load');
    }

    /** Open the Equipment Type picker and choose the named type. */
    async pickEquipmentType(typeName: string): Promise<void> {
        await this.equipmentTypePicker.openCombobox();
        await this.equipmentTypePicker.comboboxItemByText(typeName).click();
    }
}

export default EquipmentFormPage;
