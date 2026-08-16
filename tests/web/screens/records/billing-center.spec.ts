// spec: test-plans/screens/records.md
// seed: tests/seed.spec.ts

/**
 * Billing Center form-page e2e — form-only coverage (list-page coverage moved
 * to setup-batch-b-smoke.spec.ts before this migration; not carried here).
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/records.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-105`…`SCR-110` |
 *
 * Relocated from `tests/webpet/billing-center.spec.ts` (WP-0001…WP-0006),
 * PET-213 (Billing Center CRUD, Grower Billing module-gated). Every assertion
 * below is the one that spec carried, in the same order and the same
 * describes; what changed is the fixture (`base.fixture`), the id and tag
 * vocabulary, `request` → `sessionApi`, and every module-gated guard.
 *
 * ## The silent-guard defect this migration fixes
 *
 * The source spec's `if (!(await form.gotoNewOrForbidden())) return;` and
 * `if (!listResp.ok()) return;` guards make a test **report "passed" while
 * asserting nothing** whenever GrowerBilling is not licensed — proved by
 * `docs/catalog/runs/31692620907-webpet.json` (4 "passed" / 2 skipped on this
 * env, when in fact none of the 6 tests ever reached an assertion: the 4
 * "new form" tests hit the 403 branch and returned before any `expect()`, and
 * the 2 "edit form" tests never found `TEST_NAME` because the create above
 * never ran). Every guard below is now `test.skip(true, '<reason>')` instead
 * of a bare `return`, so a run where the module is absent reports 6 explicit
 * skips — never a vacuous pass.
 *
 * Prerequisites (with GrowerBilling enabled):
 *   - dev server running:  cd apps/web && pnpm dev
 *   - API server running:  cd apps/api && go run .
 *   - PT_MODULES env includes "GrowerBilling"
 */
import { expect, test } from '@fixtures/base.fixture';

// The edit-form tests read back the record the create test makes, so the two
// describes below are one ordered sequence, not independent cases. The config
// is fullyParallel at workers=2, which splits a file's tests across workers —
// so without this the edit tests race the create test, find no record, and skip.
// That is exactly what they did on every run before this batch: the pinned run
// docs/catalog/runs/31692620907-webpet.json shows them skipping while the create
// test passed. Serial restores the order the original author assumed.
test.describe.configure({ mode: 'serial' });

const GROWER_BILLING_SKIP_REASON = 'GrowerBilling module not licensed on this environment (HTTP 403)';

// Unique per-run token: Customer_Name_Unique (and the Code/ExportIdentifier
// unique constraints) are NOT filtered by Deleted, so a soft-deleted ghost
// from a prior run permanently owns a fixed name/code/exportId — GET only
// lists Deleted = 0 rows, so cleanup-by-name can never find or clear it, and
// the create silently 500s. Mint a fresh identity every run instead of relying
// on a fixed name a ghost could be squatting on.
const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const TEST_NAME = `_PET213TestBillingCenter_${RUN_TOKEN}`;
const TEST_CODE = `BC${RUN_TOKEN}`;
const TEST_EXPORT_ID = `EXPBC${RUN_TOKEN}`;

// ── New Form ───────────────────────────────────────────────────────────────────

test.describe('Setup > Billing Center — new form', { tag: ['@Screens', '@Records'] }, () => {

    test('[Billing Center] Verify that the new form renders the name field.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-105' },
            { type: 'requirement', description: 'SCR-R135' },
        ],
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }
        await expect(form.nameInput).toBeVisible();
    });

    test('[Billing Center] Verify that Save is disabled until a required name is provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-106' },
            { type: 'requirement', description: 'SCR-R136' },
        ],
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }
        // FormFooter disables Save until isDirty && isValid (PET-450).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.fill('Pet450ValidName');
        // Form validates on blur (mode: 'onBlur'); blur so FormFooter enables Save.
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Billing Center] Verify that Cancel returns to the list.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-107' },
            { type: 'requirement', description: 'SCR-R137' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/billing-centers');
    });

    test('[Billing Center] Verify that creating a billing center navigates to the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-108' },
            { type: 'requirement', description: 'SCR-R138|SCR-R139' },
        ],
    }, async ({ pages }) => {
        const form = pages.billingCenterForm;
        if (!(await form.gotoNewOrForbidden())) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }

        await form.nameInput.fill(TEST_NAME);
        await form.codeInput.fill(TEST_CODE);
        await form.exportIdentifierInput.fill(TEST_EXPORT_ID);
        // See timesheet_validation.spec.ts: the old '**/billing-centers/**' glob also
        // matched /new. submit() resolves against editUrlPattern instead.
        expect(await form.submit()).toBe('created');
        await expect(form.nameInput).toHaveValue(TEST_NAME);
        // Name is read-only after first save.
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

});

// ── Edit Form ──────────────────────────────────────────────────────────────────

test.describe('Setup > Billing Center — edit form', { tag: ['@Screens', '@Records'] }, () => {

    test('[Billing Center] Verify that the name is read-only on an existing record.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-109' },
            { type: 'requirement', description: 'SCR-R140' },
        ],
    }, async ({ pages, sessionApi }) => {
        const form = pages.billingCenterForm;
        const listResp = await sessionApi.get('/api/billing-centers');
        if (!listResp.ok()) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }
        const items = (await listResp.json()) as { billingCenterCounter: number; name: string }[];
        const rec = items.find((bc) => bc.name === TEST_NAME);
        if (!rec) {
            test.skip(true, `Billing center "${TEST_NAME}" was not created — ${GROWER_BILLING_SKIP_REASON}`);
            return;
        }

        if (!(await form.gotoEditOrForbidden(rec.billingCenterCounter))) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }
        await expect(form.nameInput).toHaveAttribute('readonly', '');
    });

    test('[Billing Center] Verify that the active toggle can be flipped and saved.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-110' },
            { type: 'requirement', description: 'SCR-R141' },
        ],
    }, async ({ page, pages, sessionApi }) => {
        const form = pages.billingCenterForm;
        const listResp = await sessionApi.get('/api/billing-centers');
        if (!listResp.ok()) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }
        const items = (await listResp.json()) as { billingCenterCounter: number; name: string }[];
        const rec = items.find((bc) => bc.name === TEST_NAME);
        if (!rec) {
            test.skip(true, `Billing center "${TEST_NAME}" was not created — ${GROWER_BILLING_SKIP_REASON}`);
            return;
        }

        if (!(await form.gotoEditOrForbidden(rec.billingCenterCounter))) {
            test.skip(true, GROWER_BILLING_SKIP_REASON);
            return;
        }

        // The active toggle is in the page header extras. Click it to deactivate.
        // ActiveField uses a Switch — its role is 'switch'.
        await form.activeSwitch.click();
        await form.footer.submitButton.click();
        await page.waitForURL('**/setup/billing-centers');
    });

});
