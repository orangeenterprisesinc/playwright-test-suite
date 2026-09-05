/**
 * @fileoverview Shared base for every web-pet form screen
 * (`/setup/<entity>/new`, `/setup/<entity>/:id`).
 *
 * A **sibling** of `src/pages/SetupScreenPage.ts`, not a subclass. That class
 * models the journey suite's screens and contradicts web-pet on six of its
 * seven behaviours — the full table is in `src/pages/webpet/README.md`. Two are
 * worth repeating because they fail *silently* rather than loudly:
 *
 * - `SetupScreenPage.saveEdit()` waits for an "Unsaved changes" bar to hide.
 *   Web-pet has no such bar, so `toBeHidden()` on an element that never rendered
 *   passes vacuously — the assertion would look green while checking nothing.
 * - `SetupScreenPage.submitForm()` chains two 15 s `toPass` windows. 30 s is
 *   exactly the `webpet` project's test timeout, so a rejection path could never
 *   complete.
 *
 * What this base encodes instead is the contract the ~20 lifted form specs
 * actually share:
 *
 * - Save is gated on `isDirty && isValid` (PET-450) and validation runs on
 *   **blur**, so a fill must be followed by a blur before Save means anything.
 * - Cancel relabels to "Discard changes" when dirty; clicking it raises the
 *   unsaved-changes guard whose abandon button is "Don't Save".
 * - Uniqueness is checked on blur via `/api/validation/unique`, so a duplicate
 *   surfaces as an inline field error with Save left disabled — on several
 *   screens the form never submits at all.
 * - Navigation is by URL. No web-pet spec walks the sidebar.
 */
import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { FormFooterComponent } from '../../components/webpet/FormFooterComponent';
import { UnsavedChangesModal } from '../../components/webpet/UnsavedChangesModal';

/** How a concrete form screen identifies itself. */
export interface WebpetFormConfig {
    /** Relative list URL, e.g. `'/setup/crops'`. The form lives beneath it. */
    listUrl: string;
    /** Singular entity name, used only in log messages. */
    entity: string;
}

/**
 * What happened when a form was submitted.
 *
 * - `'created'` — the app navigated to the new record's edit page
 * - `'rejected'` — the form stayed put (validation, or a server 409)
 */
export type WebpetFormOutcome = 'created' | 'rejected';

/**
 * @abstract
 * @extends BasePage
 */
export abstract class WebpetFormPage extends BasePage {
    protected readonly config: WebpetFormConfig;

    readonly pageUrl: string;
    /** Title assertion is unused on these screens; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    /** Save / Cancel / Discard changes / error summary. */
    readonly footer: FormFooterComponent;
    /** The navigation guard raised when leaving a dirty form. */
    readonly unsavedChanges: UnsavedChangesModal;

    /**
     * The blur-time uniqueness error. Both wordings occur across screens — the
     * generic "Already in use" and the per-entity "A crop with this name already
     * exists." — so the base matches either and screens may narrow it.
     */
    readonly duplicateError: Locator;
    /**
     * The shared ConcurrencyErrorBanner (PET-64).
     *
     * Every edit form pairs this banner with `meta.suppressStatuses: [409]`, so a
     * stale-version save renders inline UI **instead of** a toast. Both halves are
     * asserted together: banner present, error toasts absent.
     */
    readonly concurrencyBanner: Locator;
    /**
     * The "Duplicate Record" header action, present only once a record exists.
     * Lives here rather than on one entity's page: every setup edit header
     * renders it (WEBPET-2612/2617), Job Group is just the first spec to use it.
     */
    readonly duplicateRecordButton: Locator;

    // ── Fields every setup form carries ─────────────────────────────
    // Declared here rather than repeated on each screen: Name, Export
    // Identifier and the Active switch appear on all of them with identical
    // selectors, and the blur-to-auto-populate contract between the first two is
    // a property of the shared form component, not of any one entity.
    /** Required on every screen. Blurring it validates AND auto-populates Export Identifier. */
    readonly nameInput: Locator;
    /** Auto-populated from Name on blur, but only while empty. */
    readonly exportIdentifierInput: Locator;
    /** Migrated off a native `<select>` to an ActiveField Switch. */
    readonly activeSwitch: Locator;

    constructor(page: Page, config: WebpetFormConfig) {
        super(page);
        this.config = config;
        this.pageUrl = config.listUrl;

        this.footer = new FormFooterComponent(page);
        this.unsavedChanges = new UnsavedChangesModal(page);
        this.duplicateError = page.getByText(/Already in use|already exists/i);
        this.concurrencyBanner = page.getByTestId('concurrency-banner');
        this.duplicateRecordButton = page.getByRole('button', { name: 'Duplicate Record' });

        this.nameInput = page.locator('input#name');
        this.exportIdentifierInput = page.locator('input#exportIdentifier');
        this.activeSwitch = page.locator('#active');
    }

    /** The form is interactive once Name has rendered. Screens may override. */
    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    // ── Field primitives (PET-16 dirty/error contract) ──────────────
    //
    // Every primitive inside a FormProvider auto-renders `data-dirty="true"`
    // when dirty and `aria-invalid="true"` when invalid, driven by
    // `useFieldFormState(name)`.
    //
    // base-ui **splits** Switch and Checkbox: `id="<field>"` lands on a hidden
    // `<input>`, while the visible control gets its own generated id and carries
    // the state attributes. So `#<field>` finds the wrong element and a `:has()`
    // on it finds nothing — the stable link is `aria-labelledby` pointing at the
    // field label's id. That is why these are helpers rather than plain ids.

    /**
     * The `<form>` element itself.
     *
     * A coarser readiness signal than {@link firstFormField}: the screenshot
     * specs wait for the form to exist before capturing, without caring which
     * field renders first.
     */
    get formRoot(): Locator {
        return this.page.locator('form');
    }

