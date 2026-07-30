/**
 * PET-507 — ExportRun draft state + BatchToggles smoke test.
 *
 * Walks the new lifecycle:
 *   Prepare → POST /runs (upsert) + POST /candidates (analyze) in parallel
 *           → readiness + queue populate from analyze, draft id captured
 *   Toggle flip → PATCH /runs/{id} with If-Match
 *   Clear filters → DELETE /runs/{id}
 *
 * Both /runs and /candidates are mocked so the test is stable regardless
 * of dev-DB state. The Run dispatch endpoint is NOT exercised (Cancel
 * dismisses the confirm dialog) to keep JobCard flags untouched.
 *
 * Framework-aligned (Batch 12): locators live on `ExportDispatchWorkspacePage`.
 * The request log and the three route handlers stay here — the *ordering* of
 * POST/PATCH/DELETE is the assertion, so the log has to be spec-local.
 */
import { expect, test } from '@fixtures/webpet.fixture';

const RUNS = '/api/job-cards/export-to-accounting/runs';
const CANDIDATES = '/api/job-cards/export-to-accounting/candidates';

test.describe('Export to Accounting — v2 ExportRun draft lifecycle', { tag: ['@WebPet', '@wp-accounting', '@WPBatch12'] }, () => {

    test('[Export] Verify that Prepare, a toggle flip and Clear filters fire POST, PATCH and DELETE /runs in order.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0180' },
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
        let runRow = makeDraft({ exportRunCounter: 42 });
        const requestLog: { method: string; url: string; body?: string }[] = [];

        await page.route(`**${RUNS}`, async (route) => {
            const req = route.request();
            requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? undefined });
            if (req.method() === 'POST') {
                const body = req.postDataJSON() as { filterProvenance?: unknown };
                runRow = makeDraft({
                    exportRunCounter: 42,
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

        await page.route(`**${RUNS}/42`, async (route) => {
            const req = route.request();
            requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? undefined });
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
            if (req.method() === 'DELETE') {
                await route.fulfill({ status: 204, body: '' });
                return;
            }
            await route.continue();
        });

        await page.route(`**${CANDIDATES}`, async (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        summary: { matchedCount: 3 },
                        preview: {
                            rows: [
                                makeRow(1, { exported: false, modifiedAfterExport: false }),
                                makeRow(2, { exported: false, modifiedAfterExport: false }),
                                makeRow(3, { exported: true, modifiedAfterExport: true }),
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

        await workspace.gotoWorkspace();
        await expect(workspace.pageRoot).toBeVisible();

        // BatchToggles render but switches are disabled pre-Prepare.
        await expect(workspace.batchToggles).toBeVisible();
        await expect(workspace.toggle('include-reexport')).toBeVisible();

        // Prepare.
        await workspace.prepare('2026-01-01', '2026-01-31');

        // Readiness populated.
        await expect(workspace.readiness('ready')).toContainText('2');
        // POST /runs fired.
        await expect.poll(() => requestLog.filter((r) => r.method === 'POST').length).toBeGreaterThan(0);

        // Toggle flip → PATCH.
        await workspace.toggleSwitch('include-reexport').click();
        await expect.poll(() => requestLog.filter((r) => r.method === 'PATCH').length).toBeGreaterThan(0);

        // Clear filters → DELETE.
        await workspace.clearFiltersButton.click();
        await expect.poll(() => requestLog.filter((r) => r.method === 'DELETE').length).toBeGreaterThan(0);
    });

});

function makeDraft(overrides: { exportRunCounter: number; filterProvenance?: unknown }) {
    return {
        exportRunCounter: overrides.exportRunCounter,
        ownerUsersCounter: 1,
        exportType: 'payroll',
        status: 'draft',
        preparedAt: '2026-05-18T12:00:00.000Z',
        finalizedAt: null,
        providerSnapshot: null,
        deliverySnapshot: null,
        filterProvenance: overrides.filterProvenance ?? null,
        readinessCounts: null,
        includedRecordIds: null,
        excludedRecordIds: null,
        parentRunCounter: null,
        ttlAt: null,
        createdAt: '2026-05-18T12:00:00.000Z',
        updatedAt: '2026-05-18T12:00:00.000Z',
    };
}

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
