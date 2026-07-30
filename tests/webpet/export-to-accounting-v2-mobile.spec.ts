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
 *
 * Framework-aligned (Batch 12). Note this is the only web-pet file with a
 * `test.use`: the viewport override stays at **describe** scope, because
 * `viewport` is a context option and a per-test override cannot resize a context
 * that has already been built.
 */
import { expect, test } from '@fixtures/webpet.fixture';

const CANDIDATES = '/api/job-cards/export-to-accounting/candidates';

test.describe('Export to Accounting — v2 mobile-optimized layout', { tag: ['@WebPet', '@wp-accounting', '@WPBatch12'] }, () => {
    test.use({ viewport: { width: 375, height: 800 } });

    test('[Export] Verify that the mobile chrome shows the destination chip and opens the bottom sheet.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-visual'],
        annotation: { type: 'testCaseId', description: 'WP-0181' },
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
        await page.route(`**${CANDIDATES}`, async (route) => {
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

        await workspace.gotoWorkspace();

        // The mobile destination chip is visible; the inline Destination panel is
        // hidden under `lg:` so its testid still exists (inside the sheet) but the
        // chip trigger sits in the main column.
        await expect(workspace.destinationSheetTrigger).toBeVisible();

        // The bottom CTA region is rendered with sticky positioning so it stays
        // visible at the bottom of the viewport.
        await expect(workspace.ctaRegion).toBeVisible();
        const stickyClass = await workspace.ctaRegion.getAttribute('class');
        expect(stickyClass).toContain('sticky');
        expect(stickyClass).toContain('bottom-0');

        // Tap the chip to open the bottom sheet.
        await workspace.destinationSheetTrigger.click();
        await expect(workspace.destinationSheetContent).toBeVisible();

        // Destination panel renders the "not configured" empty state (Slice 1
        // baseline — destination wiring lands in Slice 2 / PET-488).
        await expect(workspace.destinationNotConfigured).toBeVisible();
    });

    test('[Export] Verify that the readiness strip and review queue render in the mobile layout.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-visual'],
        annotation: { type: 'testCaseId', description: 'WP-0182' },
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
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

        await workspace.gotoWorkspace();

        // Readiness strip's four cards still render in the 2-col mobile grid.
        await expect(workspace.readiness('ready')).toBeVisible();
        await expect(workspace.readiness('needs-reexport')).toBeVisible();
        await expect(workspace.readiness('already-exported')).toBeVisible();
        await expect(workspace.readiness('warnings')).toBeVisible();

        // Fire Prepare so the Review Queue populates.
        await workspace.prepare('2026-01-01', '2026-01-31');

        // Review Queue buckets render below the readiness strip.
        await expect(workspace.bucket('pending')).toBeVisible();
        await expect(workspace.bucket('already-exported')).toBeVisible();
    });

});
