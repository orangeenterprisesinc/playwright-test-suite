/**
 * @fileoverview Scan Device create/edit form — `/setup/scan-devices/{new,:id}`.
 *
 * ## A two-step create, by design
 *
 * The New form exposes the General section only. Crew assignment and Preferences
 * render solely on the Edit form (`isNew=false` **and** the device data loaded),
 * so creating a fully-configured device takes two saves. After the second (PUT)
 * the app navigates to the **list**, not back to the record — so the id has to be
 * read from the URL after save one.
 *
 * ## Three select-locating quirks, all load-bearing
 *
 * 1. **No id on the triggers.** The General section's two Selects are positional:
 *    `[0]` = Device Type, `[1]` = Connectivity Method. {@link generalSelect}
 *    encodes that, so the ordering assumption lives in one place.
 * 2. **`[data-open]`, not `data-state="open"`.** Base UI keeps closed portals
 *    mounted for exit animations, so an unscoped `[data-value="2"]` matches items
 *    in *both* the open dropdown and any stale closed one that happens to share
 *    the value. {@link openSelectOption} scopes to the open portal;
 *    {@link selectOption} does not. On the New form nothing is stale yet, so the
 *    unscoped form is correct there — the two are not interchangeable.
 * 3. **`waitForLoadState('networkidle')` is unusable on this form.** Four
 *    endpoints 403 and retry indefinitely, so the load state never settles. Wait
 *    for {@link preferencesSection} instead.
 *
 * Save is gated on `isSubmitting` only — there is no `isDirty` guard here, unlike
 * the setup forms modelled by `WebpetFormPage`.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class ScanDeviceFormPage extends BasePage {
    readonly pageUrl: string = '/setup/scan-devices';
    readonly pageTitle: string | RegExp = /.*/;

    // ── General (step 1) ────────────────────────────────────────────
    readonly generalSection: Locator;
    readonly nameInput: Locator;
    /** `nvarchar(3)` in the DB — three characters, no more. */
    readonly referencePrefixInput: Locator;
    readonly webMailAddressInput: Locator;

    // ── Step 2 sections ─────────────────────────────────────────────
    /** Renders only after the first save. The readiness signal for step 2. */
    readonly preferencesSection: Locator;
    readonly crewSection: Locator;
    /** The crew picker in the assignment tab — a combobox, then an explicit Add. */
    readonly crewCombobox: Locator;
    readonly crewAddButton: Locator;

    /** Submit. Disabled only while submitting — no dirty guard on this form. */
    readonly saveButton: Locator;

    constructor(page: Page) {
        super(page);

        this.generalSection = page.locator('section#general');
        this.nameInput = page.locator('input#name');
        this.referencePrefixInput = page.locator('input#referencePrefix');
        this.webMailAddressInput = page.locator('input#webMailAddress');

        this.preferencesSection = page.locator('section#preferences');
        this.crewSection = page.locator('section#crew');
        this.crewCombobox = this.crewSection.getByRole('combobox');
        this.crewAddButton = this.crewSection.getByRole('button', { name: 'Add' });

        this.saveButton = page.getByRole('button', { name: 'Save' });
    }

    /** Open the create form. Plain `goto`, matching the lifted spec. */
    async gotoNew(): Promise<void> {
        await this.page.goto(`${this.pageUrl}/new`);
    }

    /** A General-section Select trigger by position — see quirk 1. */
    generalSelect(index: number): Locator {
        return this.generalSection.locator('[data-slot="select-trigger"]').nth(index);
    }

    /** An option in any mounted Select portal, keyed by `data-value`. See quirk 2. */
    selectOption(value: string): Locator {
        return this.page.locator(`[data-slot="select-content"] [data-value="${value}"]`);
    }

    /** An option in the **open** Select portal only. Required on the Edit form — see quirk 2. */
    openSelectOption(value: string): Locator {
        return this.page.locator(`[data-slot="select-content"][data-open] [data-value="${value}"]`);
    }

    /**
     * A Preferences field's container, located from its `<label for>`.
     *
     * The Preferences Selects carry no id on the trigger, so the only stable route
     * is up from the label to the shared container. `.last()` picks the innermost
     * wrapping `div` — the outer ones match too.
     */
    preferenceField(fieldId: string): Locator {
        return this.page
            .locator('div')
            .filter({ has: this.page.locator(`label[for="${fieldId}"]`) })
            .last();
    }

    /** Scroll a Preferences field into view, open its Select, and pick `value`. */
    async choosePreference(fieldId: string, value: string): Promise<void> {
        const container = this.preferenceField(fieldId);
        await container.scrollIntoViewIfNeeded();
        await container.locator('[data-slot="select-trigger"]').click();
        await this.openSelectOption(value).click();
    }

    /** Pick a crew by `crewCounter` and click Add. */
    async addCrew(crewCounter: number | string): Promise<void> {
        await this.crewCombobox.click();
        await this.openSelectOption(String(crewCounter)).click();
        await this.crewAddButton.click();
    }
}

export default ScanDeviceFormPage;
