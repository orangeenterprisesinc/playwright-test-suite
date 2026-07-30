/**
 * @fileoverview The web-pet form footer — the Save/Cancel bar on every
 * `/setup/<entity>/{new,:id}` screen.
 *
 * Worth its own component because its behaviour is genuinely non-obvious and is
 * re-asserted in ~20 specs:
 *
 * - **Save is disabled until `isDirty && isValid`** (PET-450), and validation
 *   runs on **blur**, not on input — so the last field edited must be blurred
 *   before Save is inspected at all. A test that fills a field and immediately
 *   reads Save's state is testing the debounce, not the form.
 * - **Cancel relabels to "Discard changes" once the form is dirty.** Both
 *   labels are the same button; which one is present is itself the dirty signal,
 *   and clicking the dirty one raises the unsaved-changes guard.
 * - A failed submit surfaces an **"N error"** summary trigger next to Save.
 *
 * Scoped to the page rather than a footer root: the lifted specs address these
 * controls page-wide (`page.getByRole('button', { name: 'Save' })`), and there
 * is only ever one form on screen. Narrowing the root would change which
 * element resolves — a behaviour change this migration must not make.
 *
 * @module components/webpet/FormFooterComponent
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @class FormFooterComponent
 * @extends BaseComponent
 */
export class FormFooterComponent extends BaseComponent {
    /**
     * Enabled only once the form is dirty AND valid.
     *
     * Substring match, which is what most screens want. **Three matchers for this
     * one control exist across the suite and they are not interchangeable:**
     *
     * - this one — substring `'Save'`; the common case
     * - {@link saveButtonExact} — `exact: true`; needed where the
     *   unsaved-changes modal may also be mounted, since substring `'Save'` also
     *   matches its "Don't Save" and would trip strict mode
     * - `RanchFormPage.saveButton` — `/^Save/`; that screen's label carries a
     *   suffix, so an exact match would find nothing
     *
     * Do not consolidate them.
     */
    readonly saveButton: Locator;
    /** Save, matched exactly — see {@link saveButton} for when that matters. */
    readonly saveButtonExact: Locator;
    /** Present while the form is pristine. */
    readonly cancelButton: Locator;
    /** Replaces Cancel once the form is dirty. */
    readonly discardChangesButton: Locator;
    /** The "N error ▾" summary trigger shown when validation fails. */
    readonly errorSummaryButton: Locator;
    /**
     * The form's submit control, addressed by type rather than by label.
     *
     * Not a synonym for {@link saveButton}: the duplicate-name specs click this
     * and then assert on `saveButton`'s state, so the two are kept distinct
     * exactly as the lifted specs had them.
     */
    readonly submitButton: Locator;

    constructor(page: Page) {
        super(page, page.locator('body'));

        this.saveButton = page.getByRole('button', { name: 'Save' });
        this.saveButtonExact = page.getByRole('button', { name: 'Save', exact: true });
        this.cancelButton = page.locator('button:has-text("Cancel")');
        this.discardChangesButton = page.locator('button:has-text("Discard changes")');
        this.errorSummaryButton = page.getByRole('button', { name: /\d+ error/ });
        this.submitButton = page.locator('button[type="submit"]');
    }

    /**
     * Whether the form has been edited, read from which label the footer shows.
     * The app has no persistent "Unsaved changes" bar — the relabel IS the signal.
     */
    async isDirty(): Promise<boolean> {
        return this.discardChangesButton.isVisible();
    }
}

export default FormFooterComponent;