    /** Wait for the `<form>` to exist. */
    async waitForFormRoot(): Promise<void> {
        await this.formRoot.first().waitFor();
    }

    /** Every switch on the form — used to assert a Select→Switch migration count. */
    get switches(): Locator {
        return this.page.locator('[data-slot="switch"]');
    }

    /** The *visible* switch for `fieldName`, not its hidden input. */
    switchFor(fieldName: string): Locator {
        return this.page.locator(`[data-slot="switch"][aria-labelledby="${fieldName}-label"]`);
    }

    /** The *visible* checkbox for `fieldName`, not its hidden input. */
    checkboxFor(fieldName: string): Locator {
        return this.page.locator(`[data-slot="checkbox"][aria-labelledby="${fieldName}-label"]`);
    }

    /** A field's visible label text. */
    fieldLabel(text: string): Locator {
        return this.page.getByText(text, { exact: true });
    }

    /** A FormTabs scroll-anchor tab, e.g. `'Crops'`. */
    formTab(name: string): Locator {
        return this.page.getByRole('button', { name });
    }

    /**
     * The first sheet-mode Select trigger on the page.
     *
     * Used for a tab's add-row control, which has no stable id or label of its
     * own — position is the only handle the lifted spec had.
     */
    get firstSelectTrigger(): Locator {
        return this.page.locator('[data-slot="select-trigger"]').first();
    }

    /**
     * A ColorPickerInput's PopoverTrigger, scoped by its neighbouring label.
     *
     * The trigger is an unlabelled `<button>`, so the surrounding grid cell —
     * the same `div.space-y-1` a ParentPicker uses — is the only way in.
     */
    colorPickerTrigger(labelText: string): Locator {
        return this.page
            .locator('div.space-y-1')
            .filter({ has: this.page.getByText(labelText, { exact: true }) })
            .locator('button')
            .first();
    }

    /** The preset swatches in an open colour popover; each is titled with its hex. */
    get colorSwatches(): Locator {
        return this.page.locator('button[title^="#"]');
    }

    /**
     * Options in an open sheet-mode Select, excluding the ones the component
     * keeps mounted but hidden.
     *
     * The `:not(.hidden)` filter is the point: at mobile widths the form's tab
     * strip collapses into a Select whose full option set stays in the DOM, so
     * an unfiltered count would include entries the user cannot see.
     */
    get visibleSelectItems(): Locator {
        return this.page.locator('[data-slot="select-item"]:not(.hidden)');
    }

    /** Fill Name and blur — the blur is what runs validation and auto-populate. */
    async fillName(name: string): Promise<void> {
        await this.fillAndBlur(this.nameInput, name);
    }

    /** `<listUrl>/new`, query string optional. */
    protected get newUrlPattern(): RegExp {
        return new RegExp(`${this.config.listUrl.replace(/\//g, '\\/')}\\/new(\\?|$)`);
    }

    /** `<listUrl>/<id>`, query string optional. */
    protected get editUrlPattern(): RegExp {
        return new RegExp(`${this.config.listUrl.replace(/\//g, '\\/')}\\/\\d+(\\?|$)`);
    }

    // ── Navigation ──────────────────────────────────────────────────

    /**
     * Open the blank create form.
     *
     * Deliberately a bare `goto` with **no** readiness wait. Adding one would be
     * an extra action the lifted specs never performed, and several of them
     * assert on the footer's initial state — a wait for the first field to
     * render could let the form settle before that assertion runs, quietly
     * changing what the test proves. Call {@link waitForForm} where a wait is
     * genuinely wanted.
     */
    async gotoNew(): Promise<void> {
        await this.page.goto(`${this.config.listUrl}/new`);
    }

    /** Wait for the form to be interactive. Opt-in — see {@link gotoNew}. */
    async waitForForm(): Promise<void> {
        await this.firstFormField.waitFor({ state: 'visible' });
    }

    /** Open an existing record's form by id. */
    async gotoEdit(id: number | string): Promise<void> {
        await this.page.goto(`${this.config.listUrl}/${String(id)}`);
    }

    /** Return to the list, whatever the current URL. */
    async gotoList(): Promise<void> {
        await this.page.goto(this.config.listUrl);
    }

    // ── Saving ──────────────────────────────────────────────────────

    /**
     * Fill a field and blur it, which is the only way the form validates.
     *
     * Every `fill*` method on a concrete screen should go through this, because
     * "filled but not blurred" leaves Save disabled and reads exactly like a
     * validation failure.
     */
    protected async fillAndBlur(field: Locator, value: string): Promise<void> {
        await field.fill(value);
        await field.blur();
    }

    /**
     * Submit and resolve to what the app did.
     *
     * Deliberately does NOT force a blur: several screens rely on the caller
     * having blurred a specific field, and blurring here would fire an extra
     * uniqueness check the lifted specs never triggered.
     */
    async submit(): Promise<WebpetFormOutcome> {
        await expect(this.footer.saveButton).toBeEnabled();
        await this.footer.saveButton.click();

        await expect(async () => {
            const created = this.editUrlPattern.test(this.page.url());
            const rejected = await this.duplicateError.isVisible();
            expect(created || rejected).toBeTruthy();
        }).toPass();

        return this.editUrlPattern.test(this.page.url()) ? 'created' : 'rejected';
    }

    /**
     * Leave a dirty form without saving: click "Discard changes", then "Don't
     * Save" in the guard.
     */
    async discardChanges(): Promise<void> {
        await this.footer.discardChangesButton.click();
        await this.unsavedChanges.discard();
    }

}

export default WebpetFormPage;
