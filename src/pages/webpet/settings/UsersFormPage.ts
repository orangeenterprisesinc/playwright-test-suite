/**
 * @fileoverview User admin form — `/settings/users/{new,:id}`.
 *
 * Note the route: user admin lives under `/settings`, not `/setup`.
 *
 * ## Why this is not `src/pages/admin/UsersPage.ts`
 *
 * The framework already has a Users page object for the journey suite at the
 * same route. This one is deliberately separate: the migrated suite must not
 * depend on journey page objects (a journey-driven change to that class would
 * silently rewrite web-pet behaviour), and the two model different things — the
 * journey object drives the whole create/edit lifecycle against the legacy shell,
 * this one models the SPA form the migrated suite actually loads.
 *
 * The tab strip is ordinary `<button>`s, not ARIA tabs, so tabs are reached by
 * button role.
 *
 * ## Two control families, neither of them a ParentPicker
 *
 * - **User Role** and **Language** are shadcn `<Select>`s. Their trigger carries
 *   the field id (`#userRole`), and their options live in a portaled
 *   `[data-slot="select-content"]` keyed by `data-value` — an entity id for role,
 *   a locale code for language.
 * - **Permissions** are base-ui Checkboxes, which put the field id on a *hidden
 *   native `<input>`* inside the Root button. The clickable element is the
 *   sibling `button[data-slot="checkbox"]`, so {@link permissionCheckbox} walks
 *   from the `<label for>` up to the shared container and back down. The form
 *   also scrolls in an inner `overflow-y-auto`, so the click has to be preceded
 *   by `scrollIntoViewIfNeeded` — {@link clickPermission} does both.
 *
 *   Dev staging renders these same permissions as `[data-slot="switch"]` rather
 *   than `[data-slot="checkbox"]` — both slots exist in the deployed bundle, and
 *   which one a form uses is not something the test can assume. The locator
 *   accepts either so it does not have to be reversed when the two converge.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';
import { ParentPickerComponent } from '../../../components/webpet/ParentPickerComponent';

/**
 * @extends BasePage
 */
export class UsersFormPage extends BasePage {
    readonly pageUrl: string = '/settings/users';
    readonly pageTitle: string | RegExp = /.*/;

    /** Sheet-mode picker on the Time Card Defaults tab. */
    readonly defaultRanchPicker: ParentPickerComponent;
    /** Combobox picker, filtered by the selected Default Ranch. */
    readonly defaultFieldPicker: ParentPickerComponent;
    /** Combobox picker. */
    readonly defaultJobPicker: ParentPickerComponent;

    // ── General ─────────────────────────────────────────────────────
    /** The login name. Unique-constrained, unfiltered — soft-deleted rows still collide. */
    readonly nameInput: Locator;
    readonly passwordInput: Locator;
    /** shadcn Select trigger. Options are entity ids: `1` = Administrator. */
    readonly userRoleSelect: Locator;
    /** Unique-constrained; the suite picks the lowest free code at runtime. */
    readonly userInitialsInput: Locator;
    /** Required since WEBPET-776 — email is the login identifier and unique in TigerMaster. */
    readonly emailAddressInput: Locator;
    /** shadcn Select trigger. Options are locale codes: `en`, `es`. */
    readonly languageSelect: Locator;

    // ── Permissions ─────────────────────────────────────────────────
    /** The permissions block. Scroll it into view before touching a checkbox. */
    readonly permissionsSection: Locator;

    // ── Personal Info ───────────────────────────────────────────────
    readonly firstNameInput: Locator;
    readonly middleNameInput: Locator;
    readonly lastNameInput: Locator;
    readonly titleInput: Locator;

    /**
     * Submit.
     *
     * A substring name match, matching the lifted specs. It is safe *here*
     * because no unsaved-changes modal is mounted at submit time on this form —
     * where one can be, the suite uses an exact matcher instead, since substring
     * `'Save'` also matches "Don't Save" and trips strict mode.
     */
    readonly saveButton: Locator;

    constructor(page: Page) {
        super(page);

        this.defaultRanchPicker = new ParentPickerComponent(page, 'Default Ranch');
        this.defaultFieldPicker = new ParentPickerComponent(page, 'Default Field');
        this.defaultJobPicker = new ParentPickerComponent(page, 'Default Job');

        this.nameInput = page.locator('input#name');
        this.passwordInput = page.locator('input#password');
        this.userRoleSelect = page.locator('#userRole');
        this.userInitialsInput = page.locator('input#userInitials');
        this.emailAddressInput = page.locator('input#emailAddress');
        this.languageSelect = page.locator('#language');

        this.permissionsSection = page.locator('section#permissions');

        this.firstNameInput = page.locator('input#firstName');
        this.middleNameInput = page.locator('input#middleName');
        this.lastNameInput = page.locator('input#lastName');
        this.titleInput = page.locator('input#title');

        this.saveButton = page.getByRole('button', { name: 'Save' });
    }

    /** An option in the open portaled Select content, keyed by its `data-value`. */
    selectOption(value: string): Locator {
        return this.page.locator(`[data-slot="select-content"] [data-value="${value}"]`);
    }

    /** Open a Select trigger and pick the option carrying `value`. */
    async chooseFromSelect(trigger: Locator, value: string): Promise<void> {
        await trigger.click();
        await this.selectOption(value).click();
    }

    /**
     * A permission checkbox's clickable button — see the class note on why this
     * walks the label's parent rather than using the field id directly.
     */
    permissionCheckbox(fieldId: string): Locator {
        return this.page
            .locator(`label[for="${fieldId}"]`)
            .locator('..')
            .locator('[data-slot="checkbox"], [data-slot="switch"]');
    }

    /** Scroll a permission checkbox into the inner scroll container, then click it. */
    async clickPermission(fieldId: string): Promise<void> {
        const btn = this.permissionCheckbox(fieldId);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();
    }

    /** Open the create form. Plain `goto`, matching the lifted spec. */
    async gotoNew(): Promise<void> {
        await this.page.goto(`${this.pageUrl}/new`);
    }

    /** A form tab. Ordinary buttons, not ARIA tabs. */
    tab(name: string): Locator {
        return this.page.getByRole('button', { name });
    }

    /** Switch to the Time Card Defaults tab. */
    async openTimeCardDefaults(): Promise<void> {
        await this.tab('Time Card Defaults').click();
    }
}

export default UsersFormPage;
