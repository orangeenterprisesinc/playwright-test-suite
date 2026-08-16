/**
 * Job form-page e2e for Catalog workflow **A3 — Job setup and earning
 * codes**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A3 |
 * | Plan | `test-plans/journey-a/a03-job-setup-and-earning-codes.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A3-002`…`A3-012` (job-group forms continue the same A3 requirement family as `A3-013`…`A3-021` in `a03-job-group-form.spec.ts`) |
 *
 * Relocated from `tests/webpet/job.spec.ts` (WP-0228…WP-0238). Every
 * assertion below is the one that spec carried, in the same order and the
 * same describes; what changed is the fixture (`base.fixture`), the id/tag
 * vocabulary, and `beforeAll`/`afterAll` moving from webpet's `request`
 * fixture to `sessionApi`. `apiUrl` stays imported from `@config/webpetEnv`
 * for the round-trip GETs in `A3-012`.
 *
 * `A3-012` (WP-0238) is relocated but stays quarantined: `ensureJob` cannot
 * build a savable paymentType 8/15 job (see its inline comment), so the
 * round trip below is landed with `enabled=0` in the runner CSV rather than
 * repaired here. Provisioning inside the test now goes through `sessionApi`;
 * `page.request` stays for the round-trip GETs because those are verifying
 * the browser context's own cookies/baseURL, not a standalone API call.
 *
 * Two tests (`A3-002`, `A3-008`) both carried web-pet's `@wp-smoke` tag; a
 * journey file allows at most one `@Smoke`, so `A3-008` (the edit form
 * loading saved data) keeps it and `A3-002` (the new-form render) demotes to
 * `['@HighLevel', '@Regression']`.
 */
import { apiUrl } from '@config/webpetEnv';
import type { Locator } from '@playwright/test';
import { expect, test } from '@fixtures/base.fixture';
import { ensureJob, deleteJob, type EnsuredJob } from '@data/generated/data-factory';

// This file owns its own Job, created fresh via the API (no dependency on a
// seeded "0 - PISCA" / "0-Boxing" row). Assert against `job.*`, never a literal
// — that is what makes the file safe to run alongside others in parallel. See
// data-factory.ts.
let job: EnsuredJob;

