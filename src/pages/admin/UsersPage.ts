/**
 * @fileoverview Page Object for the PET Tiger Users administration screen
 * (File ▸ Administration ▸ Users) and its New User / Edit User form.
 *
 * Covers catalog workflow **A1 — License, serial number, and user setup**: listing
 * users, creating one through the General / Permissions / Time Card Defaults /
 * Personal Info form, the duplicate-Initials ("Already in use") validation, and
 * verifying the new user appears in the grid.
 *
 * The grid mechanics and the whole save/validation dance live in
 * {@link SetupScreenPage} and `DataGridComponent`, because every other
 * Input ▸ Setup screen the catalog needs (Ranch, Field, Crop, Variety, Job, Crew,
 * Employee, Equipment) behaves identically. What is left here is what is genuinely
 * specific to Users: its fields, and how they are filled. **This file is the
 * reference to copy when adding the next setup screen.**
 *
 * PET Tiger cannot delete a user — not through the UI, and not through the API
 * either. The UI exposes no delete action anywhere (the File ▸ Multiple Delete
 * tool only covers time cards and the name-change table), and the API has no
 * `DELETE /users/{id}` and no `/users/bulk-delete`, even though it does expose a
 * delete route for nearly every other entity. That is a designed exclusion, so
 * don't go looking for one.
 *
 * Tests that create users therefore clean them up directly in SQL — see
 * `src/utils/db/cleanupRegistry.ts`, which runs the delete through
 * `src/utils/db/sqlClient.ts`, setting `Deleted = 1` to free the
 * Name/Initials/Email. This needs the run host to reach SQL Server and is gated by
 * `DB_CLEANUP`.
 *
 * @module pages/admin/UsersPage
 * @since 1.0.0
 */
import { Locator, Page } from '@playwright/test';
import { SetupScreenPage } from '../SetupScreenPage';

/** Values used to fill the New User form. */
export interface NewUserData {
    name: string;
    password: string;
    role: string;
    initials: string;
    email: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    title?: string;
    /** Additional Access permission labels to enable, e.g. ["View SSN"]. */
    additionalAccess?: string[];
    /** "Access to Reverse" option to select: 'All' | 'None' | 'User'. */
    accessToReverse?: string;
}

/**
 * Outcome of submitting the New User form.
 *
 * A duplicate Initials value is this screen's only rejection reason, so the
 * outcome is named for what it means rather than reusing the base's generic
 * `'rejected'`.
 */
export type SaveOutcome = 'created' | 'duplicate-initials';

/**
 * Page Object for the Users list and the New/Edit User form.
 *
 * @class UsersPage
 * @extends SetupScreenPage
 */
export class UsersPage extends SetupScreenPage {
    // ── New / Edit User form ────────────────────────────────────────
    readonly nameInput: Locator;
    readonly passwordInput: Locator;
    readonly roleCombobox: Locator;
    readonly roleListbox: Locator;
    /** Every option inside the open Role dropdown. */
    readonly roleOptions: Locator;
    readonly initialsInput: Locator;
    readonly emailInput: Locator;
    readonly languageCombobox: Locator;
    readonly activeSwitch: Locator;
    /** "Access to Reverse" dropdown (Permissions ▸ Additional Access). */
    readonly accessToReverseCombobox: Locator;
    readonly firstNameInput: Locator;
    readonly middleNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly titleInput: Locator;

    /** "Already in use" message shown under a duplicate Initials value. */
    readonly initialsAlreadyInUseError: Locator;
    /** "User created" success toast. */
    readonly userCreatedToast: Locator;

    constructor(page: Page) {
        super(page, {
            listUrl: '/settings/users',
            gridName: 'Users',
            entity: 'User',
            menuPath: ['File', 'Administration', 'Users'],
            // The only way this form rejects a save is a duplicate Initials value.
            rejectionMessage: 'Already in use',
        });

        // Form — General
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.passwordInput = page.getByRole('textbox', { name: 'Password *' });
        this.roleCombobox = page.getByRole('combobox', { name: 'Role *' });
        this.roleListbox = page.getByRole('listbox');
        this.roleOptions = this.roleListbox.getByRole('option');
        this.initialsInput = page.getByRole('textbox', { name: 'Initials *' });
        this.emailInput = page.getByRole('textbox', { name: 'Email Address *' });
        this.languageCombobox = page.getByRole('combobox', { name: 'Language' });
        this.activeSwitch = page.getByRole('switch', { name: 'Active' });
        this.accessToReverseCombobox = page.getByRole('combobox', { name: 'Access to Reverse' });

        // Form — Personal Info
        this.firstNameInput = page.getByRole('textbox', { name: 'First Name' });
        this.middleNameInput = page.getByRole('textbox', { name: 'Middle Name' });
        this.lastNameInput = page.getByRole('textbox', { name: 'Last Name' });
        this.titleInput = page.getByRole('textbox', { name: 'Title' });

        // Feedback — the base owns saveButton / cancelButton / errorSummaryButton
        // and the generic rejection message; this is the Users-specific alias.
        this.initialsAlreadyInUseError = this.rejectionMessage;
        this.userCreatedToast = page.getByText('User created');
    }

