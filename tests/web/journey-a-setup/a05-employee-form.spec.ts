/**
 * Employee form-page e2e for Catalog workflow **A5 — Employee setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A5 |
 * | Plan | `test-plans/journey-a/a05-employee-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A5-002`…`A5-017` |
 *
 * Relocated from `tests/webpet/employee.spec.ts` (WP-0145…WP-0158, WP-0407,
 * WP-0408). Every assertion below is the one that spec carried, in the same
 * order and the same describes; what changed is the fixture (`base.fixture`),
 * the id/tag vocabulary, and `beforeAll`/`afterAll` moving from webpet's
 * `request` fixture to `sessionApi`.
 *
 * Two tests (`A5-002`, `A5-010`) both carried web-pet's `@wp-smoke` tag; a
 * journey file allows at most one `@Smoke`, so `A5-010` (the edit form loading
 * saved data) keeps it and `A5-002` (the new-form render) demotes to
 * `['@HighLevel', '@Regression']`.
 *
 * `A5-013` (WP-0408) keeps its whole-test env gate verbatim — `test.skip` on
 * missing `WEBPET_NONSU_USER`/`WEBPET_NONSU_PASSWORD` — and its temp-employee
 * cleanup stays in a `finally`, not `afterAll`: Employee has no purge endpoint
 * (WEBPET-1798), so a soft-deleted name would be stuck forever if the delete
 * were hoisted and never ran on a mid-file failure.
 */
import { expect, test } from '@fixtures/base.fixture';
import {
    ensureCrew,
    deleteCrew,
    ensureDepartment,
    deleteDepartment,
    ensureEmployee,
    deleteEmployee,
    type EnsuredCrew,
    type EnsuredDepartment,
    type EnsuredEmployee,
} from '@data/generated/data-factory';
import { API_BASE_URL, WEB_BASE_URL, WEBPET_NONSU_USER, WEBPET_NONSU_PASSWORD } from '@config/webpetEnv';
import { EmployeeFormPage } from '@pages/webpet/setup/EmployeeFormPage';
import { request as pwRequest } from '@playwright/test';

// This file creates its own Department + Crew + Employee via the API instead of
// depending on shared hardcoded rows ("Locker, Mather" id=5, "ADP 5", "Crew 01")
// that don't reliably exist in every client DB and collide across parallel
// workers. Assert against the returned values (emp.*, dept.*, crew.*), never a
// literal. See data-factory.ts.
let dept: EnsuredDepartment;
let crew: EnsuredCrew;
let emp: EnsuredEmployee;

test.beforeAll(async ({ sessionApi }) => {
    dept = await ensureDepartment(sessionApi);
    crew = await ensureCrew(sessionApi);
    emp = await ensureEmployee(sessionApi, { department: { id: dept.id, name: dept.name } });
});

test.afterAll(async ({ sessionApi }) => {
    // Delete the employee first — it FK-references the crew/department.
    if (emp) await deleteEmployee(sessionApi, emp.id);
    if (crew) await deleteCrew(sessionApi, crew.id);
    if (dept) await deleteDepartment(sessionApi, dept.id);
});

// Field labels use aliases from the Preferences table.
// These tests assume defaults: Employee = "Employee".

// ── New Employee Form ──────────────────────────────────────────────────────────

