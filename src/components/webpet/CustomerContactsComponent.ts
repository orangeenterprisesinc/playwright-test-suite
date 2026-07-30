/**
 * @fileoverview The Customer form's Contacts section (PET-17).
 *
 * A customer carries contact rows of 15 types. E-mail (type=4) and Web page
 * (type=13) are schema-validated via `superRefine`; the phone-like types
 * validate format on new or changed values only (WEBPET-61).
 *
 * Two things about this section drive the shape below:
 *
 * - It is an **always-rendered** `<section id="contacts">`. The FormTabs above
 *   it are scroll-anchor navigation, not show/hide tabs, so there is nothing to
 *   open first and no visibility gate to wait on.
 * - The add-row Type control is a **shadcn Select, not a native `<select>`** —
 *   `selectOption()` does nothing. It has to be opened and the option clicked,
 *   and the option list renders in a portal *outside* this section, which is
 *   why {@link typeOption} is page-scoped while everything else is not.
 *
 * Inline validation messages are deferred (WEBPET-831), so the specs assert the
 * reliable signal instead: FormFooter keeps Save disabled while the form is
 * invalid. That assertion lives on the footer, not here.
 *
 * @module components/webpet/CustomerContactsComponent
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @class CustomerContactsComponent
 * @extends BaseComponent
 */
export class CustomerContactsComponent extends BaseComponent {
    /** The add-row's Type trigger (a shadcn Select). */
    readonly typeTrigger: Locator;
    /** The add-row's value field. */
    readonly valueInput: Locator;
    /** Appends the add-row to the contact list. Disabled while the value is empty. */
    readonly addButton: Locator;

    constructor(page: Page) {
        super(page, page.locator('section#contacts'));

        this.typeTrigger = this.root.getByRole('combobox');
        this.valueInput = this.root.getByPlaceholder('Enter value…');
        this.addButton = this.root.getByRole('button', { name: 'Add', exact: true });
    }

    /**
     * An option in the open Type list.
     *
     * Page-scoped because the list renders in a portal outside `section#contacts`
     * — scoping it to the root would resolve to nothing.
     */
    typeOption(label: string): Locator {
        return this.page.getByRole('option', { name: label, exact: true });
    }

    /** Open the Type select and choose `label`. */
    async selectType(label: string): Promise<void> {
        await this.typeTrigger.click();
        await this.typeOption(label).click();
    }

    /** Set the add-row's type and value, then append it. */
    async addContact(type: string, value: string): Promise<void> {
        await this.selectType(type);
        await this.valueInput.fill(value);
        await this.addButton.click();
    }
}

export default CustomerContactsComponent;
