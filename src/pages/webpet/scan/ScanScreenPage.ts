/**
 * @fileoverview A Scan Mode screen (`/scan/:segment`) — WEBPET-898…913.
 *
 * Twenty-five routes share one shell (`ScanScreenLayout`): a keyboard-wedge
 * barcode input, an employee slot, a status line, a Save button and a carry-over
 * toggle. One page object serves all of them, parameterised by segment — the
 * screens differ in what they *write*, not in the shell the specs assert against.
 *
 * ## Two scan-input matchers, deliberately not one
 *
 * `ScanInput` hardcodes `id="scan-input"`, and the driver screens
 * (`driver-time-in` / `driver-time-out`) render **two** of them — the normal input
 * plus the `LicenseDecodePanel`'s — so that id is duplicated on those two routes.
 * That is a real src-side defect (the id should be derived per instance), reported
 * separately, not something to paper over here.
 *
 * Until it is fixed the suite needs both matchers and they are not
 * interchangeable:
 *   - {@link scanInput} is **strict**. Use it on the single-input screens, where a
 *     future second input appearing *should* fail the test.
 *   - {@link anyScanInput} takes `.first()`. Use it only where the assertion is
 *     "a scan input rendered" across a route list that includes the driver
 *     screens — `.first()` there is the difference between a real assertion and a
 *     strict-mode error that hides it.
 *
 * Do not consolidate them.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class ScanScreenPage extends BasePage {
    readonly pageUrl: string = '/scan';
    readonly pageTitle: string | RegExp = /.*/;

    /** The keyboard-wedge barcode input — strict. See the class note. */
    readonly scanInput: Locator;
    /** The barcode input, first match only — for the duplicate-id driver screens. */
    readonly anyScanInput: Locator;
    /** The resolved employee slot, labelled from `scan:common.employeeLabel`. */
    readonly employeeName: Locator;
    /** Enabled only once an employee is captured. */
    readonly saveButton: Locator;
    /** The status line: success text after a save, an error after a rejected barcode. */
    readonly status: Locator;
    /** Carry-over: an on-by-default **local** UI toggle (the ScanModePrefs wiring is deferred). */
    readonly carryOverToggle: Locator;
    /**
     * Assign Employee Crew only: the `role="status"` notice reporting the
     * on-mount HandPunch sync-folder import result (WEBPET-906).
     */
    readonly aecImportNotice: Locator;
    /**
     * The shared shell's page-header `<h1>`.
     *
     * The gating spec's "module on" branch asserts this rather than a scan input,
     * because the `run-*` LabelTraceability screens are read/compute screens with
     * their own controls and no barcode entry — the `<h1>` is what every
     * `ScanScreenLayout` sets, input screen or not.
     */
    readonly pageHeading: Locator;

    constructor(page: Page) {
        super(page);

        this.scanInput = page.locator('#scan-input');
        this.anyScanInput = page.locator('#scan-input').first();
        this.employeeName = page.locator('[data-testid="scan-employee-name"]');
        this.saveButton = page.locator('[data-testid="scan-save-button"]');
        this.status = page.locator('[data-testid="scan-status"]');
        this.carryOverToggle = page.locator('[data-testid="scan-carry-over"]');
        this.aecImportNotice = page.locator('[data-testid="aec-import-notice"]');
        this.pageHeading = page.getByRole('heading', { level: 1 });
    }

    /**
     * Open a scan screen by route segment.
     *
     * Takes a plain string rather than a narrowed union: the gating spec navigates
     * gated segments whose screens may legitimately never render.
     */
    async gotoSegment(segment: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}/${segment}`);
    }

    /** Type a barcode into the wedge input and submit it, the way a scanner would. */
    async scanBarcode(barcode: string): Promise<void> {
        await this.scanInput.fill(barcode);
        await this.scanInput.press('Enter');
    }

    /** Whether the browser is still on `/scan/<segment>` — the gate-wired check. */
    isOnSegment(segment: string): boolean {
        return new RegExp(`/scan/${segment}$`).test(this.page.url());
    }
}

export default ScanScreenPage;
