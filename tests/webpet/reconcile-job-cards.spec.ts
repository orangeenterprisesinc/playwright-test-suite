/**
 * Coverage for the Reconcile Job Cards page (TTJC-aligned layout).
 *
 * Asserts the page renders, the preference gate works, the Reconcile
 * button is gated until a date scope is picked, the DateRangePicker (in
 * the grid's column-filter row) drives the preview fetch, and Reconcile
 * issues a POST /reconcile via the confirmation dialog.
 *
 * Server prereqs: PetData with IncludeReconcileJCs preference set true.
 *
 * ## Framework alignment (Batch 12) — where the skips live and why
 *
 * Eleven `test.skip` callsites for ten tests. Every one of them turns on server
 * state the suite cannot set: the `IncludeReconcileJCs` preference, the
 * `accounting.export` permission, or whether the seeded DB has any JobCards in the
 * last 30 days. They stay **in the spec**, never inside `ReconcileJobCardsPage`:
 * a page object that skipped for you would make a skipped test look like a passing
 * one at the callsite. The page object answers the question
 * ({@link ReconcileJobCardsPage.applyLast30IfEnabled} returns a boolean); the spec
 * decides what to do with the answer.
 *
 * WP-0301 is the exception: it *drives* the preference through a `/api/preferences`
 * rewrite instead of skipping on it, because a skip there would leave the
 * permission-AND-preference gate untested in both directions.
 *
 * The route mocks stay here too, and they must keep inspecting `postData()` for
 * `"dryRun":true` and falling back: the preview count and the real run POST to the
 * same URL, so a blanket fulfill would stub out the preview and the confirm dialog
 * would never be reachable.
 */
import type { Page } from '@playwright/test';
import { apiUrl } from '@config/webpetEnv';
import { expect, test } from '@fixtures/webpet.fixture';
import type { ReconcileJobCardsPage } from '@pages/webpet/accounting/ReconcileJobCardsPage';
import {
    deleteEmployee,
    deleteJob,
    deleteJobCard,
    ensureEmployee,
    ensureJob,
    ensureJobCard,
    type EnsuredEmployee,
    type EnsuredJob,
    type EnsuredJobCard,
} from './data-factory';

type MockReconcileResponse = {
    summary: {
        matchedCount: number;
        updatedCount: number;
        modifiedAfterExportCount: number;
        failedCount: number;
        warningCount: number;
    };
    failures: { jobCardCounter: number; code: string; message: string }[];
    warnings: { jobCardCounter: number; code: string; message: string }[];
    truncated: boolean;
};

/**
 * Stub the **real** reconcile POST, letting the dry-run preview through.
 *
 * `route.fallback()` rather than `continue()` on the dry-run branch so any
 * previously registered handler still gets a look.
 */
const mockReconcilePost = async (
    page: Page,
    response: MockReconcileResponse | { status: number; body: object },
) => {
    await page.route('**/api/job-cards/reconcile', async (route, req) => {
        if (req.method() !== 'POST') {
            await route.fallback();
            return;
        }
        if ((req.postData() ?? '').includes('"dryRun":true')) {
            await route.fallback();
            return;
        }
        if ('status' in response) {
            await route.fulfill({
                status: response.status,
                contentType: 'application/json',
                body: JSON.stringify(response.body),
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(response),
            });
        }
    });
};

/** Pick a scope, wait for the preview, then confirm the run. Skips on either gate. */
const submitReconcile = async (reconcile: ReconcileJobCardsPage) => {
    if (!(await reconcile.applyLast30IfEnabled())) {
        test.skip(true, 'IncludeReconcileJCs preference is off');
    }
    await expect(reconcile.previewCount).not.toHaveText('');
    // previewOutcome settles on the dry-run result — an instant isVisible read
    // here raced the fetch and drove tests into the disabled CTA instead of a
    // clean skip. The suite provisions its own JobCards (beforeAll), so the
    // no-match branch fires only on environments where that provisioning failed.
    if ((await reconcile.previewOutcome()) === 'no-match') {
        test.skip(
            true,
            'No JobCards in the last 30 days; cannot exercise the submit + mocked-response flow.',
        );
    }
    await reconcile.submitButton.click();
    await expect(reconcile.confirmDialog).toBeVisible();
    await reconcile.confirmSubmitButton.click();
};

