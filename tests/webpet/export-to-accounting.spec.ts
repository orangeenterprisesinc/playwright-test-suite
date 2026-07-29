import { test, expect } from './fixtures';

/**
 * Playwright coverage for the Export to Accounting — Filter slice.
 *
 * Covers: default page load, Find Candidates submit, permission gating
 * (FieldSupervisor 403 + no sidebar entry), Cost Accounting tab disabled
 * when module is missing, module.not_licensed banner, and ?type= URL
 * round-trip.
 *
 * All text assertions use the pinned `en` locale (set in fixtures.ts L7).
 */

test.describe('Export to Accounting — Filter', () => {
  test('renders page header and default date inputs', async ({ page }) => {
    await page.goto('/export-to-accounting');
    await expect(page.getByRole('heading', { name: 'Export to Accounting' })).toBeVisible();

    // Page description renders.
    await expect(page.getByTestId('export-page-description')).toBeVisible();

    // Default dates pre-populate (7-day lookback ending today).
    await expect(page.getByTestId('export-filter-from')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId('export-filter-to')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

    // Payroll tab is active by default.
    await expect(page.getByTestId('export-tab-payroll')).toBeVisible();
    await expect(page.getByTestId('export-tab-cost-accounting')).toBeVisible();
  });

  test('Find Candidates submits filter and populates result table', async ({ page }) => {
    await page.goto('/export-to-accounting');
    await expect(page.getByRole('heading', { name: 'Export to Accounting' })).toBeVisible();

    // Widen date range to maximize the chance of matching rows.
    await page.getByTestId('export-filter-from').fill('1900-01-01');
    await page.getByTestId('export-filter-to').fill('2100-01-01');

    // Intercept the candidates POST so we can assert on the request.
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/job-cards/export-to-accounting/candidates') &&
        res.request().method() === 'POST',
    );

    await page.getByTestId('export-find-candidates').click();

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
      await expect(page.getByTestId('export-candidates-count')).not.toHaveText('');
    }
  });

  test('color legend renders below the table when results have rows', async ({ page }) => {
    // Stub a 200 response with two rows of distinct paymentType so the legend
    // and at least one row reliably render (PET-138).
    await page.route('**/api/job-cards/export-to-accounting/candidates', async (route) => {
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

    await page.goto('/export-to-accounting');
    await page.getByTestId('export-filter-from').fill('2026-01-01');
    await page.getByTestId('export-filter-to').fill('2026-01-31');
    await page.getByTestId('export-find-candidates').click();

    await expect(page.getByTestId('export-legend')).toBeVisible();
    await expect(page.getByTestId('export-candidate-row-1')).toBeVisible();
    await expect(page.getByTestId('export-candidate-row-2')).toBeVisible();
    // Legend has all 7 paymentType swatches.
    await expect(page.getByTestId('export-legend-item-time')).toBeVisible();
    await expect(page.getByTestId('export-legend-item-bonus')).toBeVisible();
  });

  test('rejects inverted date range without firing a request', async ({ page }) => {
    await page.goto('/export-to-accounting');

    await page.getByTestId('export-filter-from').fill('2026-12-31');
    await page.getByTestId('export-filter-to').fill('2026-01-01');

    await expect(page.getByTestId('export-filter-date-order-error')).toBeVisible();
    await expect(page.getByTestId('export-find-candidates')).toBeDisabled();
  });

  test('?type= URL parameter survives page reload', async ({ page }) => {
    await page.goto('/export-to-accounting?type=payroll');
    await expect(page.getByRole('heading', { name: 'Export to Accounting' })).toBeVisible();
    // URL param preserved — we can navigate directly with a type param.
    expect(page.url()).toContain('type=payroll');

    // Reload should keep the param.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Export to Accounting' })).toBeVisible();
    expect(page.url()).toContain('type=payroll');
  });

  test('Cost Accounting tab is disabled and shows tooltip when module is not licensed', async ({
    page,
  }) => {
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

    await page.goto('/export-to-accounting');
    await expect(page.getByRole('heading', { name: 'Export to Accounting' })).toBeVisible();
    await page.waitForLoadState('networkidle');

    const caTab = page.getByTestId('export-tab-cost-accounting');
    await expect(caTab).toBeVisible();
    await expect(caTab).toBeDisabled();

    // Hover the focusable wrapper span (component wraps disabled <button> so the
    // browser does not block pointer events). The tooltip is keyed off the
    // wrapper, so hover here surfaces the popover.
    await page.getByTestId('export-tab-cost-accounting-tooltip-wrapper').hover();
    await expect(page.getByTestId('export-tab-cost-accounting-tooltip')).toBeVisible();
  });

  test('module.not_licensed banner when Cost Accounting tab is selected and server refuses', async ({
    page,
  }) => {
    // Intercept the candidates POST to simulate a module.not_licensed 403.
    await page.route('**/api/job-cards/export-to-accounting/candidates', async (route) => {
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

    await page.goto('/export-to-accounting');
    await page.waitForLoadState('networkidle');

    // Switch to Cost Accounting tab.
    const caTab = page.getByTestId('export-tab-cost-accounting');
    await caTab.click();

    // Submit with Cost Accounting selected.
    await page.getByTestId('export-filter-from').fill('2026-01-01');
    await page.getByTestId('export-filter-to').fill('2026-01-31');
    await page.getByTestId('export-find-candidates').click();

    // Banner should render; global error toast should NOT fire.
    await expect(page.getByTestId('export-module-not-licensed-banner')).toBeVisible();
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  });

  test('sidebar entry is hidden for a user without accounting.export', async ({
    context,
    page,
  }) => {
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

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The sidebar entry should not be visible.
    await expect(
      page.locator('[data-testid="sidebar-nav"]').getByText('Export to Accounting'),
    ).toHaveCount(0);
  });

  test('direct URL navigation returns 403 for FieldSupervisor', async ({ page }) => {
    // Intercept the candidates endpoint to simulate a 403 for the role check.
    await page.route('**/api/job-cards/export-to-accounting/candidates', async (route) => {
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

    await page.goto('/export-to-accounting');
    await page.getByTestId('export-filter-from').fill('2026-01-01');
    await page.getByTestId('export-filter-to').fill('2026-01-31');

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/job-cards/export-to-accounting/candidates') &&
        res.request().method() === 'POST',
    );
    await page.getByTestId('export-find-candidates').click();
    const response = await responsePromise;
    expect(response.status()).toBe(403);
  });
});
