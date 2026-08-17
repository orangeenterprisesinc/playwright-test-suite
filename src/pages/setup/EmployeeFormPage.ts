/**
 * @fileoverview Employee create/edit form — `/setup/employees/{new,:id}`.
 *
 * Two ParentPickers (Department and Crew, both combobox mode) and the widest
 * field set of the setup forms.
 *
 * Note `activeCheckbox` is `input#active`, **not** the `#active` ActiveField
 * Switch the other setup screens use — this screen kept a native checkbox, and
 * the two are different controls. Declared here rather than overriding the
 * base's `activeSwitch` so neither screen's selector is silently widened.
 *
 * Export Identifier deliberately does **not** auto-populate from Name here:
 * legacy `EmployeeForm.cs` never did, and the web divergence (`handleNameBlur`)
 * was removed in PET-581 (GAP-016). Two tests guard that it stays removed.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../webpet/WebpetFormPage';
import { ParentPickerComponent } from '../../components/webpet/ParentPickerComponent';
import { EmployeeDocumentsComponent } from '../../components/EmployeeDocumentsComponent';

/**
 * @extends WebpetFormPage
 */
export class EmployeeFormPage extends WebpetFormPage {
    /** Readonly once the record exists. */
    readonly codeInput: Locator;
    /** Editable on the edit form. */
    readonly firstNameInput: Locator;
    /** Editable on the edit form. */
    readonly lastNameInput: Locator;
    /** A native checkbox on this screen, not the ActiveField Switch. */
    readonly activeCheckbox: Locator;
    /** Department ParentPicker, combobox mode. */
    readonly departmentPicker: ParentPickerComponent;
    /** Crew ParentPicker, combobox mode. */
    readonly crewPicker: ParentPickerComponent;
    /** Shown when the id in the URL does not resolve. */
    readonly notFoundMessage: Locator;
    /** The Documents tab — upload, list, sort, download, delete. S3-backed. */
    readonly documents: EmployeeDocumentsComponent;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/employees', entity: 'Employee' });

        this.documents = new EmployeeDocumentsComponent(page);

        this.codeInput = page.locator('input#code');
        this.firstNameInput = page.locator('input#firstName');
        this.lastNameInput = page.locator('input#lastName');
        this.activeCheckbox = page.locator('input#active');
        this.departmentPicker = new ParentPickerComponent(page, 'Department');
        this.crewPicker = new ParentPickerComponent(page, 'Crew');
        this.notFoundMessage = page.locator('text=Failed to load employee.');
    }
}

export default EmployeeFormPage;
