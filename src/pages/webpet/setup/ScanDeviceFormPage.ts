/**
 * @fileoverview Scan Device create/edit form — `/setup/scan-devices/{new,:id}`.
 *
 * ## A two-step create, by design
 *
 * The New form exposes the General section only. Crew assignment and Preferences
 * render solely on the Edit form (`isNew=false` **and** the device data loaded),
 * so creating a fully-configured device takes two saves. After the second (PUT)
 * the app navigates to the **list**, not back to the record.
 *
 * The id comes from the create **response**, not from the post-save URL — see
 * {@link ScanDeviceFormPage.saveNewAndReturnId}.
 *
 * ## Four option-locating quirks, all load-bearing
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
 * 3. **The Crew picker is a Combobox, not a Select.** Everything else on this
 *    form is a Select (`select-content` / `select-item`), but Crew renders a
 *    Base UI Combobox — `<input role="combobox" id="add-Crew">` over a
 *    `combobox-popup` / `combobox-item` portal. `select-content` never exists on
 *    this page while the Crew list is open, so a Select-shaped matcher there does
 *    not fail fast, it waits out the whole test timeout.
 *    {@link openComboboxOption} is the Crew equivalent of {@link openSelectOption}.
 * 4. **`waitForLoadState('networkidle')` is unusable on this form.** Four
 *    endpoints 403 and retry indefinitely, so the load state never settles. Wait
 *    for {@link preferencesSection} instead.
 *
 * The same background retries also keep the Preferences/Crew area remounting
 * for a few seconds after {@link preferencesSection} first appears — long enough
 * that a `scrollIntoViewIfNeeded()` can resolve an element that detaches before
 * the scroll completes ("Element is not attached to the DOM"). {@link choosePreference}
 * retries its scroll+open as a unit rather than assuming one wait is enough.
 *
 * Save is gated on `isSubmitting` only — there is no `isDirty` guard here, unlike
 * the setup forms modelled by `WebpetFormPage`.
 */
import { expect, Locator, Page } from '@playwright/test';
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

    /** An option in the **open** Combobox portal only — the Crew picker. See quirk 3. */
    openComboboxOption(value: string): Locator {
        return this.page.locator(`[data-slot="combobox-popup"][data-open] [data-value="${value}"]`);
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

    /**
     * Scroll a Preferences field into view, open its Select, and pick `value`.
     *
     * Retries the scroll+open as a unit — see the class doc — because the
     * section can still be remounting when this runs, detaching the container
     * mid-scroll rather than failing to resolve it in the first place.
     */
    async choosePreference(fieldId: string, value: string): Promise<void> {
        await expect(async () => {
            const container = this.preferenceField(fieldId);
            await container.scrollIntoViewIfNeeded();
            await container.locator('[data-slot="select-trigger"]').click();
        }).toPass();
        await this.openSelectOption(value).click();
    }

    /**
     * Scroll the crew section into view. Retries as a unit — see the class doc.
     */
    async scrollToCrewSection(): Promise<void> {
        await expect(async () => {
            await this.crewSection.scrollIntoViewIfNeeded();
        }).toPass();
    }

    /** Pick a crew by `crewCounter` and click Add. */
    /**
     * Submit the New form and return the created device id, read from the POST.
     *
     * Deliberately not `page.waitForURL(/scan-devices\/\d+/)`: dev's scan-device save
     * double-fires and its post-save redirect is unreliable, so waiting on the URL hung
     * the whole spec for 60s naming no element — and a rejected create (a 409 on the
     * unfiltered `ScanDevice_Name_Unique`, say) looked identical to a redirect that
     * merely did not happen. Same idiom save two already uses for its PUT, and it names
     * the failure: the response body is surfaced on a non-2xx.
     */
    async saveNewAndReturnId(): Promise<number> {
        const [response] = await Promise.all([
            this.page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    /\/api\/scan-devices\/?$/.test(new URL(res.url()).pathname),
                { timeout: 30_000 },
            ),
            this.saveButton.click(),
        ]);

        if (!response.ok()) {
            throw new Error(
                `POST /api/scan-devices returned ${String(response.status())}: ` +
                    `${(await response.text()).slice(0, 300)}`,
            );
        }

        const { deviceCounter } = (await response.json()) as { deviceCounter?: number };
        if (!deviceCounter) {
            throw new Error('POST /api/scan-devices response carried no deviceCounter');
        }
        return deviceCounter;
    }

    async addCrew(crewCounter: number | string): Promise<void> {
        await this.crewCombobox.click();
        const option = this.openComboboxOption(String(crewCounter));
        // Bounded, so a future widget swap fails here in seconds naming the crew,
        // instead of a bare click() waiting out this spec's 300s timeout.
        await option.waitFor({ state: 'visible', timeout: 15_000 });
        await option.click();
        await this.crewAddButton.click();
    }
}

export default ScanDeviceFormPage;
