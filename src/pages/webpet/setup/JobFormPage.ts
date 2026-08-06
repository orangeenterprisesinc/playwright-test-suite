/**
 * @fileoverview Job create/edit form — `/setup/jobs/{new,:id}`.
 *
 * Save is gated on **three** things, not two: Name, an Overtime Rules foreign
 * key (schema: positive int), and Hourly Rate — conditionally required by
 * `getPaymentTypeRules(paymentType).hourlyRate.required`
 * (`paymentTypePredicates.ts`), true for Payment Type ∈ {0,3,4,7,11,13}. The
 * form's default Payment Type is `Time` (0), which is IN that set, so a fresh
 * New form always needs Hourly Rate too — there is no "Name + Overtime Rules
 * only" path. A test that fills only those two and expects Save to enable is
 * asserting a gate the form has never had; it stays disabled correctly.
 *
 * The widest read-only set of the setup forms: Name, Alias, Code and Export
 * Identifier all lock once the record exists.
 *
 * `includeIdleTime` / `actAsDeterminedByJobEnd` are non-nullable booleans
 * rendered as shadcn Checkboxes with legacy `NOT NULL DEFAULT` values (PET-60).
 * Both tests covering them are skipped pending rework — their locators are kept
 * here so the skip can be lifted without re-deriving anything.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';
import { ParentPickerComponent } from '../../../components/webpet/ParentPickerComponent';

/**
 * @extends WebpetFormPage
 */
export class JobFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** Readonly once the record exists — unique to this screen. */
    readonly aliasInput: Locator;
    /** shadcn Select trigger, not a native `<select>`. */
    readonly paymentTypeSelect: Locator;
    /**
     * The same control, narrowed to the trigger slot.
     *
     * Kept alongside {@link paymentTypeSelect} rather than replacing it: the two
     * lifted specs address this control differently, and collapsing them would
     * change which element one of them resolves.
     */
    readonly paymentTypeTrigger: Locator;
    /** Required FK. Save stays disabled until one is chosen. */
    readonly overtimeRulesPicker: ParentPickerComponent;
    /**
     * Conditionally required — see the file header. Only rendered when
     * `rules.hourlyRate.visible`, which is true for every Payment Type this
     * suite uses (including the default, `Time`).
     */
    readonly hourlyRateInput: Locator;
    /**
     * PET-60 boolean — the element carrying `id="includeIdleTime"`.
     *
     * base-ui splits the checkbox: this id lands on a **hidden `<input>`**,
     * while the visible control gets its own generated id. Use
     * {@link includeIdleTimeControl} to assert on what the user sees. Both exist
     * because the two lifted specs address different elements, and the comment
     * in `select-smoke.spec.ts` documents that as deliberate.
     */
    readonly includeIdleTimeCheckbox: Locator;
    /** The *visible* PET-60 checkbox, linked to its label via `aria-labelledby`. */
    readonly includeIdleTimeControl: Locator;
    /** PET-60 boolean, hidden `<input>` — see {@link includeIdleTimeCheckbox}. */
    readonly actAsDeterminedByJobEndCheckbox: Locator;
    /** The *visible* job-end checkbox, linked to its label via `aria-labelledby`. */
    readonly actAsDeterminedByJobEndControl: Locator;
    /**
     * Shown when the id in the URL does not resolve. The bare `"not found."` the
     * lifted spec used — narrowing it would be a behaviour change.
     */
    readonly notFoundMessage: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/jobs', entity: 'Job' });

        this.codeInput = page.locator('input#code');
        this.aliasInput = page.locator('input#alias');
        this.paymentTypeSelect = page.locator('#paymentType');
        this.paymentTypeTrigger = page.locator('[data-slot="select-trigger"]#paymentType');
        this.overtimeRulesPicker = new ParentPickerComponent(page, 'Overtime Rules');
        this.hourlyRateInput = page.locator('input#hourlyRate');
        this.includeIdleTimeCheckbox = page.locator('#includeIdleTime');
        this.includeIdleTimeControl = this.checkboxFor('includeIdleTime');
        this.actAsDeterminedByJobEndCheckbox = page.locator('#actAsDeterminedByJobEnd');
        this.actAsDeterminedByJobEndControl = this.checkboxFor('actAsDeterminedByJobEnd');
        this.notFoundMessage = page.locator('text=not found.');
    }

    /**
     * Choose the first available Overtime Rule.
     *
     * By position rather than by name: the rule set is client-specific, so no
     * literal is safe, and the tests only need *a* valid FK to clear the gate.
     */
    async pickFirstOvertimeRule(): Promise<void> {
        await this.overtimeRulesPicker.openCombobox();
        await this.overtimeRulesPicker.comboboxPopup.getByRole('option').first().click();
    }

    /**
     * Select a Payment Type by its numeric enum value (e.g. '8' = Non-Labor).
     *
     * Unscoped option selector is safe here: this is only used on a freshly
     * opened form where no stale closed portal can share the value (the
     * ScanDeviceFormPage quirk-2 situation does not arise).
     */
    async selectPaymentType(value: string): Promise<void> {
        await this.paymentTypeTrigger.click();
        await this.page.locator(`[data-slot="select-content"] [data-value="${value}"]`).click();
    }
}

export default JobFormPage;
