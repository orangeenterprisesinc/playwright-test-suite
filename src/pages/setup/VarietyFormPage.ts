/**
 * @fileoverview Variety create/edit form — `/setup/varieties/{new,:id}`.
 *
 * The only Batch 2 screen whose ParentPicker is in **sheet mode**: Crop renders
 * as a base-ui `<Select>` trigger with a portaled option list, not a combobox
 * input. It also lost its `id` attribute, which is why the picker is located by
 * label rather than by selector.
 *
 * Two behaviours differ from the other setup forms:
 *
 * - **Two required fields.** Name alone does not enable Save; Crop is a required
 *   FK, so the form is invalid until both are set.
 * - **Export Identifier is composed**, `"<crop>,<name>"` rather than a copy of
 *   Name — and still only while the field is empty.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../webpet/WebpetFormPage';
import { ParentPickerComponent } from '../../components/webpet/ParentPickerComponent';

/**
 * @extends WebpetFormPage
 */
export class VarietyFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** Crop ParentPicker, **sheet mode** — a Select trigger, not a combobox input. */
    readonly cropPicker: ParentPickerComponent;
    /** Shown when the id in the URL does not resolve. */
    readonly notFoundMessage: Locator;
    /**
     * The 409 the API returns when a variety name repeats within one crop.
     * Uniqueness here is scoped to the parent crop, not global.
     */
    readonly duplicateForCropError: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/varieties', entity: 'Variety' });

        this.codeInput = page.locator('input#code');
        this.cropPicker = new ParentPickerComponent(page, 'Crop');
        this.notFoundMessage = page.locator('text=Variety not found.');
        this.duplicateForCropError = page.getByText(
            'A variety with this name already exists for the selected crop.',
        );
    }

    /** Choose a crop by its entity id, matching the legacy `selectOption(value)` semantics. */
    async selectCrop(cropId: number | string): Promise<void> {
        await this.cropPicker.selectSheetOption(String(cropId));
    }
}

export default VarietyFormPage;
