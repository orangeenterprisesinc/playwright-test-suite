/**
 * Export to Accounting — v2 dispatch workspace, draft lifecycle, Recent
 * Exports, Retry and per-row selection, for Catalog workflow **E9 — Payroll
 * export file**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-e/e09-payroll-export.md` |
 * | Runner rows | `src/data/runner/journey-e.csv` → `E9-011`…`E9-016` |
 *
 * Consolidates FIVE source specs, each of which held one describe on
 * `pages.exportWorkspace`. Every describe moved intact under its original
 * title, in source order:
 *   1. `tests/webpet/export-to-accounting-v2.spec.ts` (WP-0186, WP-0187)
 *   2. `tests/webpet/export-to-accounting-v2-exportrun.spec.ts` (WP-0180)
 *   3. `tests/webpet/export-to-accounting-v2-recent-exports.spec.ts` (WP-0183)
 *   4. `tests/webpet/export-to-accounting-v2-retry.spec.ts` (WP-0184)
 *   5. `tests/webpet/export-to-accounting-v2-row-selection.spec.ts` (WP-0185)
 *
 * Every assertion below is the one its source spec carried, in the same
 * order and the same describes; what changed is the fixture
 * (`base.fixture`), the id/tag vocabulary, and wrapping every `page.route`
 * registration in `guardTeardownRace` (`base.fixture` does not swallow the
 * "…has been closed" teardown race that `webpet.fixture` did — see
 * `src/utils/routeGuard.ts`).
 *
 * ### The consolidated builders were suffixed, never unified
 *
 * The five sources each declare module-scope mock builders that collide by
 * name across files with DIFFERENT shapes — e.g. the `-exportrun` draft
 * seeds `includedRecordIds`/`excludedRecordIds` as `null`, while the
 * `-row-selection` draft seeds `[]`, which is what makes that file's PATCH
 * payload assertion meaningful. Unifying them into one shared factory would
 * silently change what an assertion proves, so each is renamed with a
 * source-derived suffix instead, bodies kept byte-identical: `makeAnalyzeRow`
 * (from `-v2`), `makeLifecycleDraft`/`makeLifecycleRow` (from `-exportrun`),
 * `makeHistoryRun` (from `-recent-exports`), `makeRetryRun` (from `-retry`),
 * `makeSelectionDraft`/`makeSelectionRow` (from `-row-selection`). The
 * route-path constants `CANDIDATES` and `RUNS` are textually identical
 * across every source that declares them, so each is declared once here and
 * shared; `RUN` is unique to the retry source and keeps its name.
 *
 * `E9-013` (WP-0180) and `E9-016` (WP-0185) are quarantined (`enabled=0`) —
 * see the comment above each of those two tests.
 */
import { expect, test } from '@fixtures/base.fixture';
import { guardTeardownRace } from '@utils/routeGuard';

const CANDIDATES = '/api/job-cards/export-to-accounting/candidates';
const RUNS = '/api/job-cards/export-to-accounting/runs';

