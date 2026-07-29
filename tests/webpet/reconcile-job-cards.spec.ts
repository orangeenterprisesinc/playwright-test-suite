import { test, expect, type Page } from './fixtures';

/**
 * Coverage for the Reconcile Job Cards page (TTJC-aligned layout).
 *
 * Asserts the page renders, the preference gate works, the Reconcile
 * button is gated until a date scope is picked, the DateRangePicker (in
 * the grid's column-filter row) drives the preview fetch, and Reconcile
 * issues a POST /reconcile via the confirmation dialog.
 *
 * Server prereqs: PetData with IncludeReconcileJCs preference set true.
 */

// Open the date-range filter cell inside the grid header and apply a
// "Last 30 days" preset (the broadest preset that still references
// recent data). Returns true when the picker successfully applied;
// false when the preference gate is off (caller should test.skip).
async function openAndApplyLast30(page: Page): Promise<boolean> {
  if (await page.getByTestId('reconcile-disabled-banner').isVisible()) return false;
  await page.locator('#filter-dateTimeIn').click();
  await page.getByRole('button', { name: 'Last 30 days' }).click();
  await page.getByRole('button', { name: /^Apply/i }).click();
  return true;
}

test.describe('Reconcile Job Cards', () => {
  test('renders page header and respects the preference gate', async ({ page }) => {
    await page.goto('/reconcile-job-cards');
    await expect(page.getByRole('heading', { name: 'Reconcile Job Cards' })).toBeVisible();

    await page.waitForLoadState('networkidle');
    const bannerVisible = await page.getByTestId('reconcile-disabled-banner').isVisible();
    if (bannerVisible) {
      // Preference off — page chrome should NOT render.
      await expect(page.getByTestId('reconcile-submit')).toHaveCount(0);
    } else {
      // Preference on — Reconcile CTA is present (disabled until a
      // scope is picked).
      await expect(page.getByTestId('reconcile-submit')).toBeVisible();
      await expect(page.getByTestId('reconcile-submit')).toBeDisabled();
    }
  });

  test('shows pre-analyze prompt when no date range is selected', async ({ page }) => {
    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');
    if (await page.getByTestId('reconcile-disabled-banner').isVisible()) {
      test.skip(true, 'IncludeReconcileJCs preference is off');
    }
    // The grid renders its pre-analyze empty state with a clickable
    // "date range" link that opens the picker.
    await expect(page.getByTestId('reconcile-grid-empty-pick-range')).toBeVisible();
    // The wave-arrow hint points at the date column from the status
    // column's filter slot.
    await expect(page.getByTestId('reconcile-grid-pick-range-arrow')).toBeVisible();
  });

  test('renders page and runs reconcile against live API', async ({ page }) => {
    await page.goto('/reconcile-job-cards');
    await expect(page.getByRole('heading', { name: 'Reconcile Job Cards' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (!(await openAndApplyLast30(page))) {
      test.skip(true, 'IncludeReconcileJCs preference is off');
    }

    // Wait for the preview count to populate.
    await expect(page.getByTestId('reconcile-preview-count')).not.toHaveText('');

    if (await page.getByText('No job cards match this filter.').isVisible()) {
      test.skip(true, 'No JobCards in the last 30 days; cannot exercise the populated-grid branch.');
    }

    // Click Reconcile → confirmation dialog opens.
    await page.getByTestId('reconcile-submit').click();
    await expect(page.getByTestId('reconcile-confirm-dialog')).toBeVisible();

    const previewText = (await page.getByTestId('reconcile-preview-count').textContent()) ?? '';
    const matchedCount = Number.parseInt(previewText.replace(/[^\d]/g, ''), 10) || 0;
    if (matchedCount > 500) {
      await expect(page.getByTestId('reconcile-large-selection-warning')).toBeVisible();
    } else {
      await expect(page.getByTestId('reconcile-large-selection-warning')).toHaveCount(0);
    }

    // Confirm the run; expect POST /api/job-cards/reconcile with dryRun:false.
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/job-cards/reconcile') &&
        res.request().method() === 'POST' &&
        !(res.request().postData() ?? '').includes('"dryRun":true'),
    );
    await page.getByTestId('reconcile-confirm-submit').click();
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

    await expect(page.getByTestId('reconcile-summary-panel')).toBeVisible();
  });

  test('sidebar entry presence matches accounting.export permission', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const session = await page.evaluate(async () => {
      const res = await fetch('/api/session/me', { credentials: 'include' });
      return (await res.json()) as {
        derivedPermissions: string[];
        capabilities: { actions: Record<string, boolean> };
      };
    });
    const hasPermission =
      session.derivedPermissions.includes('accounting.export') ||
      session.capabilities.actions['accounting.export'] === true;

    const sidebarLink = page.getByRole('link', { name: 'Reconcile Job Cards' });
    if (hasPermission) {
      await expect(sidebarLink).toBeAttached();
    } else {
      await expect(sidebarLink).toHaveCount(0);
    }
  });

  test('direct URL redirects to / when accounting.export is absent', async ({ page }) => {
    await page.goto('/');
    const session = await page.evaluate(async () => {
      const res = await fetch('/api/session/me', { credentials: 'include' });
      return (await res.json()) as {
        derivedPermissions: string[];
        capabilities: { actions: Record<string, boolean> };
      };
    });
    const hasPermission =
      session.derivedPermissions.includes('accounting.export') ||
      session.capabilities.actions['accounting.export'] === true;

    if (hasPermission) {
      test.skip(
        true,
        'Seeded user has accounting.export; cannot exercise the redirect branch.',
      );
    }

    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/$/);
  });

  test('preference off keeps URL stable on /reconcile-job-cards and shows banner', async ({
    page,
  }) => {
    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');

    if (!(await page.getByTestId('reconcile-disabled-banner').isVisible())) {
      test.skip(true, 'IncludeReconcileJCs preference is on; cannot exercise the banner branch.');
    }

    await expect(page).toHaveURL(/\/reconcile-job-cards$/);
    await expect(page.getByTestId('reconcile-disabled-banner')).toBeVisible();
  });

  // ── Mocked POST /api/job-cards/reconcile branches ─────────────────────────

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

  const submitReconcile = async (page: Page) => {
    if (!(await openAndApplyLast30(page))) {
      test.skip(true, 'IncludeReconcileJCs preference is off');
    }
    await expect(page.getByTestId('reconcile-preview-count')).not.toHaveText('');
    if (await page.getByText('No job cards match this filter.').isVisible()) {
      test.skip(
        true,
        'No JobCards in the last 30 days; cannot exercise the submit + mocked-response flow.',
      );
    }
    await page.getByTestId('reconcile-submit').click();
    await expect(page.getByTestId('reconcile-confirm-dialog')).toBeVisible();
    await page.getByTestId('reconcile-confirm-submit').click();
  };

  test('summary panel renders inline failure rows when failures exist (mocked)', async ({
    page,
  }) => {
    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');
    if (await page.getByTestId('reconcile-disabled-banner').isVisible()) {
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

    await submitReconcile(page);

    await expect(page.getByTestId('reconcile-summary-panel')).toBeVisible();
    await expect(page.locator('[data-testid^="reconcile-row-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid^="reconcile-row-"]')).toHaveCount(2);
    await expect(page.getByTestId('reconcile-summary-download')).toBeVisible();
  });

  test('CSV download button absent when summary is all-clean (mocked)', async ({ page }) => {
    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');
    if (await page.getByTestId('reconcile-disabled-banner').isVisible()) {
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

    await submitReconcile(page);

    await expect(page.getByTestId('reconcile-summary-panel')).toBeVisible();
    await expect(page.getByTestId('reconcile-summary-all-good')).toBeVisible();
    await expect(page.getByTestId('reconcile-summary-download')).toHaveCount(0);
  });

  test('5xx response triggers an error toast and no summary panel (mocked)', async ({ page }) => {
    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');
    if (await page.getByTestId('reconcile-disabled-banner').isVisible()) {
      test.skip(true, 'IncludeReconcileJCs preference is off');
    }

    await mockReconcilePost(page, { status: 500, body: {} });

    await submitReconcile(page);

    await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('reconcile-summary-panel')).toHaveCount(0);
  });

  test('4xx response triggers an error toast and no summary panel (mocked)', async ({ page }) => {
    await page.goto('/reconcile-job-cards');
    await page.waitForLoadState('networkidle');
    if (await page.getByTestId('reconcile-disabled-banner').isVisible()) {
      test.skip(true, 'IncludeReconcileJCs preference is off');
    }

    await mockReconcilePost(page, { status: 400, body: { error: 'invalid request' } });

    await submitReconcile(page);

    await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByTestId('reconcile-summary-panel')).toHaveCount(0);
  });
});
