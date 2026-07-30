/**
 * @fileoverview Field create/edit form — `/setup/fields/{new,:id}`.
 *
 * The densest ParentPicker consumer in the app: thirteen pickers across
 * traceability, ownership and scheduling, in **both** modes. Which mode a field
 * uses is not guessable from its name, and getting it wrong yields a locator
 * that silently matches nothing — so the split is recorded here:
 *
 * - **Combobox** — Department, Colour, Grade, Size, Method, Region, Packaging
 *   Style, Overtime Rules, Variety, Pool
 * - **Sheet** — Ranch, Crop, State
 *
 * State in particular is a `SheetRegistration` displaying `shortName`; an
 * earlier version of the lifted spec drove it with combobox helpers and never
 * matched anything.
 *
 * Crop → Variety cascades: changing the crop refilters the variety list and
 * clears any selection.
 *
 * @module pages/webpet/setup/FieldFormPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';
import { ParentPickerComponent } from '../../../components/webpet/ParentPickerComponent';
import { EntitySheetComponent } from '../../../components/webpet/EntitySheetComponent';

/**
 * @class FieldFormPage
 * @extends WebpetFormPage
 */
export class FieldFormPage extends WebpetFormPage {
    // ── Sheet-mode pickers ──────────────────────────────────────────
    /** Owning ranch. Its pencil opens the ranch record in a sheet. */
    readonly ranchPicker: ParentPickerComponent;
    /** Crop. Drives the Variety cascade. */
    readonly cropPicker: ParentPickerComponent;
    /** State — a SheetRegistration displaying shortName, not a combobox. */
    readonly statePicker: ParentPickerComponent;

    // ── Combobox-mode pickers ───────────────────────────────────────
    readonly departmentPicker: ParentPickerComponent;
    readonly colorPicker: ParentPickerComponent;
    readonly gradePicker: ParentPickerComponent;
    readonly sizePicker: ParentPickerComponent;
    readonly methodPicker: ParentPickerComponent;
    readonly regionPicker: ParentPickerComponent;
    readonly packagingStylePicker: ParentPickerComponent;
    readonly overtimeRulesPicker: ParentPickerComponent;
    /** Filtered by the selected Crop; cleared when the crop changes. */
    readonly varietyPicker: ParentPickerComponent;
    readonly poolPicker: ParentPickerComponent;

    /** The slide-over that edits the selected parent record in place. */
    readonly editSheet: EntitySheetComponent;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/fields', entity: 'Field' });

        this.editSheet = new EntitySheetComponent(page);

        this.ranchPicker = new ParentPickerComponent(page, 'Ranch');
        this.cropPicker = new ParentPickerComponent(page, 'Crop');
        this.statePicker = new ParentPickerComponent(page, 'State');

        this.departmentPicker = new ParentPickerComponent(page, 'Department');
        this.colorPicker = new ParentPickerComponent(page, 'Color');
        this.gradePicker = new ParentPickerComponent(page, 'Grade');
        this.sizePicker = new ParentPickerComponent(page, 'Size');
        this.methodPicker = new ParentPickerComponent(page, 'Method');
        this.regionPicker = new ParentPickerComponent(page, 'Region');
        this.packagingStylePicker = new ParentPickerComponent(page, 'Packaging Style');
        this.overtimeRulesPicker = new ParentPickerComponent(page, 'Overtime Rules');
        this.varietyPicker = new ParentPickerComponent(page, 'Variety');
        this.poolPicker = new ParentPickerComponent(page, 'Pool');
    }

    /** The traceability pickers asserted together as a group, in spec order. */
    get traceabilityPickers(): ParentPickerComponent[] {
        return [
            this.colorPicker,
            this.gradePicker,
            this.sizePicker,
            this.methodPicker,
            this.regionPicker,
            this.packagingStylePicker,
        ];
    }

    /** The pencil beside the Ranch picker, which opens the ranch edit sheet. */
    get editRanchButton(): Locator {
        return this.ranchPicker.editEntityButton('Edit Ranch');
    }
}

export default FieldFormPage;
