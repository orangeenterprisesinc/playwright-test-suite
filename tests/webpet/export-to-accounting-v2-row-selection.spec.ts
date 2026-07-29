import { test, expect } from './fixtures';

/**
 * PET-489 — per-row include/exclude smoke test.
 *
 * Mocks the /runs + /candidates endpoints so the test is stable regardless
 * of dev-DB state. Walks Prepare → expand bucket → toggle a row checkbox →
 * verify PATCH fires with the expected `excludedRecordIds` payload → bulk
 * exclude → verify PATCH carries the full id list.
 */

test.describe('Export to Accounting — v2 per-row selection', () => {
  test('toggling a row PATCHes the draft with excludedRecordIds', async ({ page }) => {
    let runRow = makeDraft({ exportRunCounter: 77 });
    const requestLog: { method: string; url: string; body: string | null }[] = [];

    await page.route('**/api/job-cards/export-to-accounting/runs', async (route) => {
      const req = route.request();
      requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? null });
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as { filterProvenance?: unknown };
        runRow = makeDraft({
          exportRunCounter: 77,
          filterProvenance: body.filterProvenance ?? {},
        });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(runRow),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/job-cards/export-to-accounting/runs/77', async (route) => {
      const req = route.request();
      requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? null });
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(runRow),
        });
        return;
      }
      if (req.method() === 'PATCH') {
        const patchBody = req.postDataJSON() as Record<string, unknown>;
        runRow = {
          ...runRow,
          ...patchBody,
          updatedAt: new Date(Date.parse(runRow.updatedAt) + 1000).toISOString(),
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(runRow),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/job-cards/export-to-accounting/candidates', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            summary: { matchedCount: 3 },
            preview: {
              rows: [
                makeRow(101),
                makeRow(102),
                makeRow(103),
              ],
              truncated: false,
              cap: 200,
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/export-to-accounting?pt-export-new-ia=true');
    await expect(page.getByTestId('export-v2-page')).toBeVisible();

    // Prepare to populate the draft + Analyze rows.
    await page.getByTestId('export-filter-from').fill('2026-01-01');
    await page.getByTestId('export-filter-to').fill('2026-01-31');
    await page.getByTestId('export-analyze').click();

    await expect(page.getByTestId('export-v2-bucket-pending')).toBeVisible();

    // Expand the pending bucket so checkboxes render.
    await page.getByTestId('export-v2-bucket-pending-toggle').click();

    // Toggle one row's checkbox → should emit a PATCH with the row in excludedRecordIds.
    const checkbox = page.getByTestId('export-v2-bucket-pending-checkbox-101');
    await checkbox.click();
    await expect
      .poll(() =>
        requestLog.filter(
          (r) => r.method === 'PATCH' && (r.body ?? '').includes('"excludedRecordIds"'),
        ).length,
      )
      .toBeGreaterThan(0);

    // Bulk exclude — fires immediately, carrying all three ids.
    await page.getByTestId('export-v2-bucket-pending-bulk').click();
    await expect
      .poll(() =>
        requestLog.filter(
          (r) =>
            r.method === 'PATCH' &&
            (r.body ?? '').includes('101') &&
            (r.body ?? '').includes('102') &&
            (r.body ?? '').includes('103'),
        ).length,
      )
      .toBeGreaterThan(0);
  });
});

function makeDraft(overrides: { exportRunCounter: number; filterProvenance?: unknown }) {
  return {
    exportRunCounter: overrides.exportRunCounter,
    ownerUsersCounter: 1,
    exportType: 'payroll',
    status: 'draft',
    preparedAt: '2026-05-19T12:00:00.000Z',
    finalizedAt: null,
    providerSnapshot: null,
    deliverySnapshot: null,
    filterProvenance: overrides.filterProvenance ?? null,
    readinessCounts: null,
    includedRecordIds: [],
    excludedRecordIds: [],
    parentRunCounter: null,
    ttlAt: null,
    createdAt: '2026-05-19T12:00:00.000Z',
    updatedAt: '2026-05-19T12:00:00.000Z',
  };
}

function makeRow(jobCardCounter: number) {
  return {
    jobCardCounter,
    dateTimeIn: '2026-01-15T08:00:00Z',
    dateTimeOut: '2026-01-15T16:00:00Z',
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
    exported: false,
    exportedToCostAccounting: false,
    modifiedAfterExport: false,
    paymentType: 0,
    employeeExportId: 'E1',
    crewExportId: 'C1',
    jobExportId: 'J1',
    fieldExportId: 'F1',
    cropExportId: 'CR1',
    pieces: 0,
    pieceRate: 0,
  };
}
