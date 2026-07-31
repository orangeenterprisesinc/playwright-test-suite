/**
 * @fileoverview The web-pet app's ParentPicker control, as a scoped component.
 *
 * ParentPicker renders in one of two modes, neither of which is a native form
 * control — so `.selectOption()` and `.locator('option')` do not work on either:
 *
 * 1. **Sheet mode** — a base-ui `<Select>` (shadcn-wrapped): a trigger
 *    `<button data-slot="select-trigger">` whose options live in a *portaled*
 *    popup `<div data-slot="select-content">`, rendered as
 *    `<div data-slot="select-item" data-value="…">`.
 * 2. **Combobox mode** — a base-ui `<Combobox>`: a native
 *    `<input data-slot="combobox-input">` beside a portaled
 *    `<div data-slot="combobox-popup">`. The input accepts `.fill()` and value
 *    assertions, but selection happens by clicking inside the popup.
 *
 * In both modes the `<Label>` is a sibling of the picker inside a shared grid
 * cell (`div.space-y-1`), which is why the cell — not the control — is the
 * component root.
 *
 * ## Root scoping
 *
 * `BaseComponent` takes a *fixed* root, while a picker's root is derived from
 * its label. Resolved by constructing one component **per picker**:
 * `new ParentPickerComponent(page, 'Crop')` computes the cell locator and hands
 * it to `super()` via the `Locator` overload. Locators stay lazy (a Playwright
 * `Locator` resolves at use, not at construction), so building one in a page
 * object's constructor costs nothing and needs no `await`.
 *
 * Every selector here is relocated verbatim from the lifted
 * `tests/webpet/parent-picker-helpers.ts` — deliberately not "improved", since
 * the suite is accepted by diffing against a per-test baseline and a better
 * selector is indistinguishable from a regression.
 */
import { Locator, Page, expect } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * Builds the locator for a picker's grid cell.
 *
 * Standalone because it has to run *before* `super()` — a constructor cannot
 * touch `this` beforehand.
 *
 * The cell is `<div class="col-span-12 … space-y-1">` containing the `<Label>`
 * and then the picker. Required fields render their label as `"X *"`, optional
 * ones as `"X"`; the regex matches either.
 */
