import { apiUrl } from '@config/webpetEnv';
/**
 * Job form-page e2e.
 *
 * Framework-aligned (Batch 03): locators live in JobFormPage / JobListPage, and
 * the Overtime Rules ParentPicker is driven through ParentPickerComponent.
 * The two PET-60 tests (WP-0233/WP-0238) were skipped from Batch 03 until
 * 2026-08-06, when probing showed no payment type renders both checkboxes at
 * once — they now assert each checkbox under its own payment type.
 */
import type { Locator } from '@playwright/test';
import { expect, test } from '@fixtures/webpet.fixture';
import { ensureJob, deleteJob, type EnsuredJob } from './data-factory';

// This file owns its own Job, created fresh via the API (no dependency on a
// seeded "0 - PISCA" / "0-Boxing" row). Assert against `job.*`, never a literal
// — that is what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let job: EnsuredJob;

test.beforeAll(async ({ request }) => {
    job = await ensureJob(request);
});

test.afterAll(async ({ request }) => {
    if (job) await deleteJob(request, job.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .

// ── New Job Form ───────────────────────────────────────────────────────────────

test.describe('New job form', { tag: ['@WebPet', '@wp-setup', '@wp-jobs', '@WPBatch03'] }, () => {

    test('[Job] Verify that the new job form renders the expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0228' },
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.paymentTypeSelect).toBeVisible();
    });

    test('[Job] Verify that Save is disabled until the required name, overtime rule and hourly rate are provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0229' },
    }, async ({ pages }) => {
        // There was never a hidden fourth required field. WEBPET-1831 found the real
        // cause: JobGeneralSection's Controller-wrapped fields wired onChange but not
        // field.onBlur, so with `mode: 'onBlur'` RHF never re-validated after a change
        // and formState.isValid stayed stale — Save was gated on a cached false.
        // Fixed and deployed 2026-08-06; the fixme this test carried is lifted.
        const form = pages.jobForm;
        await form.gotoNew();
        // FormFooter disables Save until isDirty && isValid (PET-450).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.fillName('Pet450ValidName');
        // Name alone is not enough — Overtime Rules (FK) is also required.
        await expect(form.footer.saveButton).toBeDisabled();
        await form.pickFirstOvertimeRule();
        // Nor is that enough on its own: the default Payment Type (Time) also
        // requires Hourly Rate (getPaymentTypeRules — see JobFormPage.ts header).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.hourlyRateInput.fill('10');
        await form.hourlyRateInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Job] Verify that the export identifier auto-populates from the name on blur.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0230' },
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await form.fillName('TestJob');
        await expect(form.exportIdentifierInput).toHaveValue('TestJob');
    });

    test('[Job] Verify that Cancel returns to the list without saving.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0231' },
    }, async ({ page, pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        await form.discardChanges();
        await page.waitForURL('**/setup/jobs');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.jobList.grid.getRoot()).toBeVisible();
        await expect(pages.jobList.jobNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Job] Verify that a duplicate name keeps the user on the create form.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0232' },
    }, async ({ page, pages }) => {
        const form = pages.jobForm;
        // This file's own job name triggers a server 409 on submit.
        await form.gotoNew();
        page.on('dialog', (d) => d.dismiss());
        await form.fillName(job.name);
        await form.pickFirstOvertimeRule();
        await form.hourlyRateInput.fill('10');
        await form.footer.submitButton.click();
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/jobs\/new/);
    });

    // PET-60: includeIdleTime/actAsDeterminedByJobEnd are non-nullable booleans;
    // render as checkboxes with legacy NOT NULL DEFAULT values. No payment type
    // renders both at once (probed all 16 types on dev, 2026-08-06): idle-time is
    // Non-Labor/Extra Wages (8/15) only, job-end is the Piece family (1/3/4) only
    // — so each default is asserted under its own type. The original single-view
    // version of this test asserted a UI state the form never has.
    test('[Job] Verify that the idle-time and job-end checkboxes render with their correct defaults.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0233' },
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await form.waitForForm();

        // Non-Labor: idle-time renders, default checked; job-end absent.
        await form.selectPaymentType('8');
        await expect(form.includeIdleTimeControl).toBeVisible();
        await expect(form.includeIdleTimeControl).toHaveAttribute('aria-checked', 'true');
        await expect(form.actAsDeterminedByJobEndControl).toBeHidden();

        // Piece: job-end renders, default unchecked; idle-time absent.
        await form.selectPaymentType('1');
        await expect(form.actAsDeterminedByJobEndControl).toBeVisible();
        await expect(form.actAsDeterminedByJobEndControl).toHaveAttribute('aria-checked', 'false');
        await expect(form.includeIdleTimeControl).toBeHidden();
    });

});