/**
 * Read the session's effective `accounting.export` grant from inside the page.
 *
 * Reads the body as text and parses it here rather than calling `res.json()`, so a
 * non-JSON response reports what actually came back instead of throwing a
 * `TypeError` on a null session two lines later — which is what made this helper
 * mask the real failure on dev (see BUG-05 / BUG-01).
 */
const hasExportPermission = async (page: Page): Promise<boolean> => {
    const url = apiUrl('/api/session/me');
    const result = await page.evaluate(async (sessionUrl) => {
        const res = await fetch(sessionUrl, { credentials: 'include' });
        const body = await res.text();
        try {
            return { status: res.status, session: JSON.parse(body) as unknown };
        } catch {
            return { status: res.status, body: body.slice(0, 120) };
        }
    }, url);

    const session = 'session' in result ? (result.session as {
        derivedPermissions?: string[];
        capabilities?: { actions?: Record<string, boolean> };
    } | null) : null;

    if (!session) {
        throw new Error(
            `could not read the session from ${url}: HTTP ${result.status}` +
            ('body' in result ? `, body starts ${JSON.stringify(result.body)}` : ', body was null'),
        );
    }
    if (!Array.isArray(session.derivedPermissions) && session.capabilities?.actions === undefined) {
        throw new Error(
            `${url} returned HTTP ${result.status} but carried neither derivedPermissions nor ` +
            `capabilities.actions; keys: ${Object.keys(session).join(', ') || '(none)'}`,
        );
    }

    return (
        (session.derivedPermissions ?? []).includes('accounting.export') ||
        session.capabilities?.actions?.['accounting.export'] === true
    );
};

/**
 * Force the `IncludeReconcileJCs` preference client-side, returning a setter so one
 * route handler serves both branches across a reload.
 *
 * The deployed nav builder gates the entry on
 * `enableExportToAccounting && preferences.includeReconcileJCs` (GET /api/preferences,
 * default false) — so with the preference off the link is legitimately absent, and an
 * unconditional `toBeAttached()` could only ever pass where someone had flipped the
 * preference by hand. Rewriting the response makes both branches reachable anywhere.
 * Same idiom as `employee.spec.ts`'s preference rewrite.
 */
const forceReconcilePreference = async (page: Page, initial: boolean) => {
    let include = initial;
    await page.route('**/api/preferences*', async (route) => {
        const response = await route.fetch();
        const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) {
            await route.fulfill({ response });
            return;
        }
        body['includeReconcileJCs'] = include;
        await route.fulfill({ response, json: body });
    });
    return (value: boolean) => {
        include = value;
    };
};

