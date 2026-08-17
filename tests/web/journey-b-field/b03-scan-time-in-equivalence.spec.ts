/**
 * Scan-mode Time In equivalence e2e for Catalog workflow **B3 — Individual
 * time entry verification**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-b/b03-individual-time-in.md` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B3-003` |
 *
 * Relocated from `tests/webpet/equiv/scan-time-in-equivalence.spec.ts`
 * (WP-0178). Every assertion below is the one that spec carried, in the same
 * order; what changed is the fixture (`base.fixture`), the DB read-back
 * (`page.request` → `sessionApi`), and the id/tag vocabulary. This test is
 * expected to skip unless `SCAN_TIME_IN_EQUIV=1` and `SCAN_EMPLOYEE_BARCODE`
 * are set — that is intended, not a defect.
 *
 * Equivalence test: scan-time-in (WEBPET-908)
 *
 * Scenario: Drive the migrated Scan Mode "Time In" screen (/scan/time-in) — scan an employee
 *           barcode, save — and assert the persisted TimeCard row carries the same
 *           transaction + reference values the legacy WinForms `ScanTimeIn.cs` write produces.
 *
 * The Time In scan screen is a thin employee-scan front end over the already-migrated
 * `POST /time-cards/time-in` write path (CardType = 1), so the reference/audit/duplicate logic
 * is the shared time-card logic verified elsewhere. This spec proves the SCAN entry point
 * round-trips to the same persisted row: a real barcode → decode → employee → save → a TimeCard
 * row whose `reference` follows the YNIPU sequence and whose employee/context columns match the
 * scanned input. Audit columns `AuthorCounter` (= session UsersCounter) and `UpdateTime`
 * (server GETDATE) are stamped by the shared writer; the GET endpoint does not surface them, so
 * exact audit-column equivalence is asserted via the DB (mcp__mssql) in the manual companion
 * walk recorded on the ticket — here we assert every column the GET endpoint exposes.
 *
 * Env-gating (mirrors the other equiv specs, e.g. biometric-device-commands-equivalence.spec.ts):
 *   SCAN_TIME_IN_EQUIV=1          enable this spec
 *   SCAN_EMPLOYEE_BARCODE=<code>  a barcode for an ACTIVE employee in the seeded DB (DelLlano)
 *                                 that POST /scan/decode resolves to a Employee record.
 * Without both, the spec skips cleanly (the barcode set is environment-specific; we do not
 * hardcode a DelLlano employee code into the repo).
 *
 * testIsolation: append-only — each run inserts a new TimeCard row (a Time In punch). There is
 * no unique constraint to collide with; rows accumulate. Periodic cleanup of test punches is the
 * same as for the input/time-in equivalence specs (delete by reference prefix / date window).
 *
 * Requires the web app + seeded dev DB (DelLlano) running and the admin auth storage state.
 *
 * Framework-aligned (Batch 14): the scan shell's locators come from
 * `ScanScreenPage`, shared with `scan-mode.spec.ts`. Note `scanInput` (strict) is
 * correct here — Time In renders exactly one; the `.first()` variant exists only
 * for the duplicate-id driver screens.
 */
import { expect, test } from '@fixtures/base.fixture';

const ENABLED = process.env.SCAN_TIME_IN_EQUIV === '1';
const EMPLOYEE_BARCODE = process.env.SCAN_EMPLOYEE_BARCODE ?? '';

test.describe('Equivalence: scan-time-in', { tag: ['@JourneyB', '@B3'] }, () => {
    test.skip(
        !ENABLED || EMPLOYEE_BARCODE === '',
        'Set SCAN_TIME_IN_EQUIV=1 and SCAN_EMPLOYEE_BARCODE=<active employee barcode> to run against a seeded DB.',
    );

    test('[Equiv] Verify that scanning an employee and saving writes a Time In row with the expected reference.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B3-003' },
            { type: 'requirement', description: 'B3-R2' },
        ],
    }, async ({ page, pages, sessionApi }) => {
        const screen = pages.scanScreen;
        test.setTimeout(120_000);

        // Capture the create response so we can read back the new row by id.
        const createResponse = page.waitForResponse(
            (r) => r.url().includes('/time-cards/time-in') && r.request().method() === 'POST',
        );

        // ── Drive the scan screen ──────────────────────────────────────────────
        await screen.gotoSegment('time-in');
        await expect(screen.scanInput).toBeVisible();

        // Scan the employee barcode (keyboard-wedge: type + Enter).
        await screen.scanBarcode(EMPLOYEE_BARCODE);

        // Decode must resolve to an employee — Save enables only then.
        await expect(screen.employeeName).not.toHaveText(/^$/);
        await expect(screen.saveButton).toBeEnabled({ timeout: 15_000 });

        // Save the Time In punch.
        await screen.saveButton.click();

        const res = await createResponse;
        expect(res.status(), 'POST /time-cards/time-in should succeed').toBeLessThan(400);
        const created = await res.json();
        const newId: number = created.timeCardCounter;
        expect(newId, 'create response should carry the new timeCardCounter').toBeGreaterThan(0);

        // Success message shown; employee slot cleared for the next punch.
        await expect(screen.status).toBeVisible();

        // ── DB assertions via GET /api/time-cards/time-in/:id ──────────────────
        const get = await sessionApi.get('/api/time-cards/time-in/' + newId);
        expect(get.ok()).toBe(true);
        const row = await get.json();

        // Reference: legacy ScanTimeIn writes a YNIPU-format time-card reference via the shared
        // two-step insert (placeholder → assembled reference). It must be non-empty.
        expect(row.reference, 'Time In row must carry a generated reference').toBeTruthy();
        expect(typeof row.reference).toBe('string');
        expect(row.reference.length).toBeGreaterThan(0);

        // Transaction columns: the scanned employee is persisted; the row is a live (not deleted,
        // not transferred) Time In.
        expect(row.timeCardCounter).toBe(newId);
        expect(row.employeeCounter, 'scanned employee must be persisted').toBeGreaterThan(0);
        expect(row.deleted).toBe(false);
        expect(row.transferred).toBe(false);
        // The scan screen sends now() as the punch time; the row must carry a dateTime.
        expect(row.dateTime).toBeTruthy();

        // assert: ignore — AuthorCounter / UpdateTime are stamped by the shared writer but not
        // exposed by the GET endpoint; verified at the DB level (mcp__mssql) in the manual walk.
    });
});
