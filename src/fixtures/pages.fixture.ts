/**
 * @fileoverview One lazy accessor for every page object in the suite.
 *
 * The catalog needs roughly forty screens across its six journeys. Declaring a
 * Playwright fixture per screen would make `base.fixture.ts` mostly boilerplate
 * and force every spec author to remember which fixture name maps to which
 * screen. Instead a spec destructures `pages` and reaches what it needs:
 *
 * ```typescript
 * test('...', async ({ pages }) => {
 *   await pages.users.gotoUsersList();
 *   await pages.users.openNewUserForm();
 * });
 * ```
 *
 * Each page object is constructed on first access and reused for the rest of the
 * test, so a spec touching one screen never pays for the other thirty-nine.
 *
 * Grouped by the app's own menu areas, matching `src/pages/`.
 */
import type { Page } from '@playwright/test';
import { LoginPage } from '../pages/shell/LoginPage';
import { LeftNavigationPage } from '../pages/shell/LeftNavigationPage';
import { UsersPage } from '../pages/admin/UsersPage';
import { TransferToJobCardsPage } from '../pages/processing/TransferToJobCardsPage';
import { ImportInternetPage } from '../pages/connectivity/ImportInternetPage';
import { BonusWizardPage } from '../pages/bonus/BonusWizardPage';
import { CustomerListPage } from '../pages/setup/CustomerListPage';
import { BillingCenterFormPage } from '../pages/setup/BillingCenterFormPage';
import { TermListPage } from '../pages/setup/TermListPage';
// Still under src/pages/webpet/ and src/components/webpet/ — each of these is
// also used by web-pet specs that have not relocated yet. A page object moves
// to its journey home in the batch that relocates its *last* web-pet consumer;
// until then the import crosses the tree. Moving one earlier would drop it from
// the web-pet registry and break those specs at typecheck.
import { CustomerFormPage } from '../pages/webpet/setup/CustomerFormPage';
import { DepartmentFormPage } from '../pages/webpet/setup/DepartmentFormPage';
import { DepartmentListPage } from '../pages/webpet/setup/DepartmentListPage';
import { AppShellPage } from '../pages/webpet/shell/AppShellPage';
import { ToastComponent } from '../components/webpet/ToastComponent';

/**
 * Every page object, lazily constructed.
 *
 * Add a screen here and under `src/pages/<area>/` — nothing else needs touching.
 */
export interface PageObjects {
    // ── shell ───────────────────────────────────────────────────────
    /** Keycloak login page. */
    readonly login: LoginPage;
    /** The authenticated shell's left navigation sidebar. */
    readonly leftNav: LeftNavigationPage;

    // ── File ▸ Administration ───────────────────────────────────────
    /** Users administration screen and New/Edit User form (A1). */
    readonly users: UsersPage;

    // ── Input ▸ processing ──────────────────────────────────────────
    /** Transfer to Job Card review screen (D2/D4; Journey B verification). */
    readonly transferToJobCards: TransferToJobCardsPage;

    // ── Connectivity ────────────────────────────────────────────────
    /** Connectivity ▸ Import ▸ Internet — the office's relay pull (Journey B). */
    readonly importInternet: ImportInternetPage;

    // ── Bonus ───────────────────────────────────────────────────────
    /** The Bonus wizard (`/bonus`, `/bonus/:type`) — 18 types, two steps. */
    readonly bonusWizard: BonusWizardPage;

    // ── Setup ▸ records ─────────────────────────────────────────────
    /** Customer New/Edit form, including the contacts sub-form. */
    readonly customerForm: CustomerFormPage;
    /** Customer list. */
    readonly customerList: CustomerListPage;
    /** Department New/Edit form. */
    readonly departmentForm: DepartmentFormPage;
    /** Department list. */
    readonly departmentList: DepartmentListPage;
    /** Billing Center New/Edit form — gated on the GrowerBilling module. */
    readonly billingCenterForm: BillingCenterFormPage;
    /** Terms list — gated on the GrowerBilling module. */
    readonly termList: TermListPage;

    /** The authenticated shell: sidebar navigation and dashboard. */
    readonly shell: AppShellPage;

    /**
     * The global toast surface.
     *
     * Not a page: notifications are app-wide, and a spec may assert on one while
     * driving an unrelated screen.
     */
    readonly toasts: ToastComponent;
}

/**
 * Builds the lazy page-object accessor for a page.
 *
 * Uses getters with a memo map rather than eager construction, so the cost of a
 * screen is paid only by the tests that use it.
 */
export function createPageObjects(page: Page): PageObjects {
    const memo = new Map<string, unknown>();

    /** Constructs `key`'s page object once, then returns the same instance. */
    function lazy<T>(key: string, build: () => T): T {
        if (!memo.has(key)) memo.set(key, build());
        return memo.get(key) as T;
    }

    return {
        get login() { return lazy('login', () => new LoginPage(page)); },
        get leftNav() { return lazy('leftNav', () => new LeftNavigationPage(page)); },
        get users() { return lazy('users', () => new UsersPage(page)); },
        get transferToJobCards() { return lazy('transferToJobCards', () => new TransferToJobCardsPage(page)); },
        get importInternet() { return lazy('importInternet', () => new ImportInternetPage(page)); },
        get bonusWizard() { return lazy('bonusWizard', () => new BonusWizardPage(page)); },
        get customerForm() { return lazy('customerForm', () => new CustomerFormPage(page)); },
        get customerList() { return lazy('customerList', () => new CustomerListPage(page)); },
        get departmentForm() { return lazy('departmentForm', () => new DepartmentFormPage(page)); },
        get departmentList() { return lazy('departmentList', () => new DepartmentListPage(page)); },
        get billingCenterForm() { return lazy('billingCenterForm', () => new BillingCenterFormPage(page)); },
        get termList() { return lazy('termList', () => new TermListPage(page)); },
        get shell() { return lazy('shell', () => new AppShellPage(page)); },
        get toasts() { return lazy('toasts', () => new ToastComponent(page)); },
    };
}
