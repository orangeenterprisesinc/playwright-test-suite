/* eslint-disable playwright/no-networkidle --
 * Ten waits relocated verbatim from tests/webpet, where
 * config/lint/.eslintrc.json downgraded this rule to a warning. Rewriting a
 * wait is a timing change this relocation batch cannot validate; tracked for
 * the post-consolidation cleanup.
 */
/**
 * Reconcile Job Cards, for Catalog workflow **E10 — Export-identifier
 * matching**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-e/e10-export-identifier-matching.md` |
 * | Runner rows | `src/data/runner/journey-e.csv` → `E10-002`…`E10-011` |
 *
 * Relocated from `tests/webpet/reconcile-job-cards.spec.ts`
 * (WP-0298…WP-0307). Every assertion below is the one that spec carried, in
 * the same order and the same describe; what changed is the fixture
 * (`base.fixture`), the id/tag vocabulary, and wrapping every `page.route`
 * registration — including the one inside `mockReconcilePost` — in
 * `guardTeardownRace` (`base.fixture` does not swallow the "…has been
 * closed" teardown race that `webpet.fixture` did — see
 * `src/utils/routeGuard.ts`). The `return;` statements inside those handlers
 * are interceptor control flow and were preserved exactly.
 *
 * `E10-005` (WP-0301) is quarantined (`enabled=0`) — see the comment above
 * its test.
 */
import type { Page } from '@playwright/test';
import { apiUrl } from '@config/webpetEnv';
import { expect, test } from '@fixtures/base.fixture';
import { guardTeardownRace } from '@utils/routeGuard';
import type { ReconcileJobCardsPage } from '@pages/accounting/ReconcileJobCardsPage';

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
    await page.route('**/api/job-cards/reconcile', guardTeardownRace(async (route, req) => {
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
    }));
};

/** Pick a scope, wait for the preview, then confirm the run. Skips on either gate. */
const submitReconcile = async (reconcile: ReconcileJobCardsPage) => {
    if (!(await reconcile.applyLast30IfEnabled())) {
        test.skip(true, 'IncludeReconcileJCs preference is off');
    }
    await expect(reconcile.previewCount).not.toHaveText('');
    if (await reconcile.noMatchMessage.isVisible()) {
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

test.describe('Reconcile Job Cards', { tag: ['@JourneyE', '@E10'] }, () => {

    test('[Reconcile] Verify that the page header renders and the preference gate is respected.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-002' },
            { type: 'requirement', description: 'E10-R1' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-003' },
            { type: 'requirement', description: 'E10-R2' },
        ],
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
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-004' },
            { type: 'requirement', description: 'E10-R3' },
        ],
    }, async ({ page, pages }) => {
        const reconcile = pages.reconcileJobCards;
        await reconcile.gotoReconcile();
        await expect(reconcile.heading).toBeVisible();
        await page.waitForLoadState('networkidle');
        if (!(await reconcile.applyLast30IfEnabled())) {
            test.skip(true, 'IncludeReconcileJCs preference is off');
        }

        // Wait for the preview count to populate.
        await expect(reconcile.previewCount).not.toHaveText('');

        if (await reconcile.noMatchMessage.isVisible()) {
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

    // Quarantined (row enabled=0). The sidebar entry is absent while
    // accounting.export IS granted — reconfirmed failing in the CI dry run of
    // 2026-08-06 (run 31089496460) and tracked as BUG-14. This is an open
    // product question (permission-only vs permission+IncludeReconcileJCs
    // gating), not a settled bug — see the plan for why the assertion itself
    // is not adjusted.
    test('[Reconcile] Verify that the sidebar entry presence matches the accounting.export permission.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-005' },
            { type: 'requirement', description: 'E10-R4' },
        ],
    }, async ({ page, pages }) => {
        await pages.shell.gotoRoot();
        await page.waitForLoadState('networkidle');

        const hasPermission = await hasExportPermission(page);

        const sidebarLink = pages.shell.navLinkNamed('Reconcile Job Cards');
        if (hasPermission) {
            await expect(sidebarLink).toBeAttached();
        } else {
            await expect(sidebarLink).toHaveCount(0);
        }
    });

    test('[Reconcile] Verify that a direct URL redirects to the root when accounting.export is absent.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-006' },
            { type: 'requirement', description: 'E10-R5' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-007' },
            { type: 'requirement', description: 'E10-R6' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-008' },
            { type: 'requirement', description: 'E10-R7' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-009' },
            { type: 'requirement', description: 'E10-R8' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-010' },
            { type: 'requirement', description: 'E10-R9' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E10-011' },
            { type: 'requirement', description: 'E10-R9' },
        ],
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
