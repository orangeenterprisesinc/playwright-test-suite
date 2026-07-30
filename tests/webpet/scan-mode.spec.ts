/**
 * Scan Mode — E2E verification (WEBPET-908, Slice 11 of the Tools > Scan epic WEBPET-897).
 *
 * Verifies the migrated Scan Mode surface that landed across WEBPET-898..904/909/910/913:
 *   - the landing grid lists every scan screen (wired cards link, deferred cards are dimmed),
 *   - each wired route resolves to its screen,
 *   - barcode decode routing and mode-switch-by-barcode navigation behave like the legacy
 *     `CheckBarcode`/`BarcodeDetails` + `OpenScanModeForm` flow,
 *   - the single-employee happy-path save round-trips through the screen shell,
 *   - carry-over is an on-by-default local UI toggle (the live `ScanModePrefs.UseCarryOver`
 *     wiring is deferred — see docs/04-operating-system/OPEN_QUESTIONS.md, WEBPET-900),
 *   - deferred surfaces (Pack House WEBPET-907, fingerprint WEBPET-905, HandPunch WEBPET-906)
 *     are explicitly skipped with a recorded reason.
 *
 * Determinism: the barcode-decode round-trip and the transaction save are driven through the
 * real UI but with `POST /scan/decode` (and the create endpoint) intercepted, so the spec does
 * not depend on which employee/job/field barcodes happen to be seeded in the dev DB. The exact
 * DB-write equivalence (audit/reference columns vs legacy) lives in the env-gated companion
 * spec tests/webpet/equiv/scan-time-in-equivalence.spec.ts.
 *
 * Requires the web app running (baseURL, default http://localhost:3000) and the admin auth
 * storage state provisioned by global-setup. Module-gating assertions live in the companion
 * spec tests/webpet/scan-mode-gating.spec.ts.
 *
 * ## Framework alignment (Batch 13) — two id styles in one file
 *
 * The eleven "resolves to a scan screen" tests are generated from
 * `UNGATED_SCAN_ROUTES`, so their ids come from the **generated**
 * `src/data/webpet/ids/scanModeIds.ts` map and are compile-checked against the
 * `as const` table. The other eleven are hand-authored, one `test()` callsite
 * each, so they carry literal ids. Mixing the two styles in one file is expected:
 * the style follows how the test is declared, not which file it lives in.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import {
    ALL_SCAN_SCREEN_KEYS,
    DEFERRED_SCAN_KEYS,
    UNGATED_SCAN_ROUTES,
    WIRED_SCAN_SEGMENTS,
} from '@data/webpet/scanRoutes';
import { scanModeIds } from '@data/webpet/ids/scanModeIds';

test.describe('Scan Mode — landing grid (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {

    test('[Scan] Verify that the landing grid lists a card for every scan screen.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0346' },
    }, async ({ pages }) => {
        const landing = pages.scanLanding;
        await landing.gotoLanding();
        await landing.waitForGrid();

        for (const key of ALL_SCAN_SCREEN_KEYS) {
            await expect(
                landing.card(key),
                `landing grid is missing a card for "${key}"`,
            ).toBeVisible();
        }
    });

    test('[Scan] Verify that wired cards are links while deferred cards are dimmed and non-navigable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0347' },
    }, async ({ pages }) => {
        const landing = pages.scanLanding;
        await landing.gotoLanding();
        await landing.waitForGrid();

        // Wired cards render as <a> links (the Link component) carrying the screen segment.
        for (const [key, segment] of Object.entries(WIRED_SCAN_SEGMENTS)) {
            const card = landing.card(key);
            await expect(card).toHaveJSProperty('tagName', 'A');
            await expect(card).toHaveAttribute('href', new RegExp(`${segment}$`));
        }

        // Deferred cards render as a disabled Card (no link), marked aria-disabled.
        for (const key of DEFERRED_SCAN_KEYS) {
            const card = landing.card(key);
            await expect(card).toHaveAttribute('aria-disabled', 'true');
            await expect(card).not.toHaveAttribute('href', /./);
        }
    });

    test('[Scan] Verify that clicking a wired card navigates to its scan screen.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0348' },
    }, async ({ page, pages }) => {
        const landing = pages.scanLanding;
        const screen = pages.scanScreen;
        await landing.gotoLanding();
        await landing.card('timeIn').click();
        await expect(page).toHaveURL(/\/scan\/time-in$/);
        // The Time In screen renders the shared scan input + employee slot. Strict
        // `scanInput` here, not `anyScanInput`: Time In has exactly one, and a second
        // one appearing should fail this test.
        await expect(screen.scanInput).toBeVisible();
        await expect(screen.employeeName).toBeVisible();
    });

});

test.describe('Scan Mode — wired routes resolve (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {
    // Foundation + Time & Crew + Driver routes are ungated; they must resolve for any
    // authenticated user. Module-gated routes (inventory/traceability/run) are covered by
    // scan-mode-gating.spec.ts so this list excludes them to avoid env-dependent module
    // flakiness — it is the same shared UNGATED_SCAN_ROUTES table that spec iterates.
    for (const segment of UNGATED_SCAN_ROUTES) {

        test(`[Scan] Verify that /scan/${segment} resolves to a scan screen.`, {
            tag: ['@wp-ui', '@wp-regression'],
            annotation: { type: 'testCaseId', description: scanModeIds[`resolves:${segment}`] },
        }, async ({ pages }) => {
            const screen = pages.scanScreen;
            await screen.gotoSegment(segment);
            // A landed scan screen always renders the shared keyboard-wedge input.
            // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
            // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
            // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
            // rendered without tripping strict-mode on the duplicate; the id collision is a
            // src-side defect to fix.
            await expect(screen.anyScanInput).toBeVisible();
        });

    }
});

test.describe('Scan Mode — barcode decode routing (WEBPET-899 surface)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {

    test('[Scan] Verify that an employee record barcode fills the employee slot.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0360' },
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        // Intercept the decode service so the routing assertion is independent of seeded data.
        await page.route('**/scan/decode', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    kind: 'record',
                    table: 'Employee',
                    recordCounter: 4242,
                    name: 'VERIFY EMPLOYEE',
                    active: true,
                }),
            });
        });

        await screen.gotoSegment('time-in');
        await screen.scanBarcode('EMP-VERIFY');

        // The shell resolves the employee and labels the slot (scan:common.employeeLabel).
        await expect(screen.employeeName).toHaveText(/VERIFY EMPLOYEE/);
        // Save becomes enabled only once an employee is captured.
        await expect(screen.saveButton).toBeEnabled();
    });

    test('[Scan] Verify that a non-employee record barcode is rejected with a message.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0361' },
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await page.route('**/scan/decode', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    kind: 'record',
                    table: 'Job',
                    recordCounter: 7,
                    name: 'HARVEST',
                    active: true,
                }),
            });
        });

        await screen.gotoSegment('time-in');
        await screen.scanBarcode('JOB-7');

        // Non-employee on an employee screen → error status, Save stays disabled.
        await expect(screen.status).toBeVisible();
        await expect(screen.saveButton).toBeDisabled();
    });

    test('[Scan] Verify that a command barcode switches scan mode.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0362' },
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        // A command barcode targeting a different screen navigates there (legacy OpenScanModeForm).
        await page.route('**/scan/decode', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ kind: 'command', targetMode: 'timeOut' }),
            });
        });

        await screen.gotoSegment('time-in');
        await screen.scanBarcode('-BCTO');

        await expect(page).toHaveURL(/\/scan\/time-out$/);
    });

});

