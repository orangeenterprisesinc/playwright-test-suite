/* eslint-disable playwright/no-networkidle --
 * All 25 tests inherit `await page.waitForLoadState('networkidle').catch(() => {})`
 * verbatim from the web-pet source, where `config/lint/.eslintrc.json` downgraded
 * this rule to a warning for `tests/webpet/**`. Relocation moves the file out of
 * that override, so the rule was never satisfied here — only silenced there.
 *
 * The wait is load-bearing, not decorative: RequireModule's redirect is
 * synchronous on first render, and the assertion below reads `page.url()` to
 * decide which branch of the gate it is in. Without a settle the URL can be read
 * before the redirect lands, flipping a gated test into the wrong branch.
 *
 * Rewriting it is deliberately out of scope for a relocation batch: this is a
 * timing change across 25 live gate assertions, and nothing in this batch can
 * validate the replacement. Tracked as a follow-up in the plan's open questions.
 */
/**
 * Scan Mode — module/route-gating verification for Catalog workflow **A7 — Scan
 * device registration and data scoping** (WEBPET-908).
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-a/a07-scan-device-and-scoping.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A7-002`…`A7-026` |
 *
 * Relocated from `tests/webpet/scan-mode-gating.spec.ts`. Every assertion below
 * is the one that spec carried, in the same order and the same two describes;
 * what changed is the fixture (`base.fixture`), the id/tag vocabulary, and the
 * loop-generated tests.
 *
 * The source declared both describes as a single `test()` inside a `for` loop
 * over a shared route table. The CI checker parses specs with a regex before
 * any build step runs, so it cannot see a template-literal title or a computed
 * `testCaseId` annotation — both loops are expanded here into literal `test()`
 * calls, one per route, with the loop variable substituted by its literal
 * value in both the title and the body. The generated id map this file used to
 * read (`src/data/webpet/ids/scanModeGatingIds.ts`) is retired rather than
 * ported: every id below is now a literal, checked by the checker itself
 * instead of by TypeScript's `as const` index. `src/data/webpet/scanRoutes.ts`
 * is no longer imported either — the route/module pairs it held are now baked
 * into each expanded test.
 *
 * RequireModule renders the screen when modules[module] === true, otherwise
 * <Navigate to="/">. Module entitlement comes from the live session and can
 * resolve to false for every key until the server entitlement data is real
 * (RequireModule.tsx note / SECURITY_MODEL.md §8). So the gated-route assertion
 * is "the gate is WIRED": the route either renders the scan screen (module on)
 * OR redirects away from the gated path (module off) — never renders the
 * screen with the gate absent. The ungated-route assertion is strict: the
 * screen must render, no redirect.
 *
 * Requires the web app running and the admin auth storage state from global-setup.
 */
import { expect, test } from '@fixtures/base.fixture';