test.describe('Export to Accounting — v2 dispatch workspace', { tag: ['@JourneyE', '@E9'] }, () => {

    test('[Export] Verify that the v2 chrome renders and Prepare populates readiness and queue.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E9-011' },
            { type: 'requirement', description: 'E9-R10' },
        ],
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;

        await page.route(`**${CANDIDATES}`, guardTeardownRace(async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        summary: { matchedCount: 4 },
                        preview: {
                            rows: [
                                makeAnalyzeRow(1, { exported: false, modifiedAfterExport: false }),
                                makeAnalyzeRow(2, { exported: false, modifiedAfterExport: false }),
                                makeAnalyzeRow(3, { exported: true, modifiedAfterExport: false }),
                                makeAnalyzeRow(4, { exported: true, modifiedAfterExport: true }),
                            ],
                            truncated: false,
                            cap: 200,
                        },
                    }),
                });
            } else {
                await route.continue();
            }
        }));

        await workspace.gotoWorkspace();

        // v2 dispatch-workspace chrome. The workspace was redesigned since this spec
        // was written: the old run-header / readiness-strip / build-batch /
        // destination-panel are now a top strip + a scope→review→export "spine" +
        // readiness counters + the candidates grid. Assert the current chrome.
        await expect(workspace.pageRoot).toBeVisible();
        await expect(workspace.topStrip).toBeVisible();
        await expect(workspace.spine).toBeVisible();
        await expect(workspace.grid).toBeVisible();

        // Pre-analyze: the grid shows its pick-a-date-range empty state.
        await expect(workspace.gridEmptyPickRange).toBeVisible();

        // Pick a date range — this fires the analyze. The grid's DateRangePicker is
        // the shared #filter-dateTimeIn control (same as Reconcile). Note: in the
        // redesigned workspace the readiness counters are driven by the run-draft
        // (POST /runs), not the /candidates response — so we assert the counters
        // populate against real data rather than mocking fixed rows through a pipeline
        // that no longer feeds them.
        await workspace.dateRange.applyPreset('Last 30 days');

        // After analyze the four readiness counters render with numeric counts.
        for (const c of ['pending', 'needsReexport', 'alreadyExported', 'warnings']) {
            await expect(workspace.counter(c)).toContainText(/\d/);
        }
    });

    test('[Export] Verify that the pt-export-new-ia flag no longer falls back to the v1 page.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E9-012' },
            { type: 'requirement', description: 'E9-R11' },
        ],
    }, async ({ pages }) => {
        const workspace = pages.exportWorkspace;
        // The old test asserted `pt-export-new-ia=false` rendered the legacy v1 page
        // (export-preview-tabs). That toggle was removed: /export-to-accounting now
        // always serves the v2 dispatch workspace regardless of the flag (the v1
        // JobExportPage moved to its own route, /setup/exports/jobs). Assert the
        // flag-off URL still lands on v2.
        await workspace.gotoWithFlag('false');
        await expect(workspace.pageRoot).toBeVisible();
    });

});

function makeAnalyzeRow(
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

test.describe('Export to Accounting — v2 ExportRun draft lifecycle', { tag: ['@JourneyE', '@E9'] }, () => {

    // Quarantined (row enabled=0). Reconfirmed failing in the CI dry run of
    // 2026-08-06 (run 31089496460): draft-lifecycle testid present but not
    // rendering under this flow. Export-UI rework pending a product decision,
    // BUG-18.
    test('[Export] Verify that Prepare, a toggle flip and Clear filters fire POST, PATCH and DELETE /runs in order.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E9-013' },
            { type: 'requirement', description: 'E9-R12' },
        ],
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
        let runRow = makeLifecycleDraft({ exportRunCounter: 42 });
        const requestLog: { method: string; url: string; body?: string }[] = [];

        await page.route(`**${RUNS}`, guardTeardownRace(async (route) => {
            const req = route.request();
            requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? undefined });
            if (req.method() === 'POST') {
                const body = req.postDataJSON() as { filterProvenance?: unknown };
                runRow = makeLifecycleDraft({
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
        }));

        await page.route(`**${RUNS}/42`, guardTeardownRace(async (route) => {
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
        }));

        await page.route(`**${CANDIDATES}`, guardTeardownRace(async (route) => {
            const req = route.request();
            if (req.method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        summary: { matchedCount: 3 },
                        preview: {
                            rows: [
                                makeLifecycleRow(1, { exported: false, modifiedAfterExport: false }),
                                makeLifecycleRow(2, { exported: false, modifiedAfterExport: false }),
                                makeLifecycleRow(3, { exported: true, modifiedAfterExport: true }),
                            ],
                            truncated: false,
                            cap: 200,
                        },
                    }),
                });
                return;
            }
            await route.continue();
        }));

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

