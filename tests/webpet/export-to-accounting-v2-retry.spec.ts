import { test, expect } from './fixtures';

/**
 * PET-492 — Retry workflow smoke test.
 *
 * Mocks the list + outcomes + run endpoints so the test is stable
 * regardless of dev-DB state. Walks: open Recent Exports → drill into a
 * run with failed outcomes → click "Retry failed" → assert POST /run
 * fires with the right jobCardCounterIds + parentRunCounter.
 */

test.describe('Export to Accounting — v2 Retry workflow', () => {
  test('Retry all failed dispatches POST /run with jobCardCounterIds + parentRunCounter', async ({
    page,
  }) => {
    const requestLog: { method: string; url: string; body: string | null }[] = [];

    await page.route('**/api/job-cards/export-to-accounting/runs/list**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ runs: [makeRun(303)], total: 1 }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/job-cards/export-to-accounting/runs/303/outcomes', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            run: makeRun(303),
            outcomes: [
              { jobCardCounter: 1, status: 'succeeded', retryEligible: false },
              { jobCardCounter: 2, status: 'failed', retryEligible: true, reason: 'smtp' },
              { jobCardCounter: 3, status: 'failed', retryEligible: true, reason: 'smtp' },
            ],
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/job-cards/export-to-accounting/run', async (route) => {
      const req = route.request();
      requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? null });
      if (req.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            summary: { matched: 2, exported: 2, failed: 0 },
            deliveredVia: 'download',
            downloadUrl: 'https://example.com/download/abc',
            downloadExpiresAt: '2026-05-19T13:00:00.000Z',
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/export-to-accounting?pt-export-new-ia=true');
    await expect(page.getByTestId('export-v2-page')).toBeVisible();

    // Open Recent Exports.
    await page.getByTestId('export-v2-history-button').click();
    await expect(page.getByTestId('export-v2-history-row-303')).toBeVisible();

    // Drill into the run with failed outcomes.
    await page.getByTestId('export-v2-history-row-303').click();
    await expect(page.getByTestId('export-v2-history-detail-retry-all')).toBeVisible();

    // Click Retry all → POST /run should fire with jobCardCounterIds + parentRunCounter.
    await page.getByTestId('export-v2-history-detail-retry-all').click();
    await expect
      .poll(() =>
        requestLog.filter(
          (r) =>
            r.method === 'POST' &&
            (r.body ?? '').includes('"jobCardCounterIds"') &&
            (r.body ?? '').includes('"parentRunCounter":303'),
        ).length,
      )
      .toBeGreaterThan(0);

    // The failed JobCardCounters (2, 3) should be in the body.
    const retryRequest = requestLog.find(
      (r) => r.method === 'POST' && (r.body ?? '').includes('parentRunCounter'),
    );
    expect(retryRequest?.body).toContain('"jobCardCounterIds":[2,3]');
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
    deliverySnapshot: { delivery: 'download', recipients: [] },
    filterProvenance: { from: '2026-05-01', to: '2026-05-31' },
    readinessCounts: null,
    includedRecordIds: [1, 2, 3],
    excludedRecordIds: [],
    parentRunCounter: null,
    ttlAt: null,
    createdAt: '2026-05-19T12:00:00.000Z',
    updatedAt: '2026-05-19T12:05:00.000Z',
  };
}
