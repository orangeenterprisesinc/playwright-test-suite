/**
 * @fileoverview The grid column-filter DateRangePicker (`#filter-dateTimeIn`).
 *
 * Shared, not per-page: the Export v2 dispatch workspace and Reconcile Job Cards
 * both drive their preview fetch from the *same* control mounted in their grid's
 * column-filter row, and both do it by the same three-step sequence — open the
 * cell, pick a preset, Apply.
 *
 * ## Why the preset and Apply locators are page-scoped
 *
 * The root here is the trigger cell, but the preset list and the Apply button
 * live in a **portaled** popover that is not a DOM descendant of that cell.
 * Scoping them to `this.root` would match nothing — so they resolve against the
 * page, exactly as the lifted specs do. This is the one place in the web-pet
 * components where reaching past the root is correct rather than sloppy.
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @extends BaseComponent
 */
export class DateRangeFilterComponent extends BaseComponent {
    /**
     * The filter cell that opens the picker.
     *
     * An id selector rather than a testid because that is what the shared
     * DataGrid column filter emits — `filter-<columnKey>`.
     */
    readonly trigger: Locator;
    /**
     * Commits the picked range and fires the preview fetch.
     *
     * `/^Apply/i` rather than the exact string: the button's label carries a
     * trailing summary of the picked range, so an exact match never hits.
     */
    readonly applyButton: Locator;

    constructor(page: Page, columnKey: string = 'dateTimeIn') {
        super(page, `#filter-${columnKey}`);

        this.trigger = this.root;
        this.applyButton = page.getByRole('button', { name: /^Apply/i });
    }

    /** A named quick-range preset inside the open popover, e.g. `'Last 30 days'`. */
    preset(name: string): Locator {
        return this.page.getByRole('button', { name });
    }

    /** Open the picker, choose a preset, and Apply — the full three-step sequence. */
    async applyPreset(name: string): Promise<void> {
        await this.trigger.click();
        await this.preset(name).click();
        await this.applyButton.click();
    }
}

export default DateRangeFilterComponent;
