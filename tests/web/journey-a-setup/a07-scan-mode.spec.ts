/**
 * Scan Mode — E2E verification for Catalog workflow **A7 — Scan device
 * registration and data scoping** (WEBPET-908, Slice 11 of the Tools > Scan
 * epic WEBPET-897).
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-a/a07-scan-device-and-scoping.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A7-027`…`A7-048` |
 *
 * Relocated from `tests/webpet/scan-mode.spec.ts`. Every assertion below is
 * the one that spec carried, in the same order and the same six describes;
 * what changed is the fixture (`base.fixture`), the id/tag vocabulary, and two
 * structural fixes forced by moving out of the web-pet suite:
 *
 * - The "wired routes resolve" describe declared its eleven tests inside a
 *   `for` loop with a template-literal title and a generated `testCaseId`
 *   (`src/data/webpet/ids/scanModeIds.ts`). The CI checker parses specs with a
 *   regex before any build step runs and cannot see either, so the loop is
 *   expanded here into eleven literal `test()` calls, one per segment, with
 *   the loop variable substituted by its literal value. The generated id map
 *   is retired rather than ported — every id below is a literal.
 * - The "deferred surfaces" describe declared its three tests as
 *   `test.skip('title', …)` with an empty body. That form hides the title
 *   from the same regex checker, which would exempt the test from every tag
 *   and requirement rule. Each is now a plain `test('title', …)` whose body's
 *   only statement is `test.skip(true, '<reason>')` — the title is visible to
 *   the checker, the skip still fires immediately.
 *
 * Verifies the migrated Scan Mode surface that landed across
 * WEBPET-898..904/909/910/913:
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
 * spec tests/web/journey-a-setup/a07-scan-mode-gating.spec.ts.
 */
import { expect, test } from '@fixtures/base.fixture';
import {
    ALL_SCAN_SCREEN_KEYS,
    DEFERRED_SCAN_KEYS,
    WIRED_SCAN_SEGMENTS,
} from '@data/scan/scanRoutes';

test.describe('Scan Mode — landing grid (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {

    test('[Scan] Verify that the landing grid lists a card for every scan screen.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-027' },
            { type: 'requirement', description: 'A7-R3' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-028' },
            { type: 'requirement', description: 'A7-R4' },
        ],
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
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-029' },
            { type: 'requirement', description: 'A7-R5' },
        ],
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

test.describe('Scan Mode — wired routes resolve (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {
    // Foundation + Time & Crew + Driver routes are ungated; they must resolve for any
    // authenticated user. Module-gated routes (inventory/traceability/run) are covered by
    // scan-mode-gating.spec.ts so this list excludes them to avoid env-dependent module
    // flakiness — it is the same shared UNGATED_SCAN_ROUTES table that spec iterates.

    test('[Scan] Verify that /scan/time-in resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-030' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-in');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/time-out resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-031' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-out');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/piece-out resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-032' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('piece-out');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/time-card resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-033' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-card');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/paid-break resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-034' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('paid-break');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/meal resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-035' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('meal');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/crew-time-in resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-036' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('crew-time-in');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/crew-time-out resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-037' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('crew-time-out');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/crew-piece-out resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-038' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('crew-piece-out');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/driver-time-in resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-039' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('driver-time-in');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/driver-time-out resolves to a scan screen.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-040' },
            { type: 'requirement', description: 'A7-R6' },
        ],
    }, async ({ pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('driver-time-out');
        // A landed scan screen always renders the shared keyboard-wedge input.
        // KNOWN APP BUG (driver-time-in / driver-time-out): the driver screens render two
        // ScanInputs (normal + LicenseDecodePanel) and ScanInput hardcodes id="scan-input",
        // so the id is duplicated. `anyScanInput` takes `.first()`, proving a scan input
        // rendered without tripping strict-mode on the duplicate; the id collision is a
        // src-side defect to fix.
        await expect(screen.anyScanInput).toBeVisible();
    });

});

test.describe('Scan Mode — barcode decode routing (WEBPET-899 surface)', { tag: ['@JourneyA', '@A7'] }, () => {

    test('[Scan] Verify that an employee record barcode fills the employee slot.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-041' },
            { type: 'requirement', description: 'A7-R7' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-042' },
            { type: 'requirement', description: 'A7-R8' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-043' },
            { type: 'requirement', description: 'A7-R9' },
        ],
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

test.describe('Scan Mode — per-screen happy-path save (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {

    test('[Scan] Verify that a Time In save round-trips through the screen shell.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-044' },
            { type: 'requirement', description: 'A7-R10' },
        ],
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
            try {
                await route.continue();
            } catch (error) {
                // base.fixture, unlike webpet.fixture, does not swallow the teardown race
                // where the context closes while a continued request is still in flight.
                if (!/has been closed/i.test(String(error))) throw error;
            }
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

test.describe('Scan Mode — carry-over behavior (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {
    // Carry-over is an on-by-default LOCAL UI toggle that retains the Ranch/Field/Job/Crew
    // context across consecutive punches; the live ScanModePrefs.UseCarryOver preference wiring
    // is deferred (OPEN_QUESTIONS.md, WEBPET-900). This test verifies the shipped toggle, not the
    // (not-yet-wired) preference — that ambiguity is logged, not asserted here.

    test('[Scan] Verify that the carry-over toggle is present and defaults on.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-045' },
            { type: 'requirement', description: 'A7-R11' },
        ],
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

test.describe('Scan Mode — deferred surfaces (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {
    // These three are plain tests whose body is a single test.skip(true, '<reason>') call —
    // not test.skip('title', …), which hides the title from the CI checker's title-regex and
    // would exempt the test from every tag and requirement rule. The annotation still ties
    // each to its runner row, and the row's `status` is what records that the surface is
    // deferred rather than broken.

    // Pack House (WEBPET-907) is deferred behind the LAN-reachability block (WEBPET-878). It has
    // no wired route and renders as a dimmed "Coming soon" card. Verify when WEBPET-907 lands.
    test('[Scan] Verify the Pack House scan screen — deferred (WEBPET-907 / WEBPET-878).', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-046' },
            { type: 'requirement', description: 'A7-R12' },
        ],
    }, async () => {
        test.skip(true, 'Deferred surface: the Pack House scan screen (WEBPET-907) is blocked behind LAN reachability (WEBPET-878) — no wired route exists and the landing card renders dimmed.');
    });

    // Fingerprint capture (WEBPET-905) is a BioIdentification device-integration item, not a
    // navigable scan-entry screen. Verify when the bio-capture surface lands.
    test('[Scan] Verify fingerprint capture — deferred (WEBPET-905).', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-047' },
            { type: 'requirement', description: 'A7-R13' },
        ],
    }, async () => {
        test.skip(true, 'Deferred surface: fingerprint capture (WEBPET-905) is a BioIdentification device integration, not a navigable scan-entry screen.');
    });

    // HandPunch import (WEBPET-906) is a batch device-import write path, not an interactive
    // scan screen. Verify when the HandPunch sync-folder import lands.
    test('[Scan] Verify HandPunch import provenance — deferred (WEBPET-906).', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-048' },
            { type: 'requirement', description: 'A7-R14' },
        ],
    }, async () => {
        test.skip(true, 'Deferred surface: HandPunch import (WEBPET-906) is a batch device-import write path, not an interactive scan screen.');
    });

});
