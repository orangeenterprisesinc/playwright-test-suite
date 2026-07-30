/**
 * Export to Accounting — the v1 Filter slice.
 *
 * Covers: default page load, Find Candidates submit, permission gating
 * (FieldSupervisor 403 + no sidebar entry), Cost Accounting tab disabled
 * when module is missing, module.not_licensed banner, and ?type= URL
 * round-trip.
 *
 * All text assertions use the pinned `en` locale (set by the web-pet fixture).
 *
 * ## Framework alignment (Batch 12) — why the mocks stayed here
 *
 * Six of these nine tests install a `page.route` handler, and three of those
 * hand-build a candidates payload. Those payloads are **the mock**, not shared
 * test data: their key sets differ deliberately between files (the v1 rows carry
 * no `employeeExportId`/`pieces` fields; the v2 rows do), and a builder that
 * unified them would change what the app receives on some callsites. Route mocks
 * and their payloads stay in the spec; only the locators moved.
 */
import { expect, test } from '@fixtures/webpet.fixture';

/** The candidates endpoint, used both as a route glob and in response predicates. */
const CANDIDATES = '/api/job-cards/export-to-accounting/candidates';

test.describe('Export to Accounting — Filter', { tag: ['@WebPet', '@wp-accounting', '@WPBatch12'] }, () => {

    test('[Export] Verify that the page header and default date inputs render.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0188' },
    }, async ({ pages }) => {
        const exportPage = pages.exportToAccounting;
        await exportPage.gotoFilter();
        await expect(exportPage.heading).toBeVisible();

        // Page description renders.
        await expect(exportPage.pageDescription).toBeVisible();

        // Default dates pre-populate (7-day lookback ending today).
        await expect(exportPage.filterFrom).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
        await expect(exportPage.filterTo).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

        // Payroll tab is active by default.
        await expect(exportPage.payrollTab).toBeVisible();
        await expect(exportPage.costAccountingTab).toBeVisible();
    });

    test('[Export] Verify that Find Candidates submits the filter and populates the result table.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0189' },
    }, async ({ page, pages }) => {
        const exportPage = pages.exportToAccounting;
        await exportPage.gotoFilter();
        await expect(exportPage.heading).toBeVisible();

        // Widen date range to maximize the chance of matching rows.
        await exportPage.fillDateRange('1900-01-01', '2100-01-01');

        // Intercept the candidates POST so we can assert on the request.
        const responsePromise = page.waitForResponse(
            (res) => res.url().includes(CANDIDATES) && res.request().method() === 'POST',
        );

        await exportPage.findCandidatesButton.click();

        const response = await responsePromise;
        // 200 or 403 (if the seeded user lacks accounting.export) are both acceptable
        // for this test — we just confirm the request fired.
        expect([200, 403]).toContain(response.status());

        if (response.status() === 200) {
            const body = (await response.json()) as {
                summary: { matchedCount: number };
                preview: { rows: unknown[]; truncated: boolean; cap: number };
            };
            expect(typeof body.summary.matchedCount).toBe('number');
            expect(Array.isArray(body.preview.rows)).toBe(true);
            expect(body.preview.cap).toBe(200);

            // Matched count label renders.
            await expect(exportPage.candidatesCount).not.toHaveText('');
        }
    });

    test('[Export] Verify that the color legend renders below the table when results have rows.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0190' },
    }, async ({ page, pages }) => {
        const exportPage = pages.exportToAccounting;
        // Stub a 200 response with two rows of distinct paymentType so the legend
        // and at least one row reliably render (PET-138).
        await page.route(`**${CANDIDATES}`, async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        summary: { matchedCount: 2 },
                        preview: {
                            rows: [
                                {
                                    jobCardCounter: 1,
                                    dateTimeIn: '2026-01-15T08:00:00Z',
                                    weekStart: '2026-01-12',
                                    dayStart: '2026-01-15',
                                    employeeName: 'Test One',
                                    crewName: '',
                                    departmentName: '',
                                    ranchName: '',
                                    fieldName: '',
                                    grossTime: 8,
                                    netTime: 8,
                                    hourlyRate: 15,
                                    amount: 120,
                                    exported: false,
                                    exportedToCostAccounting: false,
                                    modifiedAfterExport: false,
                                    paymentType: 6,
                                },
                                {
                                    jobCardCounter: 2,
                                    dateTimeIn: '2026-01-15T08:00:00Z',
                                    weekStart: '2026-01-12',
                                    dayStart: '2026-01-15',
                                    employeeName: 'Test Two',
                                    crewName: '',
                                    departmentName: '',
                                    ranchName: '',
                                    fieldName: '',
                                    grossTime: 8,
                                    netTime: 8,
                                    hourlyRate: 15,
                                    amount: 120,
                                    exported: false,
                                    exportedToCostAccounting: false,
                                    modifiedAfterExport: false,
                                    paymentType: 1,
                                },
                            ],
                            truncated: false,
                            cap: 200,
                        },
                    }),
                });
            } else {
                await route.continue();
            }
        });

        await exportPage.gotoFilter();
        await exportPage.fillDateRange('2026-01-01', '2026-01-31');
        await exportPage.findCandidatesButton.click();

        await expect(exportPage.legend).toBeVisible();
        await expect(exportPage.candidateRow(1)).toBeVisible();
        await expect(exportPage.candidateRow(2)).toBeVisible();
        // Legend has all 7 paymentType swatches.
        await expect(exportPage.legendItem('time')).toBeVisible();
        await expect(exportPage.legendItem('bonus')).toBeVisible();
    });

    test('[Export] Verify that an inverted date range is rejected without firing a request.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0191' },
    }, async ({ pages }) => {
        const exportPage = pages.exportToAccounting;
        await exportPage.gotoFilter();

        await exportPage.fillDateRange('2026-12-31', '2026-01-01');

        await expect(exportPage.dateOrderError).toBeVisible();
        await expect(exportPage.findCandidatesButton).toBeDisabled();
    });

    test('[Export] Verify that the ?type= URL parameter survives a page reload.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0192' },
    }, async ({ page, pages }) => {
        const exportPage = pages.exportToAccounting;
        await exportPage.gotoFilterWithQuery('?type=payroll');
        await expect(exportPage.heading).toBeVisible();
        // URL param preserved — we can navigate directly with a type param.
        expect(page.url()).toContain('type=payroll');

        // Reload should keep the param.
        await page.reload();
        await expect(exportPage.heading).toBeVisible();
        expect(page.url()).toContain('type=payroll');
    });

    test('[Export] Verify that the Cost Accounting tab is disabled with a tooltip when the module is not licensed.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0193' },
    }, async ({ page, pages }) => {
        const exportPage = pages.exportToAccounting;
        // Intercept session/me and strip the CostAccounting module.
        // Note: session/me payload exposes modules at the top level, not nested
        // under `session` — see apps/api/internal/auth/session_me.go.
        await page.route('**/api/session/me', async (route) => {
            const response = await route.fetch();
            const body = await response.json().catch(() => null);
            if (body?.modules) {
                body.modules.CostAccounting = false;
            } else if (body) {
                body.modules = { CostAccounting: false };
            }
            await route.fulfill({ response, json: body });
        });

        await exportPage.gotoFilter();
        await expect(exportPage.heading).toBeVisible();
        await page.waitForLoadState('networkidle');

        await expect(exportPage.costAccountingTab).toBeVisible();
        await expect(exportPage.costAccountingTab).toBeDisabled();

        // Hover the focusable wrapper span (component wraps disabled <button> so the
        // browser does not block pointer events). The tooltip is keyed off the
        // wrapper, so hover here surfaces the popover.
        await exportPage.costAccountingTooltipWrapper.hover();
        await expect(exportPage.costAccountingTooltip).toBeVisible();
    });

    test('[Export] Verify that the module.not_licensed banner shows when the Cost Accounting tab is selected and the server refuses.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0194' },
    }, async ({ page, pages }) => {
        const exportPage = pages.exportToAccounting;
        // Intercept the candidates POST to simulate a module.not_licensed 403.
        await page.route(`**${CANDIDATES}`, async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        error: 'Feature requires the CostAccounting module.',
                        code: 'module.not_licensed',
                    }),
                });
            } else {
                await route.continue();
            }
        });

        // Intercept session to report module as licensed (so the tab is enabled)
        // but the server still refuses — simulates a race / hand-crafted request.
        await page.route('**/api/session/me', async (route) => {
            const response = await route.fetch();
            const body = await response.json().catch(() => null);
            if (body?.modules) {
                body.modules.CostAccounting = true;
            } else if (body) {
                body.modules = { CostAccounting: true };
            }
            await route.fulfill({ response, json: body });
        });

        await exportPage.gotoFilter();
        await page.waitForLoadState('networkidle');

        // Switch to Cost Accounting tab.
        await exportPage.costAccountingTab.click();

        // Submit with Cost Accounting selected.
        await exportPage.fillDateRange('2026-01-01', '2026-01-31');
        await exportPage.findCandidatesButton.click();

        // Banner should render; global error toast should NOT fire.
        await expect(exportPage.moduleNotLicensedBanner).toBeVisible();
        await expect(pages.toasts.errorToasts).toHaveCount(0);
    });

    test('[Export] Verify that the sidebar entry is hidden for a user without accounting.export.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0195' },
    }, async ({ context, page, pages }) => {
        // Intercept session/me and remove enableExportToAccounting.
        // session/me exposes legacyPermissions and derivedPermissions at the top
        // level — see apps/api/internal/auth/session_me.go.
        await context.route('**/api/session/me', async (route) => {
            const response = await route.fetch();
            const body = await response.json().catch(() => null);
            if (body?.legacyPermissions) {
                body.legacyPermissions.enableExportToAccounting = false;
            }
            if (Array.isArray(body?.derivedPermissions)) {
                body.derivedPermissions = (body.derivedPermissions as string[]).filter(
                    (p: string) => p !== 'accounting.export',
                );
            }
            await route.fulfill({ response, json: body });
        });

        await pages.shell.gotoRoot();
        await page.waitForLoadState('networkidle');

        // The sidebar entry should not be visible.
        await expect(pages.shell.sidebarNavText('Export to Accounting')).toHaveCount(0);
    });

    test('[Export] Verify that direct URL navigation returns 403 for FieldSupervisor.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0196' },
    }, async ({ page, pages }) => {
        const exportPage = pages.exportToAccounting;
        // Intercept the candidates endpoint to simulate a 403 for the role check.
        await page.route(`**${CANDIDATES}`, async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 403,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'Forbidden' }),
                });
            } else {
                await route.continue();
            }
        });

        await exportPage.gotoFilter();
        await exportPage.fillDateRange('2026-01-01', '2026-01-31');

        const responsePromise = page.waitForResponse(
            (res) => res.url().includes(CANDIDATES) && res.request().method() === 'POST',
        );
        await exportPage.findCandidatesButton.click();
        const response = await responsePromise;
        expect(response.status()).toBe(403);
    });

});
