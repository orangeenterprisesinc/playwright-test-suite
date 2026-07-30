/**
 * PET-489 — per-row include/exclude smoke test.
 *
 * Mocks the /runs + /candidates endpoints so the test is stable regardless
 * of dev-DB state. Walks Prepare → expand bucket → toggle a row checkbox →
 * verify PATCH fires with the expected `excludedRecordIds` payload → bulk
 * exclude → verify PATCH carries the full id list.
 *
 * Framework-aligned (Batch 12): locators live on `ExportDispatchWorkspacePage`.
 * Note the draft shape here is **not** the one in
 * `export-to-accounting-v2-exportrun.spec.ts` — this one seeds
 * `includedRecordIds`/`excludedRecordIds` as empty arrays rather than `null`,
 * which is what makes the PATCH payload assertion meaningful. That divergence is
 * why the two builders were not merged into one shared factory.
 */
import { expect, test } from '@fixtures/webpet.fixture';

const RUNS = '/api/job-cards/export-to-accounting/runs';
const CANDIDATES = '/api/job-cards/export-to-accounting/candidates';

test.describe('Export to Accounting — v2 per-row selection', { tag: ['@WebPet', '@wp-accounting', '@WPBatch12'] }, () => {

    test('[Export] Verify that toggling a row PATCHes the draft with excludedRecordIds.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0185' },
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
        let runRow = makeDraft({ exportRunCounter: 77 });
        const requestLog: { method: string; url: string; body: string | null }[] = [];

        await page.route(`**${RUNS}`, async (route) => {
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

        await page.route(`**${RUNS}/77`, async (route) => {
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

        await page.route(`**${CANDIDATES}`, async (route) => {
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

        await workspace.gotoWorkspace();
        await expect(workspace.pageRoot).toBeVisible();

        // Prepare to populate the draft + Analyze rows.
        await workspace.prepare('2026-01-01', '2026-01-31');

        await expect(workspace.bucket('pending')).toBeVisible();

        // Expand the pending bucket so checkboxes render.
        await workspace.bucketToggle('pending').click();

        // Toggle one row's checkbox → should emit a PATCH with the row in excludedRecordIds.
        await workspace.bucketCheckbox('pending', 101).click();
        await expect
            .poll(() =>
                requestLog.filter(
                    (r) => r.method === 'PATCH' && (r.body ?? '').includes('"excludedRecordIds"'),
                ).length,
            )
            .toBeGreaterThan(0);

        // Bulk exclude — fires immediately, carrying all three ids.
        await workspace.bucketBulk('pending').click();
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