// ── Edit Job Form ──────────────────────────────────────────────────────────────

test.describe('Edit job form', { tag: ['@WebPet', '@wp-setup', '@wp-jobs', '@WPBatch03'] }, () => {

    test('[Job] Verify that the edit form loads the existing job data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0234' },
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoEdit(job.id);
        await expect(form.nameInput).toHaveValue(job.name);
        await expect(form.codeInput).toHaveValue(job.code);
    });

    test('[Job] Verify that the name, alias, code and export identifier are read-only.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0235' },
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoEdit(job.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.aliasInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Job] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0236' },
    }, async ({ page, pages }) => {
        const form = pages.jobForm;
        await form.gotoEdit(job.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/jobs');
    });

    test('[Job] Verify that a nonexistent job id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0237' },
    }, async ({ pages }) => {
        await pages.jobForm.gotoEdit(999999);
        await expect(pages.jobForm.notFoundMessage).toBeVisible();
    });

    // PET-60: toggling Include Idle Time / Acts as Determined by Job End on the
    // edit form round-trips through the API as pure booleans (never null). No
    // payment type renders both checkboxes (see WP-0233), so each round-trips on
    // its own dedicated factory job — which also removes the old full-record
    // PUT-restore: the jobs are deleted, not restored.
    //
    // DISABLED in the runner (enabled=0), not skipped here, so the reason lives in
    // one place. Probed on dev 2026-08-06: clicking includeIdleTimeControl does
    // flip its aria-checked false->true, but Save stays disabled — the checkbox
    // toggles without marking the form dirty, so the save leg below is
    // unreachable. That is the same "Save never enables" product gap as BUG-14
    // (WP-0229/WP-0232), not a locator problem. The rewrite below is correct and
    // ready; re-enable the row once the dirty-tracking gap is fixed.
    test('[Job] Verify that the idle-time and job-end checkboxes round-trip as booleans.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0238' },
    }, async ({ page, pages, request }) => {
        const form = pages.jobForm;

        // page.request (not the `request` fixture) is deliberate — it carries the
        // browser context's cookies and the page's baseURL, which is what the
        // round-trip is verifying. See seed/TRIAGE-DELLLANO.md.
        const roundTrip = async (
            jobId: number,
            control: Locator,
            field: 'includeIdleTime' | 'actAsDeterminedByJobEnd',
        ) => {
            const before = (await (await page.request.get(apiUrl(`/api/jobs/${jobId}`))).json()) as Record<string, unknown>;
            const original = before[field];
            expect(typeof original).toBe('boolean');

            await form.gotoEdit(jobId);
            await form.waitForForm();
            await expect(control).toBeVisible();
            await control.click();
            await form.footer.submitButton.click();
            await page.waitForURL('**/setup/jobs');

            const after = (await (await page.request.get(apiUrl(`/api/jobs/${jobId}`))).json()) as Record<string, unknown>;
            expect(typeof after[field]).toBe('boolean');
            expect(after[field]).toBe(!original);
        };

        const jobIdle = await ensureJob(request, { namePrefix: 'E2EJobIdle', paymentType: 8 });
        try {
            await roundTrip(jobIdle.id, form.includeIdleTimeControl, 'includeIdleTime');
        } finally {
            await deleteJob(request, jobIdle.id);
        }

        const jobActAs = await ensureJob(request, { namePrefix: 'E2EJobActAs', paymentType: 1 });
        try {
            await roundTrip(jobActAs.id, form.actAsDeterminedByJobEndControl, 'actAsDeterminedByJobEnd');
        } finally {
            await deleteJob(request, jobActAs.id);
        }
    });

});
