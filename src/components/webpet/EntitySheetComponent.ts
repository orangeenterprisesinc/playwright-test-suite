/**
 * @fileoverview The slide-over sheet that edits a parent record in place.
 *
 * Opened from a ParentPicker's pencil button, it hosts a full nested form —
 * which is what makes the combobox-inside-sheet case worth its own regression
 * test: a portaled combobox popup opening from inside a portaled sheet.
 *
 * @module components/webpet/EntitySheetComponent
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @class EntitySheetComponent
 * @extends BaseComponent
 */
export class EntitySheetComponent extends BaseComponent {
    constructor(page: Page) {
        super(page, page.locator('[data-slot="sheet-content"]'));
    }

    /** The sheet's title, e.g. `'Edit Ranch'`. */
    title(text: string): Locator {
        return this.root.getByText(text);
    }

    /**
     * The first combobox input inside the sheet.
     *
     * By position rather than by label deliberately: it is robust against the
     * label rendering as `"X"` versus `"X *"` and against the nested form's row
     * ordering, and the forms this is used against carry exactly one combobox.
     */
    get firstComboboxInput(): Locator {
        return this.root.locator('[data-slot="combobox-input"]').first();
    }
}

export default EntitySheetComponent;
