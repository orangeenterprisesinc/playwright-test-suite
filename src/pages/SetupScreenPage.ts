/**
 * @fileoverview Shared base for every PET Tiger list-plus-form setup screen.
 *
 * The catalog's journey A creates nine kinds of record — Ranch, Field, Crop,
 * Variety, Job, Job Group, Crew, Employee, Equipment (A2–A5, A12) — plus Users and
 * Scan Devices under File ▸ Administration (A1, A7). Every one of them is the same
 * screen twice over: a grid of existing records, and a New/Edit form reached from
 * it. They also share the same non-obvious save behaviour, which is the real
 * reason this base exists:
 *
 * - **validation runs on blur**, not on input, so the last field edited must be
 *   blurred before Save becomes enabled;
 * - **Save stays disabled** while any required field is unvalidated or any field
 *   holds a value the app rejects (a duplicate is reported this way rather than as
 *   a failed save);
 * - a duplicate may instead come back from the **server on save**, so both paths
 *   have to be handled;
 * - editing an existing record shows an **"Unsaved changes"** bar that clears when
 *   the change commits.
 *
 * Encoding that once here means a new setup-screen page object is little more than
 * its locators and `fill*` methods — see `src/pages/admin/UsersPage.ts`, which is
 * the reference implementation.
 */
import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { DataGridComponent } from '../components/DataGridComponent';
import { LeftNavigationPage } from './shell/LeftNavigationPage';

/**
 * What happened when a New form was submitted.
 *
 * - `'created'` — the app navigated to the new record's Edit page
 * - `'rejected'` — the form stayed open with a validation error (e.g. a duplicate)
 *
 * Concrete screens usually re-expose this under their own name, because each one
 * has exactly one reason to reject (`'duplicate-initials'` for Users). They wrap
 * {@link SetupScreenPage.submitForm} rather than overriding it, so the narrower
 * return type stays type-safe.
 */
export type FormOutcome = 'created' | 'rejected';

/** How a concrete setup screen identifies itself to this base. */
export interface SetupScreenConfig {
    /** Relative URL of the list (e.g. `'/settings/users'`). */
    listUrl: string;
    /** Accessible name of the list grid (e.g. `'Users'`). */
    gridName: string;
    /** Singular entity name used in row edit links and buttons (e.g. `'User'`). */
    entity: string;
    /** Sidebar menu path to the list (e.g. `['File', 'Administration', 'Users']`). */
    menuPath: string[];
    /**
     * Locator-level signal that the form is rejecting the current values — the
     * screen's own duplicate/validation message. Save-stays-disabled alone cannot
     * distinguish "still validating" from "rejected", so each screen supplies this.
     */
    rejectionMessage: string | RegExp;
}

/**
 * Abstract base for a list + New/Edit form screen.
 *
 * @abstract
 * @extends BasePage
 */
export abstract class SetupScreenPage extends BasePage {
    /** How long to wait for on-blur validation or a save round-trip to settle. */
    protected static readonly SETTLE_TIMEOUT = 15_000;

    /** This screen's identifying configuration. */
    protected readonly config: SetupScreenConfig;
    /** The list grid. */
    readonly grid: DataGridComponent;
    /** The sidebar, used to reach this screen the way a person does. */
    protected readonly leftNav: LeftNavigationPage;

    readonly pageUrl: string;
    /** Title assertion is unused on these screens; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    // ── List ────────────────────────────────────────────────────────
    /** The "New <Entity>" button at the top-right of the list. */
    readonly newButton: Locator;

    // ── Form ────────────────────────────────────────────────────────
    readonly saveButton: Locator;
    readonly cancelButton: Locator;
    /** The screen's validation/duplicate message. */
    readonly rejectionMessage: Locator;
    /** The "N error ▼" summary button shown when validation fails. */
    readonly errorSummaryButton: Locator;
    /** The "Unsaved changes" bar shown while an edit is pending. */
    readonly unsavedChangesBar: Locator;

    constructor(page: Page, config: SetupScreenConfig) {
        super(page);
        this.config = config;
        this.pageUrl = config.listUrl;
        this.leftNav = new LeftNavigationPage(page);
        this.grid = new DataGridComponent(page, config.gridName, config.entity);

        this.newButton = page.getByRole('button', { name: `New ${config.entity}` });
        this.saveButton = page.getByRole('button', { name: 'Save' });
        this.cancelButton = page.getByRole('button', { name: 'Cancel' });
        this.rejectionMessage = page.getByText(config.rejectionMessage);
        this.errorSummaryButton = page.getByRole('button', { name: /error/ });
        this.unsavedChangesBar = page.getByText('Unsaved changes');
    }

