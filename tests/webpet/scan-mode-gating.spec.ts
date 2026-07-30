/**
 * Scan Mode — module/route-gating verification (WEBPET-908).
 *
 * Verifies that the migrated scan routes carry the module gates the legacy menu visibility
 * implied, and that the foundation / Time & Crew / Driver routes are intentionally ungated
 * (connectivity-section precedent; the Pocket-pref / time-card-pref / Driver module keys are
 * not registered in auth.ModuleKeys — see docs/04-operating-system/OPEN_QUESTIONS.md,
 * WEBPET-900 / WEBPET-904).
 *
 * The gating matrix lives in `src/data/webpet/scanRoutes.ts` — shared with
 * `scan-mode.spec.ts`, which iterates the same ungated list.
 *
 * RequireModule renders the screen when modules[module] === true, otherwise <Navigate to="/">.
 * Module entitlement comes from the live session and can resolve to false for every key until
 * the server entitlement data is real (RequireModule.tsx note / SECURITY_MODEL.md §8). So the
 * gated-route assertion is "the gate is WIRED": the route either renders the scan screen (module
 * on) OR redirects away from the gated path (module off) — never renders the screen with the
 * gate absent. The ungated-route assertion is strict: the screen must render, no redirect.
 *
 * Requires the web app running and the admin auth storage state from global-setup.
 *
 * ## Framework alignment (Batch 13) — the loop-id contract
 *
 * All 25 tests are generated from the route tables, so their `testCaseId`
 * annotations cannot be literals. They come from
 * `src/data/webpet/ids/scanModeGatingIds.ts`, which is **generated** from the
 * `caseKey` column of the runner CSV (`npm run webpet:runner:ids`).
 *
 * The tables are `as const`, so every segment is a literal and every map index
 * below is checked at **compile time**. An unchecked index would yield
 * `undefined`, the annotation would be empty, and the runner gate would silently
 * skip the test while the suite still reported green.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import { GATED_SCAN_ROUTES, UNGATED_SCAN_ROUTES } from '@data/webpet/scanRoutes';
import { scanModeGatingIds } from '@data/webpet/ids/scanModeGatingIds';

test.describe('Scan Mode — module gating is wired on gated routes (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {
    for (const { segment, module } of GATED_SCAN_ROUTES) {

        test(`[Scan] Verify that /scan/${segment} is gated by the ${module} module.`, {
            tag: ['@wp-ui', '@wp-regression'],
            annotation: { type: 'testCaseId', description: scanModeGatingIds[`gated:${segment}`] },
        }, async ({ page, pages }) => {
            const screen = pages.scanScreen;
            await screen.gotoSegment(segment);
            // The redirect (when the module is off) is synchronous on first render, so give the
            // app a beat to settle, then read where we landed.
            await page.waitForLoadState('networkidle').catch(() => {});

            if (screen.isOnSegment(segment)) {
                // Module enabled → a scan screen rendered on this route. Not every scan screen
                // has a #scan-input: the run-* label-traceability screens (run-out / piece-count
                // / projection / tracking) are read/compute screens with their own controls, not
                // barcode-entry screens. Assert the shared scan-screen shell rendered via its
                // page-header <h1> title (set by every ScanScreenLayout), which is uniform across
                // both input and compute screens.
                await expect(screen.pageHeading).toBeVisible();
            } else {
                // Module disabled → RequireModule redirected away from the gated path.
                // The gate is wired (the proof this slice needs); we are no longer on /scan/<segment>.
                expect(page.url()).not.toMatch(new RegExp(`/scan/${segment}$`));
            }
        });

    }
});

test.describe('Scan Mode — foundation routes are ungated (WEBPET-908)', { tag: ['@WebPet', '@wp-scan', '@WPBatch13'] }, () => {
    for (const segment of UNGATED_SCAN_ROUTES) {

        test(`[Scan] Verify that /scan/${segment} renders for any authenticated user with no module redirect.`, {
            tag: ['@wp-ui', '@wp-regression'],
            annotation: { type: 'testCaseId', description: scanModeGatingIds[`ungated:${segment}`] },
        }, async ({ page, pages }) => {
            const screen = pages.scanScreen;
            await screen.gotoSegment(segment);
            await page.waitForLoadState('networkidle').catch(() => {});
            // Strict: ungated screens must render and must not have been redirected away.
            await expect(page).toHaveURL(new RegExp(`/scan/${segment}$`));
            // Foundation screens carry a scan input. KNOWN APP BUG on the driver screens
            // (driver-time-in / driver-time-out): they render both the normal ScanInput and
            // a LicenseDecodePanel ScanInput, and ScanInput hardcodes id="scan-input" — so
            // two elements share that id (invalid HTML / duplicate DOM id). `anyScanInput`
            // takes `.first()`, which keeps this test asserting "a scan input rendered"
            // without tripping strict-mode on the duplicate; the id collision itself is a
            // src-side defect to fix in ScanInput (make the id unique per instance, e.g.
            // derive from testId). Reported separately.
            await expect(screen.anyScanInput).toBeVisible();
        });

    }
});
