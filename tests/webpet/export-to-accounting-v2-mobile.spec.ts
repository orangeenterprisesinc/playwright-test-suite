import { test, expect } from './fixtures';

/**
 * PET-491 — Export to Accounting v2 mobile-optimized layout smoke test.
 *
 * Runs at viewport 375×800 (iPhone SE-ish). Asserts that:
 *  - The inline Destination panel is hidden on mobile (replaced by the chip).
 *  - The DestinationSheet trigger chip is visible and tappable.
 *  - Tapping the chip opens the bottom sheet containing destination content.
 *  - The bottom CTA region is sticky-positioned so it remains accessible while
 *    the Review Queue scrolls.
 *
 * Mocks the Analyze response so the test is stable regardless of dev-DB state
 * and so the Review Queue has rows that justify the sticky-CTA check.
 */

test.describe('Export to Accounting — v2 mobile-optimized layout', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('mobile chrome shows the destination chip and opens the bottom sheet', async ({ page }) => {
    await page.route('**/api/job-cards/export-to-accounting/candidates', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            summary: { matchedCount: 1 },
            preview: {
              rows: [
                {
                  jobCardCounter: 1,
                  dateTimeIn: '2026-01-15T08:00:00Z',
                  weekStart: '2026-01-12',
                  dayStart: '2026-01-15',
                  employeeName: 'Mobile Tester',
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
                  dateTimeOut: '2026-01-15T16:00:00Z',
                  crewExportId: 'C1',
                  jobExportId: 'J1',
                  fieldExportId: 'F1',
                  cropExportId: 'CR1',
                  pieces: 0,
                  pieceRate: 0,
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

    await page.goto('/export-to-accounting?pt-export-new-ia=true');

    // The mobile destination chip is visible; the inline Destination panel is
    // hidden under `lg:` so its testid still exists (inside the sheet) but the
    // chip trigger sits in the main column.
    await expect(page.getByTestId('export-v2-destination-sheet-trigger')).toBeVisible();

    // The bottom CTA region is rendered with sticky positioning so it stays
    // visible at the bottom of the viewport.
    const cta = page.getByTestId('export-v2-cta-region');
    await expect(cta).toBeVisible();
    const stickyClass = await cta.getAttribute('class');
    expect(stickyClass).toContain('sticky');
    expect(stickyClass).toContain('bottom-0');

    // Tap the chip to open the bottom sheet.
    await page.getByTestId('export-v2-destination-sheet-trigger').click();
    await expect(page.getByTestId('export-v2-destination-sheet-content')).toBeVisible();

    // Destination panel renders the "not configured" empty state (Slice 1
    // baseline — destination wiring lands in Slice 2 / PET-488).
    await expect(page.getByTestId('export-v2-destination-not-configured')).toBeVisible();
  });

  test('readiness strip and review queue render in mobile layout', async ({ page }) => {
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
                  employeeName: 'Pending Row',
                  crewName: 'Crew A',
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
                  dateTimeOut: '2026-01-15T16:00:00Z',
                  crewExportId: 'C1',
                  jobExportId: 'J1',
                  fieldExportId: 'F1',
                  cropExportId: 'CR1',
                  pieces: 0,
                  pieceRate: 0,
                },
                {
                  jobCardCounter: 2,
                  dateTimeIn: '2026-01-15T08:00:00Z',
                  weekStart: '2026-01-12',
                  dayStart: '2026-01-15',
                  employeeName: 'Exported Row',
                  crewName: 'Crew B',
                  departmentName: '',
                  ranchName: '',
                  fieldName: '',
                  grossTime: 8,
                  netTime: 8,
                  hourlyRate: 15,
                  amount: 120,
                  exported: true,
                  exportedToCostAccounting: false,
                  modifiedAfterExport: false,
                  paymentType: 0,
                  employeeExportId: 'E2',
                  dateTimeOut: '2026-01-15T16:00:00Z',
                  crewExportId: 'C2',
                  jobExportId: 'J2',
                  fieldExportId: 'F2',
                  cropExportId: 'CR2',
                  pieces: 0,
                  pieceRate: 0,
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

    await page.goto('/export-to-accounting?pt-export-new-ia=true');

    // Readiness strip's four cards still render in the 2-col mobile grid.
    await expect(page.getByTestId('export-v2-readiness-ready')).toBeVisible();
    await expect(page.getByTestId('export-v2-readiness-needs-reexport')).toBeVisible();
    await expect(page.getByTestId('export-v2-readiness-already-exported')).toBeVisible();
    await expect(page.getByTestId('export-v2-readiness-warnings')).toBeVisible();

    // Fire Prepare so the Review Queue populates.
    await page.getByTestId('export-filter-from').fill('2026-01-01');
    await page.getByTestId('export-filter-to').fill('2026-01-31');
    await page.getByTestId('export-analyze').click();

    // Review Queue buckets render below the readiness strip.
    await expect(page.getByTestId('export-v2-bucket-pending')).toBeVisible();
    await expect(page.getByTestId('export-v2-bucket-already-exported')).toBeVisible();
  });
});
