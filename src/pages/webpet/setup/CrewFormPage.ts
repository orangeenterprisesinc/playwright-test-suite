/**
 * @fileoverview Crew create/edit form — `/setup/crews/{new,:id}`.
 *
 * The first converted screen with a ParentPicker: Department is a combobox-mode
 * picker, exposed here as a {@link ParentPickerComponent} so the spec never
 * touches `[data-slot="combobox-input"]` itself.
 *
 * On the edit form Name, Code and Export Identifier are readonly while Short
 * Name stays editable.
 *
 * @module pages/webpet/setup/CrewFormPage
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';
import { ParentPickerComponent } from '../../../components/webpet/ParentPickerComponent';

/**
 * @class CrewFormPage
 * @extends WebpetFormPage
 */
export class CrewFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** Editable on the edit form, unlike Name/Code/Export Identifier. */
    readonly shortNameInput: Locator;
    /** Department ParentPicker, combobox mode. */
    readonly departmentPicker: ParentPickerComponent;
    /** Default Ranch ParentPicker, **sheet** mode and nullable (`— None —`). */
    readonly defaultRanchPicker: ParentPickerComponent;
    /** Supervisor ParentPicker, combobox mode. */
    readonly supervisorPicker: ParentPickerComponent;
    /**
     * Default Field ParentPicker, combobox mode.
     *
     * Cascades off {@link defaultRanchPicker}: its options are filtered to the
     * selected ranch, and changing the ranch clears any selection.
     */
    readonly defaultFieldPicker: ParentPickerComponent;
    /** Default Job ParentPicker, combobox mode. */
    readonly defaultJobPicker: ParentPickerComponent;
    /** Shown when the id in the URL does not resolve. */
    readonly notFoundMessage: Locator;
    /**
     * The Department field's grid row, reached from its `<label for>`.
     *
     * Used only to scroll the pickers into view before a screenshot; the label's
     * parent is the row, and that relationship is the one stable handle.
     */
    readonly departmentRow: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/crews', entity: 'Crew' });

        this.codeInput = page.locator('input#code');
        this.shortNameInput = page.locator('input#shortName');
        this.departmentPicker = new ParentPickerComponent(page, 'Department');
        this.defaultRanchPicker = new ParentPickerComponent(page, 'Default Ranch');
        this.supervisorPicker = new ParentPickerComponent(page, 'Supervisor');
        this.defaultFieldPicker = new ParentPickerComponent(page, 'Default Field');
        this.defaultJobPicker = new ParentPickerComponent(page, 'Default Job');
        this.notFoundMessage = page.locator('text=Crew not found.');
        this.departmentRow = page.locator('label[for="departmentCounter"]').locator('..');
    }

    /**
     * The Default Ranch sheet trigger, **without** a `.first()` narrowing.
     *
     * Deliberately not `defaultRanchPicker.sheetTrigger`, which applies
     * `.first()`. The dirty-state spec queries the cell directly, so a duplicate
     * trigger would trip strict mode there and be silently swallowed here —
     * preserving the stricter form keeps that signal.
     */
    get defaultRanchTrigger(): Locator {
        return this.defaultRanchPicker.getRoot().locator('[data-slot="select-trigger"]');
    }

    /** A named option inside the open Department popup. */
    departmentOption(name: string): Locator {
        return this.departmentPicker.comboboxOptionByText(name);
    }

    /** Open the Department picker and filter it to `name`. */
    async filterDepartments(name: string): Promise<void> {
        await this.departmentPicker.filterCombobox(name);
    }
}

export default CrewFormPage;
