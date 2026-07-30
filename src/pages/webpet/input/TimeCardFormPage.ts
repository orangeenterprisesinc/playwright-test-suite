/**
 * @fileoverview Time card entry forms — `/input/time-{in,out}/{new,:id}`.
 *
 * One class for both directions: the two forms share a shell and differ only in
 * which fields the API accepts (Time Out carries no job / ranch / field).
 *
 * ## Query-string prefill, and why it forces an explicit dirty step
 *
 * The form's `usePrefillFromQuery` hook seeds the RHF values from the URL on
 * mount — `dateTime`, `employeeCounter`, `crewCounter`, `ranchCounter`,
 * `fieldCounter`, `jobCounter` — which avoids driving the DateTimePicker calendar
 * entirely. But prefill lands through `reset()`, and `reset()` sets
 * `isDirty=false`; FormFooter's Save disables while `!isDirty`. So a prefilled
 * form must be dirtied by hand before Save becomes clickable, and only *after*
 * every data-dependent effect has fired its own secondary `reset()`.
 * {@link traceabilityCode} is the field the suite uses for that: its
 * `setValueAs` maps `''` → `null`, so any non-empty value keeps `isDirty` true.
 *
 * ## The duplicate guard
 *
 * Saving a second punch for the same employee and date raises a "Duplicate Time
 * In" alertdialog whose confirm is **"Continue Anyway"** — not the
 * `/confirm|ok|yes|submit/i` vocabulary the framework's generic modal component
 * matches, which is why it is spelled out here.
 *
 * @module pages/webpet/input/TimeCardFormPage
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @class TimeCardFormPage
 * @extends BasePage
 */
export class TimeCardFormPage extends BasePage {
    readonly pageUrl: string = '/input';
    readonly pageTitle: string | RegExp = /.*/;

    /** The field used to dirty a query-prefilled form — see the class note. */
    readonly traceabilityCode: Locator;
    /** Submit. Gated on `isDirty`, which prefill alone does not satisfy. */
    readonly saveButton: Locator;
    /** The duplicate-punch guard. */
    readonly duplicateDialog: Locator;
    /** The guard's confirm — "Continue Anyway", not the generic confirm vocabulary. */
    readonly continueAnywayButton: Locator;

    constructor(page: Page) {
        super(page);

        this.traceabilityCode = page.locator('input#traceabilityCode');
        this.saveButton = page.getByRole('button', { name: 'Save' });
        this.duplicateDialog = page.getByRole('alertdialog');
        this.continueAnywayButton = this.duplicateDialog.getByRole('button', {
            name: 'Continue Anyway',
        });
    }

    /** Open a new Time In form with a prefill query string (leading `?` included). */
    async gotoNewTimeIn(query: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/time-in/new${query}`);
    }

    /** Open a new Time Out form with a prefill query string (leading `?` included). */
    async gotoNewTimeOut(query: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/time-out/new${query}`);
    }
}

export default TimeCardFormPage;
