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
 * The UI exposes no delete action for a user anywhere — the File ▸ Multiple Delete
 * tool only covers time cards and the name-change table — so there is no delete
 * flow for this page object to model. Tests that create a user remove it through
 * `DELETE /users/{id}` instead (added by WEBPET-1606); see
 * `src/utils/cleanup/cleanupRegistry.ts`.
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage } from '../SetupScreenPage';
import { randomInitials } from '../../data/generated';

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

    /** The grid row for a user, located via its Edit link. */
    userRow(name: string): Locator {
        return this.grid.rowFor(name);
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

    /**
     * A single Additional Access permission toggle, located by its label.
     *
     * These are switches, like the Active toggle above — each row also holds an
     * unnamed `checkbox`, so a `getByRole('checkbox', { name })` never resolves.
     */
    additionalAccessToggle(name: string): Locator {
        return this.page.getByRole('switch', { name, exact: true });
    }

    /** Turn on each named Additional Access permission, leaving any already on. */
    async setAdditionalAccess(labels: string[]): Promise<void> {
        for (const label of labels) {
            const toggle = this.additionalAccessToggle(label);
            await toggle.waitFor({ state: 'visible' });
            if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
            await expect(toggle).toHaveAttribute('aria-checked', 'true');
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

    // ── Composite flows ─────────────────────────────────────────────

    /**
     * Fill and save the New User form, returning the data actually saved.
     *
     * Initials are capped at 3 characters and must be unique, so a generated value
     * can collide with an existing user; retry with a fresh one. The retry has to
     * live here rather than in the data layer because it is driven by what
     * {@link submit} reports back from the UI.
     */
    async createUser(base: NewUserData, maxAttempts = 5): Promise<NewUserData> {
        const user: NewUserData = { ...base };
        await this.gotoUsersList();
        await this.openNewUserForm();
        await this.fillGeneral(user);
        await this.fillPermissions(user);
        await this.fillPersonalInfo(user);

        let outcome = await this.submit();
        for (let attempt = 0; outcome === 'duplicate-initials' && attempt < maxAttempts; attempt++) {
            user.initials = randomInitials();
            await this.initialsInput.fill(user.initials);
            outcome = await this.submit();
        }

        expect(outcome, 'user should be created with a unique Initials').toBe('created');
        return user;
    }

    /**
     * Assert the grid shows exactly this user, with the details it was created
     * with. The counterpart to {@link SetupScreenPage.expectAbsentFromList}.
     *
     * Filters by name rather than scanning the list, so it holds whatever else is
     * in the database.
     */
    async expectListedWithDetails(user: NewUserData): Promise<void> {
        await this.filterByName(user.name);

        const row = this.userRow(user.name);
        await expect(row).toHaveCount(1);
        await expect.poll(() => this.totalRowCount()).toBe(1);

        await expect(row).toContainText(user.initials);
        await expect(row).toContainText(user.role);
        await expect(row).toContainText(user.email);
    }
}

export default UsersPage;