function pickerCellLocator(page: Page, labelText: string): Locator {
    const labelRe = new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\*)?$`);
    return page
        .locator('div.space-y-1')
        .filter({ has: page.locator('label').filter({ hasText: labelRe }) });
}

/**
 * One ParentPicker control, scoped to the grid cell carrying `labelText`.
 *
 * @extends BaseComponent
 */
export class ParentPickerComponent extends BaseComponent {
    /** The label this picker was located by — used in log messages. */
    readonly labelText: string;

    // ── Combobox mode ───────────────────────────────────────────────
    /** The native `<input>`; accepts `.fill()` and `toHaveValue()`. */
    readonly comboboxInput: Locator;
    /** The portaled results popup. Page-scoped: portals render outside the cell. */
    readonly comboboxPopup: Locator;

    // ── Sheet mode ──────────────────────────────────────────────────
    /** The trigger `<button>` — NOT a native `<select>`. */
    readonly sheetTrigger: Locator;
    /** The portaled options popup. Page-scoped, as above. */
    readonly sheetContent: Locator;
    /** The trigger's visible text — what is shown once an option is chosen. */
    readonly sheetValue: Locator;

    constructor(page: Page, labelText: string) {
        super(page, pickerCellLocator(page, labelText));
        this.labelText = labelText;

        this.comboboxInput = this.root.locator('[data-slot="combobox-input"]').first();
        this.sheetTrigger = this.root.locator('[data-slot="select-trigger"]').first();
        this.sheetValue = this.sheetTrigger.locator('[data-slot="select-value"]');

        // Portaled popups are appended at the document root, outside this
        // component's cell — so they are page-scoped by necessity, not oversight.
        this.comboboxPopup = page.locator('[data-slot="combobox-popup"]');
        this.sheetContent = page.locator('[data-slot="select-content"]');
    }

    /**
     * The X button that clears a combobox selection.
     *
     * Cell-scoped, and **the** "set to none" affordance in combobox mode — there
     * is no `— None —` list item. That idiom belongs to sheet mode, and several
     * lifted tests carried stale assertions for it. Only rendered once a value
     * is selected.
     */
    get comboboxClear(): Locator {
        return this.root.locator('[data-slot="combobox-clear"]');
    }

    /** Every option currently listed in the open combobox popup. */
    get comboboxItems(): Locator {
        return this.comboboxPopup.locator('[data-slot="combobox-item"]');
    }

    /**
     * The popup's "+ Create" footer for a specific name.
     *
     * Only rendered for pickers that register a `useCreateFromName` handler, and
     * only when the typed name matches nothing — which makes its presence and
     * its absence both meaningful assertions.
     */
    createOption(name: string): Locator {
        return this.comboboxPopup.getByRole('button', { name: `Create "${name}"` });
    }

    /** Any "+ Create" footer, for asserting a picker offers none at all. */
    get anyCreateOption(): Locator {
        return this.comboboxPopup.getByRole('button', { name: /^Create "/ });
    }

    /** A combobox option by its ARIA role and exact accessible name. */
    comboboxOptionByRole(name: string): Locator {
        return this.comboboxPopup.getByRole('option', { name, exact: true });
    }

    /** Option row inside the sheet popup, matched on the entity id it carries. */
    sheetOption(value: string): Locator {
        return this.page.locator(`[data-slot="select-item"][data-value="${value}"]`).first();
    }

    /**
     * Real sheet options — everything except the `__none__` sentinel.
     *
     * The sentinel is present but `aria-hidden` on nullable pickers, so counting
     * raw items would report a choice the user cannot make.
     */
    get sheetItemsExcludingNone(): Locator {
        return this.sheetContent.locator(
            '[data-slot="select-item"]:not([data-value="__none__"])',
        );
    }

    /** Real sheet options other than `value` — for picking "a different one". */
    sheetItemsExcluding(value: string): Locator {
        return this.sheetContent.locator(
            `[data-slot="select-item"]:not([data-value="${value}"]):not([data-value="__none__"])`,
        );
    }

    /**
     * The pencil button beside a picker that opens the parent record in a sheet,
     * e.g. `editEntityButton('Edit Ranch')`. Enabled only once a value is chosen.
     */
    editEntityButton(name: string): Locator {
        return this.root.getByRole('button', { name });
    }

    /**
     * Option row matched on its visible text instead of its id.
     *
     * Scoped to the popup, not the page: once an option is chosen its label is
     * also rendered in the trigger, so a page-wide text match would pass
     * without the list ever having been populated — which is exactly what the
     * "dropdown is populated from the database" tests exist to prove.
     */
    sheetOptionByText(text: string): Locator {
        return this.sheetContent.locator('[data-slot="select-item"]', { hasText: text });
    }

    /**
     * Option row in the combobox popup, matched on visible text. Popup-scoped
     * for the same reason as {@link sheetOptionByText}.
     */
    comboboxOptionByText(text: string): Locator {
        return this.comboboxPopup.getByText(text);
    }

    /**
     * Option matched on its **exact** text.
     *
     * Distinct from {@link comboboxOptionByText}, which is a substring match.
     * Needed where a shorter option name is a prefix of a longer one in the same
     * list — the substring form would resolve to both and trip strict mode.
     */
    comboboxOptionByExactText(text: string): Locator {
        return this.comboboxPopup.getByText(text, { exact: true });
    }

    /**
     * A combobox option addressed by its `combobox-item` slot rather than by
     * text inside the popup.
     *
     * Page-scoped: the item list is portaled. Distinct from
     * {@link comboboxOptionByText} because a `getByText` match inside the popup
     * can resolve to a text node that is not itself clickable — clicking the
     * item element is what actually registers the selection with the form.
     */
    comboboxItemByText(text: string): Locator {
        return this.page.locator('[data-slot="combobox-item"]', { hasText: text }).first();
    }

    /** Open the combobox and type `text` to filter its list. */
    async filterCombobox(text: string): Promise<void> {
        await this.openCombobox();
        await this.comboboxInput.fill(text);
    }

    /**
     * A combobox option by position.
     *
     * Position rather than text where the test only needs *a different* value —
     * e.g. proving a picker marks its field dirty, where which option is chosen
     * is irrelevant as long as it differs from the current one.
     */
    comboboxItemAt(index: number): Locator {
        return this.page.locator('[data-slot="combobox-item"]').nth(index);
    }

    /**
     * The first sheet option that is **not** currently selected.
     *
     * Re-picking the current value does not dirty the field, and a nullable
     * picker's `— None —` default is rendered `aria-hidden` and is not reliably
     * clickable — so "any option other than the selected one" is the only safe
     * target for a dirty-state test.
     */
    get sheetOptionUnselected(): Locator {
        return this.sheetContent.locator('[role="option"]:not([aria-selected="true"])').first();
    }

    /** Click the combobox input and wait for its popup to render. */
    async openCombobox(): Promise<void> {
        await this.comboboxInput.click();
        await expect(this.comboboxPopup).toBeVisible();
    }

    /** Click the sheet trigger and wait for the portaled content to appear. */
    async openSheet(): Promise<void> {
        await this.sheetTrigger.click();
        await expect(this.sheetContent).toBeVisible();
    }

    /**
     * Open the sheet and click the option whose `value` prop equals `value`,
     * matching the legacy `.selectOption(value)` semantics where tests pass
     * entity ids like `'5'`. Waits for the portal to close so subsequent
     * locators are stable.
     */
    async selectSheetOption(value: string): Promise<void> {
        await this.openSheet();
        await this.sheetOption(value).click();
        await expect(this.sheetContent).toBeHidden();
    }
}

export default ParentPickerComponent;