test.describe('Scan Mode — module gating is wired on gated routes (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {

    // The following comments are carried once from the source loop body — they
    // explain behavior shared by every expanded test in this describe.
    //
    // The redirect (when the module is off) is synchronous on first render, so give the
    // app a beat to settle, then read where we landed.
    //
    // Module enabled → a scan screen rendered on this route. Not every scan screen
    // has a #scan-input: the run-* label-traceability screens (run-out / piece-count
    // / projection / tracking) are read/compute screens with their own controls, not
    // barcode-entry screens. Assert the shared scan-screen shell rendered via its
    // page-header <h1> title (set by every ScanScreenLayout), which is uniform across
    // both input and compute screens.
    //
    // Module disabled → RequireModule redirected away from the gated path.
    // The gate is wired (the proof this slice needs); we are no longer on /scan/<segment>.
    test('[Scan] Verify that /scan/purchase is gated by the Inventory module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-002' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('purchase');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('purchase')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/purchase$'));
        }
    });

    test('[Scan] Verify that /scan/usage is gated by the Inventory module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-003' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('usage');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('usage')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/usage$'));
        }
    });

    test('[Scan] Verify that /scan/physical-count is gated by the Inventory module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-004' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('physical-count');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('physical-count')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/physical-count$'));
        }
    });

    test('[Scan] Verify that /scan/transfer-from is gated by the Inventory module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-005' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('transfer-from');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('transfer-from')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/transfer-from$'));
        }
    });

    test('[Scan] Verify that /scan/transfer-to is gated by the Inventory module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-006' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('transfer-to');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('transfer-to')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/transfer-to$'));
        }
    });

    test('[Scan] Verify that /scan/field-traceability is gated by the Traceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-007' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('field-traceability');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('field-traceability')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/field-traceability$'));
        }
    });

    test('[Scan] Verify that /scan/warehouse-traceability is gated by the Traceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-008' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('warehouse-traceability');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('warehouse-traceability')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/warehouse-traceability$'));
        }
    });

    test('[Scan] Verify that /scan/run-in is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-009' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('run-in');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('run-in')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/run-in$'));
        }
    });

    test('[Scan] Verify that /scan/run-out is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-010' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('run-out');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('run-out')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/run-out$'));
        }
    });

    test('[Scan] Verify that /scan/run-piece-count is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-011' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('run-piece-count');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('run-piece-count')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/run-piece-count$'));
        }
    });

    test('[Scan] Verify that /scan/run-projection is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-012' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('run-projection');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('run-projection')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/run-projection$'));
        }
    });

    test('[Scan] Verify that /scan/run-tracking is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-013' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('run-tracking');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('run-tracking')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/run-tracking$'));
        }
    });

    test('[Scan] Verify that /scan/assign-barcode-roll is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-014' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('assign-barcode-roll');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('assign-barcode-roll')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/assign-barcode-roll$'));
        }
    });

    test('[Scan] Verify that /scan/assign-employee-crew is gated by the LabelTraceability module.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-015' },
            { type: 'requirement', description: 'A7-R1' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('assign-employee-crew');
        await page.waitForLoadState('networkidle').catch(() => {});

        if (screen.isOnSegment('assign-employee-crew')) {
            await expect(screen.pageHeading).toBeVisible();
        } else {
            expect(page.url()).not.toMatch(new RegExp('/scan/assign-employee-crew$'));
        }
    });

});

test.describe('Scan Mode — foundation routes are ungated (WEBPET-908)', { tag: ['@JourneyA', '@A7'] }, () => {

    // The following comments are carried once from the source loop body — they
    // explain behavior shared by every expanded test in this describe.
    //
    // Strict: ungated screens must render and must not have been redirected away.
    //
    // Foundation screens carry a scan input. KNOWN APP BUG on the driver screens
    // (driver-time-in / driver-time-out): they render both the normal ScanInput and
    // a LicenseDecodePanel ScanInput, and ScanInput hardcodes id="scan-input" — so
    // two elements share that id (invalid HTML / duplicate DOM id). `anyScanInput`
    // takes `.first()`, which keeps this test asserting "a scan input rendered"
    // without tripping strict-mode on the duplicate; the id collision itself is a
    // src-side defect to fix in ScanInput (make the id unique per instance, e.g.
    // derive from testId). Reported separately.
    test('[Scan] Verify that /scan/time-in renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-016' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-in');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/time-in$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/time-out renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-017' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-out');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/time-out$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/piece-out renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-018' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('piece-out');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/piece-out$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/time-card renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-019' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('time-card');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/time-card$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/paid-break renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-020' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('paid-break');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/paid-break$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/meal renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-021' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('meal');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/meal$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/crew-time-in renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-022' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('crew-time-in');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/crew-time-in$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/crew-time-out renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-023' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('crew-time-out');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/crew-time-out$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/crew-piece-out renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-024' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('crew-piece-out');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/crew-piece-out$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/driver-time-in renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-025' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('driver-time-in');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/driver-time-in$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

    test('[Scan] Verify that /scan/driver-time-out renders for any authenticated user with no module redirect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A7-026' },
            { type: 'requirement', description: 'A7-R2' },
        ],
    }, async ({ page, pages }) => {
        const screen = pages.scanScreen;
        await screen.gotoSegment('driver-time-out');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page).toHaveURL(new RegExp('/scan/driver-time-out$'));
        await expect(screen.anyScanInput).toBeVisible();
    });

});
