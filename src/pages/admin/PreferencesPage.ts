/**
 * @fileoverview Global Preferences — `/settings/preferences`
 * (File ▸ Administration ▸ Preferences).
 *
 * ## The screen is not tabbed
 *
 * It looks tabbed and the legacy WinForms dialog was, but the web port is a
 * single scrolling page: each group is a `<section class="scroll-mt-24">` with an
 * `<h2>`, and the left-hand list is a column of `<button>`s that scroll to one.
 * The URL never changes and **every field is in the DOM at once** (verified
 * 2026-09-16), so a field can be read or filled without "opening" its section.
 * {@link gotoSection} exists for the visual step and to scroll a control into
 * view, not because the fields are otherwise unreachable.
 *
 * That is also why this extends `BasePage` rather than `SetupScreenPage` — there
 * is no list, no New/Edit, and no row grid.
 *
 * ## Saving
 *
 * One Save button commits every section, so a save always PUTs the whole record.
 * A validation failure routes to the field via an inline `<p>` under the control's
 * `div.space-y-1` wrapper — the same shape as `ProfilePage.fieldError`.
 *
 * ## `assignRollsDaily` is deliberately absent
 *
 * There is no accessor for it. Ticking it false to true and confirming clears
 * `AlternateCode` from every Employee row in the tenant (WEBPET-1593), which would
 * destroy the Journey B fixtures. Adding one here would make that a single click
 * away; see `src/utils/api/preferencesApi.ts` for the same refusal on the API side.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** The section headings this page object knows how to scroll to. */
export type PreferencesSection = 'Pocket' | 'Traceability - Stickers';

/**
 * @extends BasePage
 */
export class PreferencesPage extends BasePage {
    readonly pageUrl: string = '/settings/preferences';
    readonly pageTitle: string | RegExp = /.*/;

    /** The single Save that commits every section. */
    readonly saveButton: Locator;
    /** Global toasts, asserted when a save is expected to succeed or fail. */
    readonly errorToasts: Locator;

    constructor(page: Page) {
        super(page);
        this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
        this.errorToasts = page.locator('[data-sonner-toast][data-type="error"]');
    }

    async gotoPreferences(): Promise<void> {
        await this.page.goto(this.pageUrl, { waitUntil: 'domcontentloaded' });
        await this.saveButton.waitFor({ state: 'visible' });
    }

    /**
     * The left-hand subnav entry for a section.
     *
     * Scoped to `button` because the same text appears again as the section's own
     * `<h2>`, which would otherwise be a strict-mode collision.
     */
    sectionLink(section: PreferencesSection): Locator {
        return this.page.getByRole('button', { name: section, exact: true });
    }

    /** The section's `<h2>` heading — the assertion target for "the section exists". */
    sectionHeading(section: PreferencesSection): Locator {
        return this.page.getByRole('heading', { name: section, exact: true });
    }

    /** Scroll a section into view. Fields are addressable either way — see the class note. */
    async gotoSection(section: PreferencesSection): Promise<void> {
        await this.sectionLink(section).click();
        await this.sectionHeading(section).scrollIntoViewIfNeeded();
    }

    /** Any preference control, by the field id the form binds. */
    field(fieldId: string): Locator {
        return this.page.locator(`#${fieldId}`);
    }

    /**
     * The inline validation message for a field.
     *
     * Goes through the shared `div.space-y-1` wrapper rather than a sibling
     * combinator: the Input component wraps the native input in its own `div`, so
     * `#field + p` never matches. Same shape as `ProfilePage.fieldError`.
     */
    fieldError(fieldId: string): Locator {
        return this.page
            .locator('div.space-y-1', { has: this.page.locator(`#${fieldId}`) })
            .locator('p');
    }

    /** Fill a numeric or text preference, replacing whatever is there. */
    async setValue(fieldId: string, value: string | number): Promise<void> {
        const input = this.field(fieldId);
        await input.scrollIntoViewIfNeeded();
        await input.fill(String(value));
    }

    /**
     * Choose an option in a base-ui Select by its **displayed label**.
     *
     * The trigger is a `button[role=combobox]`, and the listbox closes behind an
     * inert backdrop, so the option click is waited for rather than raced.
     */
    async choose(fieldId: string, label: string): Promise<void> {
        const trigger = this.field(fieldId);
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const option = this.page.getByRole('option', { name: label, exact: true });
        await option.waitFor({ state: 'visible' });
        await option.click();
        await option.waitFor({ state: 'hidden' });
    }

    /** Save every section and wait for the PUT to land. */
    async save(): Promise<number> {
        const response = this.page.waitForResponse(
            (res) => /\/preferences\b/.test(new URL(res.url()).pathname) && res.request().method() === 'PUT',
        );
        await this.saveButton.click();
        return (await response).status();
    }
}

export default PreferencesPage;
