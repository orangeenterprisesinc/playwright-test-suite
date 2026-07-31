/**
 * @fileoverview Customer create/edit form — `/setup/customers/{new,:id}`.
 *
 * Two things set this screen apart from its peers:
 *
 * - **The narrowest read-only set of any setup form.** Only Name locks on edit;
 *   Code and Export Identifier stay editable. That is logged for SME review in
 *   OPEN_QUESTIONS.md (WEBPET-831), so the tests assert the current behaviour
 *   deliberately rather than the expected-by-analogy one — do not "fix" them to
 *   match Department or Crew.
 * - **A contacts sub-form**, modelled by {@link CustomerContactsComponent}.
 *
 * Like Employee, `activeCheckbox` is `input#active` (a native checkbox), not the
 * `#active` ActiveField Switch the traceability screens use.
 *
 * Export Identifier does not auto-populate from Name (GAP-033).
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';
import { ParentPickerComponent } from '../../../components/webpet/ParentPickerComponent';
import { CustomerContactsComponent } from '../../../components/webpet/CustomerContactsComponent';

/**
 * @extends WebpetFormPage
 */
export class CustomerFormPage extends WebpetFormPage {
    /** Stays editable after save, unlike Department's and Crew's. */
    readonly codeInput: Locator;
    /** A native checkbox on this screen, not the ActiveField Switch. */
    readonly activeCheckbox: Locator;
    /** Customer Type ParentPicker, combobox mode. Offers a "+ Create" footer. */
    readonly customerTypePicker: ParentPickerComponent;
    /**
     * State ParentPicker — **sheet** mode, displaying `shortName`.
     *
     * Not a combobox, and deliberately not createable: there is no
     * `POST /api/states`, and sheet mode has no "+ Create" affordance at all.
     */
    readonly statePicker: ParentPickerComponent;
    /** The always-rendered contacts sub-form. */
    readonly contacts: CustomerContactsComponent;
    /**
     * A plain text field on the General tab.
     *
     * Used to dirty the form without touching any dropdown state — which matters
     * for the concurrency test, where the point is the stale version, not the
     * field being edited.
     */
    readonly contactPersonInput: Locator;
    /**
     * Shown when the id in the URL does not resolve.
     *
     * Matches the bare `"Failed to load"` the lifted spec used rather than a
     * fuller sentence — narrowing it would be a behaviour change.
     */
    readonly notFoundMessage: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/customers', entity: 'Customer' });

        this.codeInput = page.locator('input#code');
        this.activeCheckbox = page.locator('input#active');
        this.customerTypePicker = new ParentPickerComponent(page, 'Customer Type');
        this.statePicker = new ParentPickerComponent(page, 'State');
        this.contacts = new CustomerContactsComponent(page);
        this.contactPersonInput = page.locator('input#contactPerson');
        this.notFoundMessage = page.locator('text=Failed to load');
    }
}

export default CustomerFormPage;