test.describe('Scan Mode — per-screen happy-path save (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {

    test('[Scan] Verify that a Time In save round-trips through the screen shell.', {
        tag: ['@wp-ui', '@wp-e2e'],
        annotation: { type: 'testCaseId', description: 'WP-0363' },
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        // Decode → employee; create endpoint intercepted so the save is deterministic.
        await page.route('**/scan/decode', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    kind: 'record',
                    table: 'Employee',
                    recordCounter: 4242,
                    name: 'VERIFY EMPLOYEE',
                    active: true,
                }),
            });
        });
        let savePosted = false;
        await page.route('**/time-cards/time-in', async (route) => {
            if (route.request().method() === 'POST') {
                savePosted = true;
                await route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ timeCardCounter: 999, reference: 'TI-000999' }),
                });
                return;
            }
            await route.continue();
        });

        await screen.gotoSegment('time-in');
        await screen.scanBarcode('EMP-VERIFY');
        await expect(screen.saveButton).toBeEnabled();

        await screen.saveButton.click();

        // Success message shown; employee slot cleared for the next punch.
        await expect(screen.status).toHaveText(/VERIFY EMPLOYEE/);
        expect(savePosted, 'POST /time-cards/time-in should fire on save').toBe(true);
        await expect(screen.saveButton).toBeDisabled();
    });

});