test.describe('Reconcile Job Cards', { tag: ['@WebPet', '@wp-reconcile', '@WPBatch12'] }, () => {

    // Own JobCard data (WEBPET-1797 work-item): dev often has no JobCards inside
    // the Last-30-days scope, which starved every populated-grid branch. Two
    // cards on an own employee+job keep the dry-run count ≥1 without touching
    // anyone else's records; WP-0300's real reconcile then recomputes only data
    // this file owns (plus whatever else legitimately matches).
    let emp: EnsuredEmployee;
    let job: EnsuredJob;
    let cards: EnsuredJobCard[] = [];

    test.beforeAll(async ({ request }) => {
        emp = await ensureEmployee(request, { namePrefix: 'E2EReconEmp' });
        job = await ensureJob(request, { namePrefix: 'E2EReconJob' });
        cards = [
            await ensureJobCard(request, { employeeId: emp.id, jobId: job.id, daysAgo: 3 }),
            await ensureJobCard(request, { employeeId: emp.id, jobId: job.id, daysAgo: 5 }),
        ];
    });

    test.afterAll(async ({ request }) => {
        for (const c of cards) await deleteJobCard(request, c.id);
        if (job) await deleteJob(request, job.id);
        if (emp) await deleteEmployee(request, emp.id);
    });

    test('[Reconcile] Verify that the page header renders and the preference gate is respected.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0298' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await expect(reconcile.heading).toBeVisible();

        await page.waitForLoadState('networkidle');
        if (await reconcile.isDisabled()) {
            // Preference off — page chrome should NOT render.
            await expect(reconcile.submitButton).toHaveCount(0);
        } else {
            // Preference on — Reconcile CTA is present (disabled until a
            // scope is picked).
            await expect(reconcile.submitButton).toBeVisible();
            await expect(reconcile.submitButton).toBeDisabled();
        }
    });

    test('[Reconcile] Verify that the pre-analyze prompt shows when no date range is selected.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0299' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');
        if (await reconcile.isDisabled()) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }
        // The grid renders its pre-analyze empty state with a clickable
        // "date range" link that opens the picker.
        await expect(reconcile.gridEmptyPickRange).toBeVisible();
        // The wave-arrow hint points at the date column from the status
        // column's filter slot.
        await expect(reconcile.gridPickRangeArrow).toBeVisible();
    });

    test('[Reconcile] Verify that the page renders and a reconcile run completes against the live API.', {
        tag: ['@wp-ui', '@wp-e2e'],
        annotation: { type: 'testCaseId', description: 'WP-0300' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await expect(reconcile.heading).toBeVisible();
        await page.waitForLoadState('networkidle');
        if (!(await reconcile.applyLast30IfEnabled())) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }

        // Wait for the preview count to populate, then for the dry-run outcome
        // to settle (an instant no-match read here races the fetch).
        await expect(reconcile.previewCount).not.toHaveText('');

        if ((await reconcile.previewOutcome()) === 'no-match') {
            test.skip(true, 'No JobCards in the last 30 days; cannot exercise the populated-grid branch.');
        }

        // Click Reconcile → confirmation dialog opens.
        await reconcile.submitButton.click();
        await expect(reconcile.confirmDialog).toBeVisible();

        const matchedCount = await reconcile.matchedCount();
        if (matchedCount > 500) {
            await expect(reconcile.largeSelectionWarning).toBeVisible();
        } else {
            await expect(reconcile.largeSelectionWarning).toHaveCount(0);
        }

        // Confirm the run; expect POST /api/job-cards/reconcile with dryRun:false.
        const responsePromise = page.waitForResponse(
            (res) =>
                res.url().includes('/api/job-cards/reconcile') &&
                res.request().method() === 'POST' &&
                !(res.request().postData() ?? '').includes('"dryRun":true'),
        );
        await reconcile.confirmSubmitButton.click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);

        const body = (await response.json()) as {
            summary: {
                matchedCount: number;
                updatedCount: number;
                modifiedAfterExportCount: number;
                failedCount: number;
                warningCount: number;
            };
            failures: unknown[];
            warnings: unknown[];
        };
        expect(typeof body.summary.matchedCount).toBe('number');
        expect(typeof body.summary.updatedCount).toBe('number');

        await expect(reconcile.summaryPanel).toBeVisible();
    });

    test('[Reconcile] Verify that the sidebar entry presence matches the accounting.export permission and the IncludeReconcileJCs preference.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0301' },
    }, async ({ page, pages }) => {
        // Drive the preference instead of reading it, so both branches of the AND gate
        // are exercised on every environment. Asserting only `toBeAttached()` on the
        // permission made this the one test in the file that assumed the preference was
        // on — it passed solely because the pref had been flipped by hand on dev
        // (runner note, 2026-08-24) and went red the moment that reverted. Reading the
        // preference instead would just make it assert *absence* forever here, leaving
        // the positive branch untested.
        const setIncludeReconcileJCs = await forceReconcilePreference(page, true);

        await pages.shell.gotoRoot();
        await page.waitForLoadState('networkidle');

        const hasPermission = await hasExportPermission(page);
        const sidebarLink = pages.shell.navLinkNamed('Reconcile Job Cards');

        if (!hasPermission) {
            // The permission alone removes the entry; the positive branch is
            // unreachable for this session whatever the preference says.
            await expect(sidebarLink).toHaveCount(0);
            await page.unrouteAll({ behavior: 'ignoreErrors' });
            return;
        }

        await expect(sidebarLink).toBeAttached();

        // Flip the one term and reload: same session, same permission, entry gone.
        // Wait on the sibling entry (permission-only gate) rather than the network:
        // it proves the nav list actually rebuilt, so the absence below cannot pass
        // vacuously against a sidebar that has not rendered yet.
        setIncludeReconcileJCs(false);
        await page.reload();
        await expect(pages.shell.navLink('Export to Accounting')).toBeAttached();
        await expect(sidebarLink).toHaveCount(0);

        // The SPA re-fetches preferences on its own schedule, so a handler can still be
        // mid-`route.fetch()` when the context tears down — which surfaces as a route
        // callback error and fails an otherwise-green test.
        await page.unrouteAll({ behavior: 'ignoreErrors' });
    });

    test('[Reconcile] Verify that a direct URL redirects to the root when accounting.export is absent.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0302' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await pages.shell.gotoRoot();
        const hasPermission = await hasExportPermission(page);

        if (hasPermission) {
            test.skip(
                true,
                'Seeded user has accounting.export; cannot exercise the redirect branch.',
            );
        }

        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(/\/$/);
    });

    test('[Reconcile] Verify that with the preference off the URL stays stable and the banner shows.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0303' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');

        if (!(await reconcile.isDisabled())) {
            test.skip(true, 'IncludeReconcileJCs preference is on; cannot exercise the banner branch.');
        }

        await expect(page).toHaveURL(/\/reconcile-job-cards$/);
        await expect(reconcile.disabledBanner).toBeVisible();
    });

    // ── Mocked POST /api/job-cards/reconcile branches ─────────────────────────

    test('[Reconcile] Verify that the summary panel renders inline failure rows when failures exist.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0304' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');
        if (await reconcile.isDisabled()) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }

        await mockReconcilePost(page, {
            summary: {
                matchedCount: 3,
                updatedCount: 1,
                modifiedAfterExportCount: 0,
                failedCount: 2,
                warningCount: 0,
            },
            failures: [
                { jobCardCounter: 101, code: 'updateFailed', message: 'Failed to update job card' },
                { jobCardCounter: 102, code: 'notFound', message: 'Job card not found' },
            ],
            warnings: [],
            truncated: false,
        });

        await submitReconcile(reconcile);

        await expect(reconcile.summaryPanel).toBeVisible();
        await expect(reconcile.resultRows.first()).toBeVisible();
        await expect(reconcile.resultRows).toHaveCount(2);
        await expect(reconcile.summaryDownload).toBeVisible();
    });

    test('[Reconcile] Verify that the CSV download button is absent when the summary is all-clean.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0305' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');
        if (await reconcile.isDisabled()) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }

        await mockReconcilePost(page, {
            summary: {
                matchedCount: 5,
                updatedCount: 5,
                modifiedAfterExportCount: 0,
                failedCount: 0,
                warningCount: 0,
            },
            failures: [],
            warnings: [],
            truncated: false,
        });

        await submitReconcile(reconcile);

        await expect(reconcile.summaryPanel).toBeVisible();
        await expect(reconcile.summaryAllGood).toBeVisible();
        await expect(reconcile.summaryDownload).toHaveCount(0);
    });

    test('[Reconcile] Verify that a 5xx response triggers an error toast and no summary panel.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0306' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');
        if (await reconcile.isDisabled()) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }

        await mockReconcilePost(page, { status: 500, body: {} });

        await submitReconcile(reconcile);

        await expect(pages.toasts.errorToasts.first()).toBeVisible({ timeout: 5000 });
        await expect(reconcile.summaryPanel).toHaveCount(0);
    });

    test('[Reconcile] Verify that a 4xx response triggers an error toast and no summary panel.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0307' },
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await page.waitForLoadState('networkidle');
        if (await reconcile.isDisabled()) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }

        await mockReconcilePost(page, { status: 400, body: { error: 'invalid request' } });

        await submitReconcile(reconcile);

        await expect(pages.toasts.errorToasts.first()).toBeVisible({ timeout: 5000 });
        await expect(reconcile.summaryPanel).toHaveCount(0);
    });

});
