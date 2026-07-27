/**
 * @fileoverview Page Object for the PET Tiger Users administration screen
 * (File ▸ Administration ▸ Users) and its New User / Edit User form.
 *
 * Covers "Journey A1 — User Setup": listing users, creating a user through the
 * General / Permissions / Time Card Defaults / Personal Info form, the
 * duplicate-Initials ("Already in use") validation, and verifying the new user
 * appears in the grid.
 *
 * The PET Tiger UI exposes no delete-user action anywhere (the File ▸ Multiple
 * Delete tool only covers time cards and the name-change table). Tests that
 * create users clean them up directly in SQL instead — the cleanup query lives
 * in each spec's afterEach and runs via `src/utils/db/sqlClient.ts`.
 *
 * @module pages/UsersPage
 * @since 1.0.0
 */
import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { LeftNavigationPage } from './LeftNavigationPage';

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

/** Outcome of submitting the New User form. */
export type SaveOutcome = 'created' | 'duplicate-initials';

/**
 * Page Object for the Users list and the New/Edit User form.
 *
 * @class UsersPage
 * @extends BasePage
 */
export class UsersPage extends BasePage {
    /** Relative URL of the Users list. */
    readonly pageUrl: string = '/settings/users';
    /** Title assertion is unused here; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    // ── Users list ──────────────────────────────────────────────────
    /** "New User" button (top-right of the list). */
    readonly newUserButton: Locator;
    /** The Users data grid. */
    readonly usersGrid: Locator;
    /** "Total N rows" footer status of the grid. */
    readonly totalRowsStatus: Locator;
    /** The Name column filter box (first filter in the grid header). */
    readonly nameFilter: Locator;

    // ── New / Edit User form ────────────────────────────────────────
    readonly nameInput: Locator;
    readonly passwordInput: Locator;
    readonly roleCombobox: Locator;
    readonly roleListbox: Locator;
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
    readonly saveButton: Locator;
    readonly cancelButton: Locator;

    /** "Already in use" message shown under a duplicate Initials value. */
    readonly initialsAlreadyInUseError: Locator;
    /** The "N error ▼" summary button shown when validation fails. */
    readonly errorSummaryButton: Locator;
    /** "User created" success toast. */
    readonly userCreatedToast: Locator;

