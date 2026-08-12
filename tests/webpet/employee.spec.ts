/**
 * Employee form-page e2e — list-page coverage moved to
 * setup-batch-b-smoke.spec.ts when EmployeeListPage migrated to the new
 * DataGrid lib (PET-424). Form pages were not touched by that migration,
 * so the form tests below remain valid against the existing DOM.
 *
 * Framework-aligned (Batch 02): locators live in EmployeeFormPage /
 * EmployeeListPage; the Department and Crew ParentPickers are driven through
 * ParentPickerComponent. Action order and assertions unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';
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
} from './data-factory';
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

test.beforeAll(async ({ request }) => {
    dept = await ensureDepartment(request);
    crew = await ensureCrew(request);
    emp = await ensureEmployee(request, { department: { id: dept.id, name: dept.name } });
});

test.afterAll(async ({ request }) => {
    // Delete the employee first — it FK-references the crew/department.
    if (emp) await deleteEmployee(request, emp.id);
    if (crew) await deleteCrew(request, crew.id);
    if (dept) await deleteDepartment(request, dept.id);
});

// Prerequisites:
//   - dev server running:  cd apps/web && pnpm dev
//   - API server running:  cd apps/api  && go run .
//
// Field labels use aliases from the Preferences table.
// These tests assume defaults: Employee = "Employee".

// ── New Employee Form ──────────────────────────────────────────────────────────

test.describe('New employee form', { tag: ['@WebPet', '@wp-setup', '@wp-employee', '@WPBatch02'] }, () => {

    test('[Employee] Verify that the new employee form renders all expected fields.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0145' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0146' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.departmentPicker.openCombobox();
        // Assert our own department shows up — proves the dropdown is DB-populated
        // without depending on a specific seeded name.
        await expect(form.departmentPicker.comboboxOptionByText(dept.name)).toBeVisible();
    });

    test('[Employee] Verify that the crew dropdown is populated from the database.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0147' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoNew();
        await form.crewPicker.openCombobox();
        await expect(form.crewPicker.comboboxOptionByText(crew.name)).toBeVisible();
    });

    test('[Employee] Verify that Save is disabled until a required name is provided.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0148' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0149' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        // Legacy EmployeeForm.cs does NOT auto-fill ExportIdentifier from Name.
        // The web divergence (handleNameBlur) was removed in PET-581.
        await form.gotoNew();
        await form.fillName('TestEmp');
        await expect(form.exportIdentifierInput).toHaveValue('');
    });

    test('[Employee] Verify that a manually filled export identifier is not overwritten.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0150' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0151' },
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
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0152' },
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

test.describe('Edit employee form', { tag: ['@WebPet', '@wp-setup', '@wp-employee', '@WPBatch02'] }, () => {

    test('[Employee] Verify that the edit form loads the existing employee data.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0153' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await expect(form.nameInput).toHaveValue(emp.name);
        await expect(form.firstNameInput).toHaveValue(emp.firstName);
        await expect(form.lastNameInput).toHaveValue(emp.lastName);
    });

    test('[Employee] Verify that the barcode and export identifier are read-only and the name is editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0154' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0407' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0408' },
    }, async ({ browser, request }) => {
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
        const tempEmp = await ensureEmployee(request, { namePrefix: 'Temporary Badge' });

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

            // No /api/session/me rewrite here (unlike WP-0407): the non-SU
            // account already answers isSU=false truthfully server-side, so
            // patching the response would duplicate a real signal, not add one.
            await nonSuPage.route('**/api/preferences*', async (route) => {
                const response = await route.fetch();
                const body = await response.json().catch(() => null);
                if (body) body.allowRecordNameModification = false;
                await route.fulfill({ response, json: body });
            });

            // No locale pin (unlike the fixture's `context` override) — these
            // are readonly-attribute assertions, not text assertions, so the
            // pinned 'en' locale is not load-bearing here.
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
            await deleteEmployee(request, tempEmp.id);
        }
    });

    test('[Employee] Verify that the first name and last name fields are editable.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0155' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await form.firstNameInput.waitFor({ state: 'visible' });
        await expect(form.firstNameInput).not.toHaveAttribute('readonly', '');
        await expect(form.lastNameInput).not.toHaveAttribute('readonly', '');
    });

    test('[Employee] Verify that the department dropdown shows the current value.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0156' },
    }, async ({ pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        // Our employee was created in `dept`; the combobox reflects its label.
        await expect(form.departmentPicker.comboboxInput).toHaveValue(emp.departmentName ?? dept.name);
    });

    test('[Employee] Verify that Cancel returns to the list from the edit form.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0157' },
    }, async ({ page, pages }) => {
        const form = pages.employeeForm;
        await form.gotoEdit(emp.id);
        await form.footer.cancelButton.waitFor({ state: 'visible' });
        await form.footer.cancelButton.click();
        await page.waitForURL('**/setup/employees');
    });

    test('[Employee] Verify that a nonexistent employee id shows an error message.', {
        tag: ['@wp-ui', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0158' },
    }, async ({ pages }) => {
        await pages.employeeForm.gotoEdit(999999);
        await expect(pages.employeeForm.notFoundMessage).toBeVisible();
    });

});