function makeLifecycleDraft(overrides: { exportRunCounter: number; filterProvenance?: unknown }) {
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

function makeLifecycleRow(
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

test.describe('Export to Accounting — v2 Recent Exports surface', { tag: ['@JourneyE', '@E9'] }, () => {

    test('[Export] Verify that Recent Exports opens the Sheet, lists runs, drills into one and returns.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E9-014' },
            { type: 'requirement', description: 'E9-R13' },
        ],
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;

        await page.route(`**${RUNS}/list**`, guardTeardownRace(async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        runs: [makeHistoryRun(101), makeHistoryRun(102)],
                        total: 2,
                    }),
                });
                return;
            }
            await route.continue();
        }));

        await page.route(`**${RUNS}/101/outcomes`, guardTeardownRace(async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        run: makeHistoryRun(101),
                        outcomes: [
                            { jobCardCounter: 1, status: 'succeeded', retryEligible: false },
                            { jobCardCounter: 2, status: 'failed', retryEligible: true, reason: 'smtp' },
                        ],
                    }),
                });
                return;
            }
            await route.continue();
        }));

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

function makeHistoryRun(exportRunCounter: number) {
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

const RUN = '/api/job-cards/export-to-accounting/run';

test.describe('Export to Accounting — v2 Retry workflow', { tag: ['@JourneyE', '@E9'] }, () => {

    test('[Export] Verify that Retry all failed dispatches POST /run with jobCardCounterIds and parentRunCounter.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E9-015' },
            { type: 'requirement', description: 'E9-R14' },
        ],
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
        const requestLog: { method: string; url: string; body: string | null }[] = [];

        await page.route(`**${RUNS}/list**`, guardTeardownRace(async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ runs: [makeRetryRun(303)], total: 1 }),
                });
                return;
            }
            await route.continue();
        }));

        await page.route(`**${RUNS}/303/outcomes`, guardTeardownRace(async (route) => {
            if (route.request().method() === 'GET') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        run: makeRetryRun(303),
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
        }));

        await page.route(`**${RUN}`, guardTeardownRace(async (route) => {
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
        }));

        await workspace.gotoWorkspace();
        await expect(workspace.pageRoot).toBeVisible();

        // Open Recent Exports.
        await workspace.historyButton.click();
        await expect(workspace.historyRow(303)).toBeVisible();

        // Drill into the run with failed outcomes.
        await workspace.historyRow(303).click();
        await expect(workspace.historyDetailRetryAll).toBeVisible();

        // Click Retry all → POST /run should fire with jobCardCounterIds + parentRunCounter.
        await workspace.historyDetailRetryAll.click();
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

function makeRetryRun(exportRunCounter: number) {
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

test.describe('Export to Accounting — v2 per-row selection', { tag: ['@JourneyE', '@E9'] }, () => {

    // Quarantined (row enabled=0). Reconfirmed failing in the CI dry run of
    // 2026-08-06 (run 31089496460): same cause as E9-013 — draft-lifecycle
    // testid present but not rendering under this flow. Export-UI rework
    // pending a product decision, BUG-18.
    test('[Export] Verify that toggling a row PATCHes the draft with excludedRecordIds.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'E9-016' },
            { type: 'requirement', description: 'E9-R15' },
        ],
    }, async ({ page, pages }) => {
        const workspace = pages.exportWorkspace;
        let runRow = makeSelectionDraft({ exportRunCounter: 77 });
        const requestLog: { method: string; url: string; body: string | null }[] = [];

        await page.route(`**${RUNS}`, guardTeardownRace(async (route) => {
            const req = route.request();
            requestLog.push({ method: req.method(), url: req.url(), body: req.postData() ?? null });
            if (req.method() === 'POST') {
                const body = req.postDataJSON() as { filterProvenance?: unknown };
                runRow = makeSelectionDraft({
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
        }));

        await page.route(`**${RUNS}/77`, guardTeardownRace(async (route) => {
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
        }));

        await page.route(`**${CANDIDATES}`, guardTeardownRace(async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        summary: { matchedCount: 3 },
                        preview: {
                            rows: [
                                makeSelectionRow(101),
                                makeSelectionRow(102),
                                makeSelectionRow(103),
                            ],
                            truncated: false,
                            cap: 200,
                        },
                    }),
                });
                return;
            }
            await route.continue();
        }));

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

function makeSelectionDraft(overrides: { exportRunCounter: number; filterProvenance?: unknown }) {
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

function makeSelectionRow(jobCardCounter: number) {
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
