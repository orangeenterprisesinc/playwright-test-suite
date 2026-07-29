import { test, expect } from './fixtures';

/**
 * PET-490 — Recent Exports surface smoke test.
 *
 * Mocks the list + outcomes endpoints so the test is stable regardless
 * of dev-DB state. Walks: open button → sheet renders list → click row →
 * drill-down renders with filter pills → back → list reappears.
 */

test.describe('Export to Accounting — v2 Recent Exports surface', () => {
  test('opens the right Sheet, shows the list, drills into a run, returns', async ({ page }) => {
    await page.route('**/api/job-cards/export-to-accounting/runs/list**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            runs: [makeRun(101), makeRun(102)],
            total: 2,
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/job-cards/export-to-accounting/runs/101/outcomes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            run: makeRun(101),
            outcomes: [
              { jobCardCounter: 1, status: 'succeeded', retryEligible: false },
              { jobCardCounter: 2, status: 'failed', retryEligible: true, reason: 'smtp' },
            ],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/export-to-accounting?pt-export-new-ia=true');
    await expect(page.getByTestId('export-v2-page')).toBeVisible();

    // Click the History button → Sheet opens with the list.
    await page.getByTestId('export-v2-history-button').click();
    await expect(page.getByTestId('export-v2-history-sheet')).toBeVisible();
    await expect(page.getByTestId('export-v2-history-row-101')).toBeVisible();

    // Click the first row → drill-down view.
    await page.getByTestId('export-v2-history-row-101').click();
    await expect(page.getByTestId('export-v2-history-detail')).toBeVisible();
    await expect(page.getByTestId('export-v2-history-outcome-1')).toBeVisible();
    await expect(page.getByTestId('export-v2-history-outcome-2')).toBeVisible();

    // Filter to failed.
    await page.getByTestId('export-v2-history-detail-filter-failed').click();
    await expect(page.getByTestId('export-v2-history-outcome-2')).toBeVisible();
    await expect(page.getByTestId('export-v2-history-outcome-1')).toHaveCount(0);

    // Back arrow returns to the list.
    await page.getByTestId('export-v2-history-detail-back').click();
    await expect(page.getByTestId('export-v2-history-row-101')).toBeVisible();
  });
});

function makeRun(exportRunCounter: number) {
  return {
    exportRunCounter,
    ownerUsersCounter: 1,
    exportType: 'payroll',
    status: 'finalized',
    preparedAt: '2026-05-19T12:00:00.000Z',
    finalizedAt: '2026-05-19T12:05:00.000Z',
    providerSnapshot: { provider: 'adp', providerLabel: 'ADP' },
    deliverySnapshot: { delivery: 'download' },
    filterProvenance: null,
    readinessCounts: null,
    includedRecordIds: [1, 2],
    excludedRecordIds: [],
    parentRunCounter: null,
    ttlAt: null,
    createdAt: '2026-05-19T12:00:00.000Z',
    updatedAt: '2026-05-19T12:05:00.000Z',
  };
}