    /** The sidebar, used to reach this screen via File ▸ Administration ▸ Users. */
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);

        // List
        this.newUserButton = page.getByRole('button', { name: 'New User' });
        this.usersGrid = page.getByRole('grid', { name: 'Users' });
        this.totalRowsStatus = page.getByText(/Total \d+ rows/);
        this.nameFilter = this.usersGrid.getByPlaceholder('Filter').first();

        // Form — General
        this.nameInput = page.getByRole('textbox', { name: 'Name *' });
        this.passwordInput = page.getByRole('textbox', { name: 'Password *' });
        this.roleCombobox = page.getByRole('combobox', { name: 'Role *' });
        this.roleListbox = page.getByRole('listbox');
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

        // Form — actions & feedback
        this.saveButton = page.getByRole('button', { name: 'Save' });
        this.cancelButton = page.getByRole('button', { name: 'Cancel' });
        this.initialsAlreadyInUseError = page.getByText('Already in use');
        this.errorSummaryButton = page.getByRole('button', { name: /error/ });
        this.userCreatedToast = page.getByText('User created');
    }

    // ── Navigation ──────────────────────────────────────────────────

    /**
     * Open the Users list by navigating the real sidebar menu — File ▸
     * Administration ▸ Users — the way a person does, so the recorded video
     * captures the navigation instead of a bare URL jump. Loads the
     * authenticated shell first if the sidebar isn't already showing (e.g. at
     * the start of a test, when the page is still blank).
     */
    async gotoUsersList(): Promise<void> {
        const sidebarReady = await this.leftNav.searchMenu.isVisible().catch(() => false);
        if (!sidebarReady) {
            await this.page.goto('/', { waitUntil: 'domcontentloaded' });
            await this.leftNav.searchMenu.waitFor({ state: 'visible' });
        }
        await this.leftNav.openUsersViaMenu();
        await this.newUserButton.waitFor({ state: 'visible' });
    }

    /** From the Users list, open the New User form. */
    async openNewUserForm(): Promise<void> {
        await this.newUserButton.click();
        await this.page.waitForURL(/\/settings\/users\/new(\?|$)/);
        await this.nameInput.waitFor({ state: 'visible' });
    }

    /** From the Users list, open a user's Edit form via its row link. */
    async openEditUser(name: string): Promise<void> {
        await this.editUserLink(name).click();
        // The Edit URL may carry the list's filter state as a query string
        // (e.g. /settings/users/134?name=QA+User+x), so don't anchor on the ID.
        await this.page.waitForURL(/\/settings\/users\/\d+(\?|$)/);
        await this.nameInput.waitFor({ state: 'visible' });
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
     * Apply the optional Permissions fields that are provided — Additional
     * Access toggles and the Access to Reverse selection. Call after
     * {@link fillGeneral} so the Role is already chosen (Role changes the
     * default permission set).
     */
    async fillPermissions(data: NewUserData): Promise<void> {
        if (data.additionalAccess !== undefined) await this.setAdditionalAccess(data.additionalAccess);
        if (data.accessToReverse !== undefined) await this.selectAccessToReverse(data.accessToReverse);
    }

    /**
     * Submit the New User form and resolve to what the app did: either it
     * navigated to the created user's Edit page, or it kept the form open with
     * the duplicate-Initials "Already in use" error.
     *
     * The form uses on-blur validation, so the last-edited field is blurred
     * first; the Save button only enables once every required field has been
     * validated. A duplicate Initials value is reported either client-side
     * (Save stays disabled with the error) or on save (server 409) — both are
     * handled here.
     */
    async submit(): Promise<SaveOutcome> {
        // Blur the currently-focused field so on-blur validation runs.
        await this.emailInput.blur();

        // Wait for validation to settle: Save becomes enabled, or the
        // duplicate-Initials error appears.
        await expect(async () => {
            const enabled = await this.saveButton.isEnabled();
            const duplicate = await this.initialsAlreadyInUseError.isVisible();
            expect(enabled || duplicate).toBeTruthy();
        }).toPass({ timeout: 15000 });

        if (!(await this.saveButton.isEnabled())) {
            return 'duplicate-initials';
        }

        await this.saveButton.click();

        // After saving, either we land on the created user's Edit page, or the
        // duplicate-Initials error comes back from the server. The Edit URL may
        // carry a query string, so don't anchor the pattern on the ID.
        const editUrl = /\/settings\/users\/\d+(\?|$)/;
        await expect(async () => {
            const created = editUrl.test(this.page.url());
            const duplicate = await this.initialsAlreadyInUseError.isVisible();
            expect(created || duplicate).toBeTruthy();
        }).toPass({ timeout: 15000 });

        return editUrl.test(this.page.url()) ? 'created' : 'duplicate-initials';
    }

    /**
     * Save edits made on an existing user's form. Assumes a field was just
     * changed and blurred (so on-blur validation has run): the form shows an
     * "Unsaved changes" bar with an enabled Save button, and clicking Save
     * clears that bar once the change is committed.
     */
    async saveEdit(): Promise<void> {
        await expect(this.saveButton).toBeEnabled();
        await this.saveButton.click();
        await expect(this.page.getByText('Unsaved changes')).toBeHidden();
    }

    // ── Grid lookups ────────────────────────────────────────────────

    /** The "Edit User: <name>" row link. */
    editUserLink(name: string): Locator {
        return this.page.getByRole('link', { name: `Edit User: ${name}` });
    }

    /** The grid row for a user, located via its Edit link. */
    userRow(name: string): Locator {
        return this.page.getByRole('row').filter({ has: this.editUserLink(name) });
    }

    /** Filter the grid by the Name column. */
    async filterByName(name: string): Promise<void> {
        await this.nameFilter.fill(name);
        await this.userRow(name).waitFor({ state: 'visible' });
    }

    /**
     * Filter the grid by name and assert no matching user row exists — used to
     * confirm a user was removed (e.g. after a hard delete).
     *
     * Loads the list fresh from the server first (a full navigation, not SPA
     * routing): reaching the list via the sidebar can serve a cached grid still
     * showing a just-deleted user, so a fresh server fetch is forced before
     * asserting absence. Works from any page, so callers need not navigate here.
     */
    async expectAbsentFromList(name: string): Promise<void> {
        await this.navigate();
        await this.newUserButton.waitFor({ state: 'visible' });
        await this.nameFilter.fill(name);
        await expect(this.userRow(name)).toHaveCount(0);
    }
}