    /** The form is interactive once Name has rendered. */
    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    /**
     * Email Address is the last General field filled, so blurring it is what runs
     * the form's on-blur validation and enables Save.
     */
    protected override async blurForValidation(): Promise<void> {
        await this.emailInput.blur();
    }

    // ── Navigation ──────────────────────────────────────────────────
    // Named for this screen so specs read the way the workflow does; the base
    // supplies the behaviour.

    /** Open the Users list via File ▸ Administration ▸ Users. */
    async gotoUsersList(): Promise<void> {
        await this.gotoList();
    }

    /** From the Users list, open the New User form. */
    async openNewUserForm(): Promise<void> {
        await this.openNewForm();
    }

    /** From the Users list, open a user's Edit form via its row link. */
    async openEditUser(name: string): Promise<void> {
        await this.openEdit(name);
    }

    // ── Grid lookups ────────────────────────────────────────────────

    /** The "Edit User: <name>" row link. */
    editUserLink(name: string): Locator {
        return this.grid.editLink(name);
    }

    /** The grid row for a user, located via its Edit link. */
    userRow(name: string): Locator {
        return this.grid.rowFor(name);
    }

    /** The Name column filter box. */
    get nameFilter(): Locator {
        return this.grid.nameFilter;
    }

    /** Filter the grid by the Name column. */
    async filterByName(name: string): Promise<void> {
        await this.grid.filterByName(name);
    }

    /** Row count from the grid's "Total N rows" footer. */
    async totalRowCount(): Promise<number> {
        return this.grid.totalRowCount();
    }

    // ── Role dropdown ───────────────────────────────────────────────

    /** A single option in the Role dropdown. */
    roleOption(role: string): Locator {
        return this.page.getByRole('option', { name: role, exact: true });
    }

    /** Open the Role dropdown. */
    async openRoleDropdown(): Promise<void> {
        await this.roleCombobox.click();
        await this.roleListbox.waitFor({ state: 'visible' });
    }

    /** Pick a role from the Role dropdown. */
    async selectRole(role: string): Promise<void> {
        await this.openRoleDropdown();
        await this.roleOption(role).click();
    }

    // ── Form filling ────────────────────────────────────────────────

    /** Fill the required General fields (Name, Password, Role, Initials, Email). */
    async fillGeneral(data: NewUserData): Promise<void> {
        await this.nameInput.fill(data.name);
        await this.passwordInput.fill(data.password);
        await this.selectRole(data.role);
        await this.initialsInput.fill(data.initials);
        await this.emailInput.fill(data.email);
    }

    /** Fill the optional Personal Info fields that are provided. */
    async fillPersonalInfo(data: NewUserData): Promise<void> {
        if (data.firstName !== undefined) await this.firstNameInput.fill(data.firstName);
        if (data.middleName !== undefined) await this.middleNameInput.fill(data.middleName);
        if (data.lastName !== undefined) await this.lastNameInput.fill(data.lastName);
        if (data.title !== undefined) await this.titleInput.fill(data.title);
    }

    // ── Permissions (Additional Access + Access to Reverse) ─────────

    /** A single Additional Access permission checkbox, located by its label. */
    additionalAccessCheckbox(name: string): Locator {
        return this.page.getByRole('checkbox', { name, exact: true });
    }

    /** Enable (check) each named Additional Access permission. */
    async setAdditionalAccess(labels: string[]): Promise<void> {
        for (const label of labels) {
            await this.additionalAccessCheckbox(label).check();
        }
    }

    /** Pick an "Access to Reverse" option ('All' | 'None' | 'User'). */
    async selectAccessToReverse(value: string): Promise<void> {
        await this.accessToReverseCombobox.click();
        await this.roleListbox.waitFor({ state: 'visible' });
        await this.page.getByRole('option', { name: value, exact: true }).click();
    }

    /**
     * Apply the optional Permissions fields that are provided — Additional Access
     * toggles and the Access to Reverse selection. Call after {@link fillGeneral}
     * so the Role is already chosen (Role changes the default permission set).
     */
    async fillPermissions(data: NewUserData): Promise<void> {
        if (data.additionalAccess !== undefined) await this.setAdditionalAccess(data.additionalAccess);
        if (data.accessToReverse !== undefined) await this.selectAccessToReverse(data.accessToReverse);
    }

    // ── Saving ──────────────────────────────────────────────────────

    /**
     * Submit the New User form and resolve to what the app did — created, or kept
     * open with the duplicate-Initials error. See {@link SetupScreenPage.submit}
     * for the on-blur validation, Save-stays-disabled and server-rejection handling.
     */
    async submit(): Promise<SaveOutcome> {
        const outcome = await this.submitForm();
        return outcome === 'created' ? 'created' : 'duplicate-initials';
    }
}

export default UsersPage;