test.describe('New employee form', { tag: ['@JourneyA', '@A5'] }, () => {

    test('[Employee] Verify that the new employee form renders all expected fields.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-002' },
            { type: 'requirement', description: 'A5-R1' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await expect(form.nameInput).toBeVisible();
        await expect(form.codeInput).toBeVisible();
        await expect(form.exportIdentifierInput).toBeVisible();
        await expect(form.firstNameInput).toBeVisible();
        await expect(form.lastNameInput).toBeVisible();
        // Department and Crew are now ParentPicker comboboxes.
        await expect(form.departmentPicker.comboboxInput).toBeVisible();
        await expect(form.crewPicker.comboboxInput).toBeVisible();
        await expect(form.activeCheckbox).toBeVisible();
    });

    test('[Employee] Verify that the department dropdown is populated from the database.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-003' },
            { type: 'requirement', description: 'A5-R2' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.departmentPicker.openCombobox();
        // Assert our own department shows up — proves the dropdown is DB-populated
        // without depending on a specific seeded name.
        await expect(form.departmentPicker.comboboxOptionByText(dept.name)).toBeVisible();
    });

    test('[Employee] Verify that the crew dropdown is populated from the database.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-004' },
            { type: 'requirement', description: 'A5-R3' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.crewPicker.openCombobox();
        await expect(form.crewPicker.comboboxOptionByText(crew.name)).toBeVisible();
    });

    test('[Employee] Verify that Save is disabled until a required name is provided.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-005' },
            { type: 'requirement', description: 'A5-R4' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        // FormFooter disables Save until isDirty && isValid (PET-450).
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.click();
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeDisabled();
        await form.nameInput.fill('Pet450ValidName');
        // Form validates on blur (mode: 'onBlur'); blur so isValid recomputes and
        // FormFooter enables Save.
        await form.nameInput.blur();
        await expect(form.footer.saveButton).toBeEnabled();
    });

    test('[Employee] Verify that the export identifier stays empty after a name blur (GAP-016 fix).', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-006' },
            { type: 'requirement', description: 'A5-R5' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        // Legacy EmployeeForm.cs does NOT auto-fill ExportIdentifier from Name.
        // The web divergence (handleNameBlur) was removed in PET-581.
        await form.gotoNew();
        await form.fillName('TestEmp');
        await expect(form.exportIdentifierInput).toHaveValue('');
    });

    test('[Employee] Verify that a manually filled export identifier is not overwritten.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-007' },
            { type: 'requirement', description: 'A5-R6' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        // Guard against a future regression that re-introduces the auto-fill:
        // a manually entered ExportIdentifier must never be clobbered by name blur.
        await form.gotoNew();
        await form.exportIdentifierInput.fill('ManualId');
        await form.fillName('TestEmp');
        await expect(form.exportIdentifierInput).toHaveValue('ManualId');
    });

    test('[Employee] Verify that Cancel returns to the list without saving.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-008' },
            { type: 'requirement', description: 'A5-R7|A5-R8' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.nameInput.fill('ShouldNotBeSaved');
        // Once the form is dirty the footer's cancel button relabels to "Discard
        // changes"; clicking it triggers the UnsavedChangesModal navigation guard,
        // and "Don't Save" abandons edits and proceeds to the list.
        await form.discardChanges();
        await page.waitForURL('**/setup/employees');
        // List page is now DataGrid (role=grid); no <td> elements.
        await expect(pages.employeeList.grid.getRoot()).toBeVisible();
        await expect(pages.employeeList.employeeNamed('ShouldNotBeSaved')).not.toBeVisible();
    });

    test('[Employee] Verify that a duplicate name shows a conflict error.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-009' },
            { type: 'requirement', description: 'A5-R9' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.employeeForm;
        // Our factory employee already exists; API errors surface via alert() — auto-dismiss it.
        await form.gotoNew();
        page.on('dialog', (dialog) => dialog.dismiss());
        // Blur so the form validates (mode: 'onBlur') and the submit button enables.
        await form.fillName(emp.name);
        await form.footer.submitButton.click();
        // Wait for Save button to re-enable (isSubmitting → false), meaning mutation settled.
        await expect(form.footer.saveButton).toBeEnabled({ timeout: 10000 });
        // A 409 conflict means we stay on the create form, not navigate to the edit form.
        await expect(page).toHaveURL(/\/setup\/employees\/new/);
    });

});

// ── Edit Employee Form ─────────────────────────────────────────────────────────

