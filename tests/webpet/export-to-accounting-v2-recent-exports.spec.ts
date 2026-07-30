/**
 * PET-490 — Recent Exports surface smoke test.
 *
 * Mocks the list + outcomes endpoints so the test is stable regardless
 * of dev-DB state. Walks: open button → sheet renders list → click row →
 * drill-down renders with filter pills → back → list reappears.
 *
 * Framework-aligned (Batch 12): locators live on `ExportDispatchWorkspacePage`.
 */
import { expect, test } from '@fixtures/webpet.fixture';

const RUNS = '/api/job-cards/export-to-accounting/runs';

test.describe('Export to Accounting — v2 Recent Exports surface', { tag: ['@WebPet', '@wp-accounting', '@WPBatch12'] }, () => {

    test('[Export] Verify that Recent Exports opens the Sheet, lists runs, drills into one and returns.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0183' },
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;

        await page.route(`**${RUNS}/list**`, async (route) => {
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

        await page.route(`**${RUNS}/101/outcomes`, async (route) => {
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

        await workspace.gotoWorkspace();
        await expect(workspace.pageRoot).toBeVisible();

        // Click the History button → Sheet opens with the list.
        await workspace.historyButton.click();
        await expect(workspace.historySheet).toBeVisible();
        await expect(workspace.historyRow(101)).toBeVisible();

        // Click the first row → drill-down view.
        await workspace.historyRow(101).click();
        await expect(workspace.historyDetail).toBeVisible();
        await expect(workspace.historyOutcome(1)).toBeVisible();
        await expect(workspace.historyOutcome(2)).toBeVisible();

        // Filter to failed.
        await workspace.historyDetailFilter('failed').click();
        await expect(workspace.historyOutcome(2)).toBeVisible();
        await expect(workspace.historyOutcome(1)).toHaveCount(0);

        // Back arrow returns to the list.
        await workspace.historyDetailBack.click();
        await expect(workspace.historyRow(101)).toBeVisible();
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