test.beforeAll(async ({ sessionApi }) => {
    job = await ensureJob(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (job) await deleteJob(sessionApi, job.id);
});

// ── New Job Form ───────────────────────────────────────────────────────────────

test.describe('New job form', { tag: ['@JourneyA', '@A3'] }, () => {

    test('[Job] Verify that the new job form renders the expected fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-002' },
            { type: 'requirement', description: 'A3-R1' },
        ],
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.paymentTypeSelect).toBeVisible();
    });

    test('[Job] Verify that Save is disabled until the required name, overtime rule and hourly rate are provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-003' },
            { type: 'requirement', description: 'A3-R2|A3-R3|A3-R4' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-004' },
            { type: 'requirement', description: 'A3-R5' },
        ],
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoNew();
        await form.fillName('TestJob');
        await expect(form.exportIdentifierInput).toHaveValue('TestJob');
    });

    test('[Job] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-005' },
            { type: 'requirement', description: 'A3-R6|A3-R7' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-006' },
            { type: 'requirement', description: 'A3-R8|A3-R9' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.jobForm;
        // This file's own job name triggers a server 409 on submit.
        //
        // No dialog handler: the 409 has not surfaced via a native alert() since the
        // toast migration — it renders as a sonner error toast, asserted below.
        // Playwright auto-dismisses any dialog when no handler is registered, so
        // dropping it cannot hang the test.
        await form.gotoNew();
        await form.fillName(job.name);
        await form.pickFirstOvertimeRule();
        await form.hourlyRateInput.fill('10');
        // Blur, then wait for Save to actually open, before clicking it. Since
        // WEBPET-1831 validation runs on blur, and a bare fill() leaves Save
        // disabled until some other async re-validation happens to land — locally
        // that arrived ~1s later and the test passed, in CI it arrived before the
        // fill and Save never re-opened, so the click burned the whole timeout.
        await form.hourlyRateInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
        await form.footer.submitButton.click();

        // Assert the conflict is actually REPORTED, not just that the form survived.
        // Without this the test passed while the user saw nothing at all: during the
        // BUG-24 investigation the API stopped answering, the form sat on a disabled
        // "Saving..." forever, and the old two assertions below still held (Save was
        // eventually re-enabled and the URL never changed). The message is the point
        // of a negative test, so it is what gets asserted.
        await expect(pages.toasts.errorToasts.first()).toBeVisible({ timeout: 10000 });
        await expect(
            pages.toasts.message(/A job with this Name already exists/i),
        ).toBeVisible();

        // …and the user is left able to correct it, still on the create form.
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-007' },
            { type: 'requirement', description: 'A3-R10|A3-R11' },
        ],
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

test.describe('Edit job form', { tag: ['@JourneyA', '@A3'] }, () => {

    test('[Job] Verify that the edit form loads the existing job data.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-008' },
            { type: 'requirement', description: 'A3-R12' },
        ],
    }, async ({ pages }) => {
        const form = pages.jobForm;
        await form.gotoEdit(job.id);
        await expect(form.nameInput).toHaveValue(job.name);
        await expect(form.codeInput).toHaveValue(job.code);
    });

    test('[Job] Verify that the name, alias, code and export identifier are read-only.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-009' },
            { type: 'requirement', description: 'A3-R13' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-010' },
            { type: 'requirement', description: 'A3-R14' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.jobForm;
        await form.gotoEdit(job.id);
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/jobs');
    });

    test('[Job] Verify that a nonexistent job id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-011' },
            { type: 'requirement', description: 'A3-R15' },
        ],
    }, async ({ pages }) => {
        await pages.jobForm.gotoEdit(999999);
        await expect(pages.jobForm.notFoundMessage).toBeVisible();
    });

    // PET-60: toggling Include Idle Time / Acts as Determined by Job End on the
    // edit form round-trips through the API as pure booleans (never null). No
    // payment type renders both checkboxes (see A3-007), so each round-trips on
    // its own dedicated factory job — which also removes the old full-record
    // PUT-restore: the jobs are deleted, not restored.
    //
    // DISABLED in the runner (enabled=0), not skipped here, so the reason lives in
    // one place. This is a FIXTURE gap, not a product defect — an earlier note here
    // wrongly blamed product dirty-tracking, then WEBPET-1831 landed and disproved
    // it: a paymentType-0 job on this same edit form enables Save as soon as Hourly
    // Rate is filled. The blocker is that includeIdleTime only renders for
    // paymentType 8/15, and such a job carries a required-and-empty field that keeps
    // the form invalid — and POST /api/jobs rejects lookBackPeriod (400
    // invalid_body), so ensureJob cannot build a savable one. Identify that field
    // before re-enabling; the round-trip below is otherwise ready.
    test('[Job] Verify that the idle-time and job-end checkboxes round-trip as booleans.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A3-012' },
            { type: 'requirement', description: 'A3-R16|A3-R17' },
        ],
    }, async ({ page, pages, sessionApi }) => {
        const form = pages.jobForm;

        // page.request (not the `sessionApi` fixture) is deliberate — it carries the
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

        const jobIdle = await ensureJob(sessionApi, { namePrefix: 'E2EJobIdle', paymentType: 8 });
        try {
            await roundTrip(jobIdle.id, form.includeIdleTimeControl, 'includeIdleTime');
        } finally {
            await deleteJob(sessionApi, jobIdle.id);
        }

        const jobActAs = await ensureJob(sessionApi, { namePrefix: 'E2EJobActAs', paymentType: 1 });
        try {
            await roundTrip(jobActAs.id, form.actAsDeterminedByJobEndControl, 'actAsDeterminedByJobEnd');
        } finally {
            await deleteJob(sessionApi, jobActAs.id);
        }
    });

});