test.describe('Edit employee form', { tag: ['@JourneyA', '@A5'] }, () => {

    test('[Employee] Verify that the edit form loads the existing employee data.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-010' },
            { type: 'requirement', description: 'A5-R10' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await expect(form.nameInput).toHaveValue(emp.name);
        await expect(form.firstNameInput).toHaveValue(emp.firstName);
        await expect(form.lastNameInput).toHaveValue(emp.lastName);
    });

    test('[Employee] Verify that the barcode and export identifier are read-only and the name is editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-011' },
            { type: 'requirement', description: 'A5-R11|A5-R12' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await form.waitForForm();
        // WEBPET-2006 (2026-08-10): Name is gated, not hardcoded read-only — it
        // unlocks when isSU OR AllowRecordNameModification OR the stored name is
        // a "Temporary Badge"/"Temporary Name" placeholder. The suite runs as su,
        // so Name is editable here; the locked side is the next test.
        await expect(form.nameInput).not.toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
        await expect(form.exportIdentifierInput).toHaveAttribute('readonly', '');
    });

    test('[Employee] Verify that the name is read-only for a non-SU user when name modification is disallowed.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-012' },
            { type: 'requirement', description: 'A5-R13' },
        ],
    }, async ({ page, pages }) => {
        // Flip both unlocking terms of the WEBPET-2006 gate client-side (the
        // third, the temporary-name escape hatch, is off because emp.name is
        // "E2EEMP_…, Test"). Dev serves isSU=true + AllowRecordNameModification=true,
        // so the locked state is unreachable without rewriting the responses.
        await page.route('**/api/session/me', async (route) => {
            const response = await route.fetch();
            const body = await response.json().catch(() => null);
            if (body?.user) body.user.isSU = false;
            await route.fulfill({ response, json: body });
        });
        await page.route('**/api/preferences*', async (route) => {
            const response = await route.fetch();
            const body = await response.json().catch(() => null);
            if (body) body.allowRecordNameModification = false;
            await route.fulfill({ response, json: body });
        });
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await form.waitForForm();
        await expect(form.nameInput).toHaveAttribute('readonly', '');
        await expect(form.codeInput).toHaveAttribute('readonly', '');
    });

    test('[Employee] Verify that the name stays editable for a temporary-badge employee for a non-SU user when name modification is disallowed.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-013' },
            { type: 'requirement', description: 'A5-R14' },
        ],
    }, async ({ browser, sessionApi }) => {
        test.skip(
            !WEBPET_NONSU_USER || !WEBPET_NONSU_PASSWORD,
            'WEBPET_NONSU_USER / WEBPET_NONSU_PASSWORD not set — needed for a real non-SU ' +
                'dev-staging login to exercise the WEBPET-2006 third gate term.',
        );

        // Third WEBPET-2006 gate term: isSU OR AllowRecordNameModification OR a
        // case-insensitive startsWith on a "Temporary Badge"/"Temporary Name"
        // stored name (web-pet temporaryEmployeeName.ts). A real non-SU login
        // (below) makes the first term false; the preferences rewrite makes the
        // second false — so an editable Name here is attributable only to this
        // employee's name starting with "Temporary Badge".
        const tempEmp = await ensureEmployee(sessionApi, { namePrefix: 'Temporary Badge' });

        let nonSuContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
        try {
            const loginCtx = await pwRequest.newContext({
                baseURL: API_BASE_URL,
                extraHTTPHeaders: { Origin: WEB_BASE_URL },
            });
            const loginRes = await loginCtx.post('/api/auth/login', {
                data: { username: WEBPET_NONSU_USER, password: WEBPET_NONSU_PASSWORD },
                headers: { 'Content-Type': 'application/json' },
            });
            if (!loginRes.ok()) {
                await loginCtx.dispose();
                throw new Error(
                    `non-SU login failed (HTTP ${loginRes.status()}) against ${API_BASE_URL} as ` +
                        `'${WEBPET_NONSU_USER}'. Check WEBPET_NONSU_USER / WEBPET_NONSU_PASSWORD.`,
                );
            }
            const storageState = await loginCtx.storageState();
            await loginCtx.dispose();

            nonSuContext = await browser.newContext({ storageState, baseURL: WEB_BASE_URL });
            const nonSuPage = await nonSuContext.newPage();

            // No /api/session/me rewrite here (unlike A5-012): the non-SU
            // account already answers isSU=false truthfully server-side, so
            // patching the response would duplicate a real signal, not add one.
            await nonSuPage.route('**/api/preferences*', async (route) => {
                try {
                    const response = await route.fetch();
                    const body = await response.json().catch(() => null);
                    if (body) body.allowRecordNameModification = false;
                    await route.fulfill({ response, json: body });
                } catch (error) {
                    // Real round trip (route.fetch) on a context this test closes
                    // itself in `finally` right after the assertions below — it can
                    // still be in flight when that close happens. Playwright fails
                    // the test on a throwing route callback, so a teardown race here
                    // would be reported as a product failure. Same guard as
                    // webpet.fixture's session/me handler.
                    if (!/has been closed/i.test(String(error))) throw error;
                }
            });

            // No locale pin (unlike webpet.fixture's `context` override) — these
            // are readonly-attribute assertions, not text assertions, so a
            // pinned locale is not load-bearing here.
            const form = new EmployeeFormPage(nonSuPage);
            await form.gotoEdit(tempEmp.id);
            await form.waitForForm();
            await expect(form.nameInput).not.toHaveAttribute('readonly', '');
            await expect(form.codeInput).toHaveAttribute('readonly', '');
        } finally {
            // Local cleanup, not afterAll: this test owns tempEmp, and Employee
            // has no purge endpoint (WEBPET-1798) — a soft-deleted name is stuck
            // forever, so cleanup must run even on failure.
            await nonSuContext?.close();
            await deleteEmployee(sessionApi, tempEmp.id);
        }
    });

    test('[Employee] Verify that the first name and last name fields are editable.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-014' },
            { type: 'requirement', description: 'A5-R15' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await form.firstNameInput.waitFor({ state: 'visible' });
        await expect(form.firstNameInput).not.toHaveAttribute('readonly', '');
        await expect(form.lastNameInput).not.toHaveAttribute('readonly', '');
    });

    test('[Employee] Verify that the department dropdown shows the current value.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-015' },
            { type: 'requirement', description: 'A5-R16' },
        ],
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        // Our employee was created in `dept`; the combobox reflects its label.
        await expect(form.departmentPicker.comboboxInput).toHaveValue(emp.departmentName ?? dept.name);
    });

    test('[Employee] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-016' },
            { type: 'requirement', description: 'A5-R17' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await form.footer.cancelButton.waitFor({ state: 'visible' });
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/employees');
    });

    test('[Employee] Verify that a nonexistent employee id shows an error message.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A5-017' },
            { type: 'requirement', description: 'A5-R18' },
        ],
    }, async ({ pages }) => {
        await pages.employeeForm.gotoEdit(999999);
        await expect(pages.employeeForm.notFoundMessage).toBeVisible();
    });

});
