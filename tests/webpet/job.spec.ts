import { apiUrl } from '@config/webpetEnv';
/**
 * Job form-page e2e.
 *
 * Framework-aligned (Batch 03): locators live in JobFormPage / JobListPage, and
 * the Overtime Rules ParentPicker is driven through ParentPickerComponent.
 * Action order and assertions unchanged, including the two PET-60 skips.
 */
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

    test('[Job] Verify that Save is disabled until the required name and overtime rule are provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0229' },
    }, async ({ pages }) => {
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
        await form.footer.submitButton.click();
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        await expect(page).toHaveURL(/\/setup\/jobs\/new/);
    });

    // PET-60: includeIdleTime/actAsDeterminedByJobEnd are non-nullable booleans;
    // render as checkboxes with legacy NOT NULL DEFAULT values.
    test('[Job] Verify that the idle-time and job-end checkboxes render with their correct defaults.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0233' },
    }, async ({ pages }) => {
        test.skip(true, 'PET-60 checkbox boolean default/round-trip: shadcn Checkbox data-state + save round-trip needs rework — see OPEN_QUESTIONS.md (WEBPET-831).');
        const form = pages.jobForm;
        await form.gotoNew();
        await expect(form.includeIdleTimeCheckbox).toBeVisible();
        await expect(form.actAsDeterminedByJobEndCheckbox).toBeVisible();
        await expect(form.includeIdleTimeCheckbox).toHaveAttribute('data-state', 'checked');
        await expect(form.actAsDeterminedByJobEndCheckbox).toHaveAttribute('data-state', 'unchecked');
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

    // PET-60: toggling Include Idle Time + Acts as Determined by Job End on the
    // edit form round-trips through the API as pure booleans (never null).
    test('[Job] Verify that the idle-time and job-end checkboxes round-trip as booleans.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0238' },
    }, async ({ page, pages }) => {
        test.skip(true, 'PET-60 checkbox boolean default/round-trip: shadcn Checkbox data-state + save round-trip needs rework — see OPEN_QUESTIONS.md (WEBPET-831).');
        const form = pages.jobForm;
        const jobId = job.id;
        // page.request (not the `request` fixture) is deliberate — it carries the
        // browser context's cookies and the page's baseURL, which is what the
        // round-trip is verifying. See seed/TRIAGE-DELLLANO.md.
        const initial = await (await page.request.get(apiUrl(`/api/jobs/${jobId}`))).json();
        const originalIncludeIdle = initial.includeIdleTime;
        const originalActAs = initial.actAsDeterminedByJobEnd;
        expect(typeof originalIncludeIdle).toBe('boolean');
        expect(typeof originalActAs).toBe('boolean');

        try {
            await form.gotoEdit(jobId);
            await expect(form.includeIdleTimeCheckbox).toBeVisible();
            await form.includeIdleTimeCheckbox.click();
            await form.actAsDeterminedByJobEndCheckbox.click();
            await form.footer.submitButton.click();
            await page.waitForURL('**/setup/jobs');

            const afterFlip = await (await page.request.get(apiUrl(`/api/jobs/${jobId}`))).json();
            expect(typeof afterFlip.includeIdleTime).toBe('boolean');
            expect(typeof afterFlip.actAsDeterminedByJobEnd).toBe('boolean');
            expect(afterFlip.includeIdleTime).toBe(!originalIncludeIdle);
            expect(afterFlip.actAsDeterminedByJobEnd).toBe(!originalActAs);
        } finally {
            // Restore via PUT so subsequent runs start from known state.
            const current = await (await page.request.get(apiUrl(`/api/jobs/${jobId}`))).json();
            await page.request.put(apiUrl(`/api/jobs/${jobId}`), {
                data: {
                    active: current.active,
                    paymentType: current.paymentType,
                    overtimeRulesCounter: current.overtimeRulesCounter,
                    hourlyRate: current.hourlyRate ?? null,
                    pieceRate: current.pieceRate ?? null,
                    guaranteedRate: current.guaranteedRate ?? null,
                    minPiecesPerHour: current.minPiecesPerHour,
                    considerEmployeeRate: current.considerEmployeeRate,
                    startDate: current.startDate ?? null,
                    endDate: current.endDate ?? null,
                    workerCompCode: current.workerCompCode ?? null,
                    defaultLengthMinutes: current.defaultLengthMinutes ?? null,
                    defaultNumberOfPieces: current.defaultNumberOfPieces ?? null,
                    comment: current.comment ?? null,
                    paletteCount: current.paletteCount ?? null,
                    breakEvenCost: current.breakEvenCost ?? null,
                    lookBackPeriod: current.lookBackPeriod ?? null,
                    includeIdleTime: originalIncludeIdle,
                    actAsDeterminedByJobEnd: originalActAs,
                    version: current.version,
                    cropIds: current.cropIds ?? [],
                    jobGroups: (current.jobGroups ?? []).map(
                        (g: { jobGroupCounter: number; conversionFactor: number | null }) => ({
                            jobGroupCounter: g.jobGroupCounter,
                            conversionFactor: g.conversionFactor,
                        }),
                    ),
                    allowedEquipmentTypeIds: current.allowedEquipmentTypeIds ?? [],
                    jobRateHistory: (current.jobRateHistory ?? []).map(
                        (h: { rateDate: string; rate: number }) => ({
                            rateDate: h.rateDate,
                            rate: h.rate,
                        }),
                    ),
                },
            });
        }
    });

});
