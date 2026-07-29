import { test, expect } from './fixtures';

/**
 * PET-487 — Export to Accounting v2 (dispatch workspace) smoke test.
 *
 * Visits the page with `?pt-export-new-ia=true` so the v2 root selector
 * picks the new dispatch workspace. Mocks the Analyze response so the
 * test is stable regardless of dev-DB state. Does NOT fire the Run
 * endpoint (Cancel closes the confirm dialog) so JobCard flags are not
 * mutated by the smoke test.
 */

test.describe('Export to Accounting — v2 dispatch workspace', () => {
  test('flag on: page renders new chrome and Prepare populates readiness + queue', async ({
    page,
  }) => {
    await page.route('**/api/job-cards/export-to-accounting/candidates', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            summary: { matchedCount: 4 },
            preview: {
              rows: [
                makeRow(1, { exported: false, modifiedAfterExport: false }),
                makeRow(2, { exported: false, modifiedAfterExport: false }),
                makeRow(3, { exported: true, modifiedAfterExport: false }),
                makeRow(4, { exported: true, modifiedAfterExport: true }),
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

    await page.goto('/export-to-accounting?pt-export-new-ia=true');

    // v2 dispatch-workspace chrome. The workspace was redesigned since this spec
    // was written: the old run-header / readiness-strip / build-batch /
    // destination-panel are now a top strip + a scope→review→export "spine" +
    // readiness counters + the candidates grid. Assert the current chrome.
    await expect(page.getByTestId('export-v2-page')).toBeVisible();
    await expect(page.getByTestId('export-v2-top-strip')).toBeVisible();
    await expect(page.getByTestId('export-v2-spine')).toBeVisible();
    await expect(page.getByTestId('export-v2-grid')).toBeVisible();

    // Pre-analyze: the grid shows its pick-a-date-range empty state.
    await expect(page.getByTestId('export-v2-grid-empty-pick-range')).toBeVisible();

    // Pick a date range — this fires the analyze. The grid's DateRangePicker is
    // the shared #filter-dateTimeIn control (same as Reconcile). Note: in the
    // redesigned workspace the readiness counters are driven by the run-draft
    // (POST /runs), not the /candidates response — so we assert the counters
    // populate against real data rather than mocking fixed rows through a pipeline
    // that no longer feeds them.
    await page.locator('#filter-dateTimeIn').click();
    await page.getByRole('button', { name: 'Last 30 days' }).click();
    await page.getByRole('button', { name: /^Apply/i }).click();

    // After analyze the four readiness counters render with numeric counts.
    for (const c of ['pending', 'needsReexport', 'alreadyExported', 'warnings']) {
      await expect(page.getByTestId(`export-v2-counter-${c}`)).toContainText(/\d/);
    }
  });

  test('the pt-export-new-ia flag no longer falls back to the v1 page', async ({ page }) => {
    // The old test asserted `pt-export-new-ia=false` rendered the legacy v1 page
    // (export-preview-tabs). That toggle was removed: /export-to-accounting now
    // always serves the v2 dispatch workspace regardless of the flag (the v1
    // JobExportPage moved to its own route, /setup/exports/jobs). Assert the
    // flag-off URL still lands on v2.
    await page.goto('/export-to-accounting?pt-export-new-ia=false');
    await expect(page.getByTestId('export-v2-page')).toBeVisible();
  });
});

function makeRow(
  jobCardCounter: number,
  overrides: Partial<{ exported: boolean; modifiedAfterExport: boolean }>,
) {
  return {
    jobCardCounter,
    dateTimeIn: '2026-01-15T08:00:00Z',
    weekStart: '2026-01-12',
    dayStart: '2026-01-15',
    employeeName: `Employee ${jobCardCounter}`,
    crewName: '',
    departmentName: '',
    ranchName: '',
    fieldName: '',
    grossTime: 8,
    netTime: 8,
    hourlyRate: 15,
    amount: 120,
    exported: overrides.exported ?? false,
    exportedToCostAccounting: false,
    modifiedAfterExport: overrides.modifiedAfterExport ?? false,
    paymentType: 0,
    employeeExportId: 'E1',
    dateTimeOut: '2026-01-15T16:00:00Z',
    crewExportId: 'C1',
    jobExportId: 'J1',
    fieldExportId: 'F1',
    cropExportId: 'CR1',
    pieces: 0,
    pieceRate: 0,
  };
}