test.describe('Scan Mode — carry-over behavior (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {
    // Carry-over is an on-by-default LOCAL UI toggle that retains the Ranch/Field/Job/Crew
    // context across consecutive punches; the live ScanModePrefs.UseCarryOver preference wiring
    // is deferred (OPEN_QUESTIONS.md, WEBPET-900). This test verifies the shipped toggle, not the
    // (not-yet-wired) preference — that ambiguity is logged, not asserted here.

    test('[Scan] Verify that the carry-over toggle is present and defaults on.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0364' },
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-in');
        await expect(screen.carryOverToggle).toBeVisible();
        // base-ui Switch (role="switch") exposes state via `aria-checked` (true/false)
        // and the presence of `data-checked`/`data-unchecked` — NOT a `data-state`
        // attribute (that was the old shadcn/radix convention this assertion predates).
        // Assert on aria-checked, the stable accessibility contract. Default-on per legacy default.
        await expect(screen.carryOverToggle).toHaveAttribute('aria-checked', 'true');

        await screen.carryOverToggle.click();
        await expect(screen.carryOverToggle).toHaveAttribute('aria-checked', 'false');
    });

});

test.describe('Scan Mode — deferred surfaces (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {
    // These three are declared with `test.skip`, so they always skip and their bodies never
    // run — the annotation is what ties each to its runner row, and the row's `status` is what
    // records that the surface is deferred rather than broken.

    // Pack House (WEBPET-907) is deferred behind the LAN-reachability block (WEBPET-878). It has
    // no wired route and renders as a dimmed "Coming soon" card. Verify when WEBPET-907 lands.
    test.skip('[Scan] Verify the Pack House scan screen — deferred (WEBPET-907 / WEBPET-878).', {
        tag: ['@wp-ui', '@wp-deferred'],
        annotation: { type: 'testCaseId', description: 'WP-0365' },
    }, () => {});

    // Fingerprint capture (WEBPET-905) is a BioIdentification device-integration item, not a
    // navigable scan-entry screen. Verify when the bio-capture surface lands.
    test.skip('[Scan] Verify fingerprint capture — deferred (WEBPET-905).', {
        tag: ['@wp-ui', '@wp-deferred'],
        annotation: { type: 'testCaseId', description: 'WP-0366' },
    }, () => {});

    // HandPunch import (WEBPET-906) is a batch device-import write path, not an interactive
    // scan screen. Verify when the HandPunch sync-folder import lands.
    test.skip('[Scan] Verify HandPunch import provenance — deferred (WEBPET-906).', {
        tag: ['@wp-ui', '@wp-deferred'],
        annotation: { type: 'testCaseId', description: 'WP-0367' },
    }, () => {});

});