    /** URL pattern of a saved record's Edit page — `<listUrl>/<id>`, query optional. */
    protected get editUrlPattern(): RegExp {
        return new RegExp(`${this.config.listUrl.replace(/\//g, '\\/')}\\/\\d+(\\?|$)`);
    }

    /** URL pattern of the New form — `<listUrl>/new`, query optional. */
    protected get newUrlPattern(): RegExp {
        return new RegExp(`${this.config.listUrl.replace(/\//g, '\\/')}\\/new(\\?|$)`);
    }

    // ── Navigation ──────────────────────────────────────────────────

    /**
     * Open the list by walking the real sidebar menu, the way a person does, so a
     * recording captures the navigation instead of a bare URL jump. Loads the
     * authenticated shell first if the sidebar isn't showing yet (e.g. at the start
     * of a test, when the page is still blank).
     */
    async gotoList(): Promise<void> {
        const sidebarReady = await this.leftNav.searchMenu.isVisible().catch(() => false);
        if (!sidebarReady) {
            await this.page.goto('/', { waitUntil: 'domcontentloaded' });
            await this.leftNav.searchMenu.waitFor({ state: 'visible' });
        }
        await this.leftNav.openViaMenu(this.config.menuPath, this.config.listUrl);
        await this.newButton.waitFor({ state: 'visible' });
    }

    /** From the list, open the New form. */
    async openNewForm(): Promise<void> {
        await this.newButton.click();
        await this.page.waitForURL(this.newUrlPattern);
        await this.firstFormField.waitFor({ state: 'visible' });
    }

    /** From the list, open a record's Edit form via its row link. */
    async openEdit(name: string): Promise<void> {
        await this.grid.editLink(name).click();
        // The Edit URL may carry the list's filter state as a query string
        // (e.g. /settings/users/134?name=QA+User+x), so don't anchor on the id.
        await this.page.waitForURL(this.editUrlPattern);
        await this.firstFormField.waitFor({ state: 'visible' });
    }

    // ── Saving ──────────────────────────────────────────────────────

    /**
     * Submit the New form and resolve to what the app did. Screens wrap this in a
     * public method named for their own rejection reason.
     *
     * Blurs the last-edited field first so on-blur validation runs, then waits for
     * validation to settle — Save becomes enabled, or the screen's rejection
     * message appears. A rejection can also come back from the server after Save
     * is clicked, so both are checked again afterwards.
     */
    protected async submitForm(): Promise<FormOutcome> {
        await this.blurForValidation();

        await expect(async () => {
            const enabled = await this.saveButton.isEnabled();
            const rejected = await this.rejectionMessage.isVisible();
            expect(enabled || rejected).toBeTruthy();
        }).toPass({ timeout: SetupScreenPage.SETTLE_TIMEOUT });

        if (!(await this.saveButton.isEnabled())) return 'rejected';

        await this.saveButton.click();

        await expect(async () => {
            const created = this.editUrlPattern.test(this.page.url());
            const rejected = await this.rejectionMessage.isVisible();
            expect(created || rejected).toBeTruthy();
        }).toPass({ timeout: SetupScreenPage.SETTLE_TIMEOUT });

        return this.editUrlPattern.test(this.page.url()) ? 'created' : 'rejected';
    }

    /**
     * Save edits on an existing record's form. Assumes a field was just changed and
     * blurred, so the "Unsaved changes" bar is showing with Save enabled; the bar
     * clearing is the signal that the change committed.
     */
    async saveEdit(): Promise<void> {
        await expect(this.saveButton).toBeEnabled();
        await this.saveButton.click();
        await expect(this.unsavedChangesBar).toBeHidden();
    }

    /**
     * Reload the list from the server and assert the record is gone.
     *
     * Forces a full navigation rather than SPA routing: reaching the list through
     * the sidebar can serve a cached grid still showing a just-deleted record, so
     * absence must be asserted against a fresh fetch. Works from any page.
     */
    async expectAbsentFromList(name: string): Promise<void> {
        await this.navigate();
        await this.newButton.waitFor({ state: 'visible' });
        await this.grid.expectAbsent(name);
    }

    // ── Screen-specific hooks ───────────────────────────────────────

    /**
     * A field that is present as soon as the form has rendered — used to wait for
     * the New/Edit form to be interactive. Usually the Name input.
     */
    protected abstract get firstFormField(): Locator;

    /**
     * Blur the last-edited field so the form's on-blur validation runs before Save
     * is inspected. Defaults to blurring whatever is focused, which is correct
     * whenever the form was filled top-to-bottom; a screen whose last field needs
     * different handling overrides this.
     */
    protected async blurForValidation(): Promise<void> {
        await this.page.locator(':focus').blur().catch(() => {
            // Nothing focused (e.g. the caller already blurred) — validation has
            // either run or there was no pending field to validate.
        });
    }
}

export default SetupScreenPage;
