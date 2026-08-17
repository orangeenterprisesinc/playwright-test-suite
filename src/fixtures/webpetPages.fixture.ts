/**
 * @fileoverview One lazy accessor for every web-pet page object.
 *
 * Structurally identical to `src/fixtures/pages.fixture.ts` — same memo map,
 * same lazy getters, same "add a screen = one interface line + one getter"
 * contract — but a **separate registry**. Reusing `PageObjects` would put
 * web-pet screens into the journey suites' namespace, and its existing members
 * (`LoginPage`, `LeftNavigationPage`, `UsersPage`) target the legacy shell, not
 * this SPA.
 *
 * The suite needs roughly fifty screens once every batch has landed, so each is
 * constructed on first access: a spec touching one screen never pays for the
 * other forty-nine.
 *
 * ```typescript
 * test('…', async ({ pages }) => {
 *   await pages.cropForm.gotoNew();
 * });
 * ```
 */
import type { Page } from '@playwright/test';
import { AppShellPage } from '../pages/webpet/shell/AppShellPage';
import { LoginPage } from '../pages/webpet/shell/LoginPage';
import { BoardFormPage } from '../pages/webpet/setup/BoardFormPage';
import { ExportToAccountingPage } from '../pages/accounting/ExportToAccountingPage';
import { ExportDispatchWorkspacePage } from '../pages/accounting/ExportDispatchWorkspacePage';
import { ReconcileJobCardsPage } from '../pages/accounting/ReconcileJobCardsPage';
import { ToastComponent } from '../components/webpet/ToastComponent';
import { ProfilePage } from '../pages/webpet/settings/ProfilePage';
import { BillingCenterFormPage } from '../pages/setup/BillingCenterFormPage';
import { BillingCenterListPage } from '../pages/webpet/setup/BillingCenterListPage';
import { CrewFormPage } from '../pages/webpet/setup/CrewFormPage';
import { CustomerFormPage } from '../pages/webpet/setup/CustomerFormPage';
import { CustomerListPage } from '../pages/setup/CustomerListPage';
import { DepartmentFormPage } from '../pages/webpet/setup/DepartmentFormPage';
import { DepartmentListPage } from '../pages/webpet/setup/DepartmentListPage';
import { TermListPage } from '../pages/setup/TermListPage';
import { TimeSheetValidationFormPage } from '../pages/webpet/setup/TimeSheetValidationFormPage';
import { TimeSheetValidationListPage } from '../pages/webpet/setup/TimeSheetValidationListPage';

/**
 * Every web-pet page object, lazily constructed.
 *
 * List and form are separate entries per entity, not one object: the app's list
 * pages moved to the new DataGrid library (PET-424) while its form pages did
 * not, so tying the two together would couple a stable surface to a volatile
 * one.
 */
export interface WebpetPages {
    // ── Shell ───────────────────────────────────────────────────────
    /** Sidebar navigation, the user menu and its language submenu. */
    readonly shell: AppShellPage;
    /** The sign-in screen (`/login`) — reached from an unauthenticated context. */
    readonly login: LoginPage;
    /**
     * The global toast surface.
     *
     * Not a page: notifications are app-wide, and several specs assert on them
     * while driving an unrelated screen.
     */
    readonly toasts: ToastComponent;

    // ── Settings ────────────────────────────────────────────────────
    /** The user's own profile (`/profile`) — language, password, avatar. */
    readonly profile: ProfilePage;

    // ── Setup ▸ Traceability ────────────────────────────────────────

    // ── Setup ▸ People ──────────────────────────────────────────────
    /** Crew create/edit form (`/setup/crews/{new,:id}`). */
    readonly crewForm: CrewFormPage;
    /** Department create/edit form (`/setup/departments/{new,:id}`). */
    readonly departmentForm: DepartmentFormPage;
    /** Department list (`/setup/departments`). */
    readonly departmentList: DepartmentListPage;

    // ── Setup ▸ Customers ───────────────────────────────────────────
    /** Customer create/edit form (`/setup/customers/{new,:id}`) — includes the contacts sub-form. */
    readonly customerForm: CustomerFormPage;
    /** Customer list (`/setup/customers`). */
    readonly customerList: CustomerListPage;

    // ── Setup ▸ Jobs ────────────────────────────────────────────────
    /** Board create/edit form (`/setup/boards/{new,:id}`) — error-toast coverage only. */
    readonly boardForm: BoardFormPage;

    // ── Setup ▸ Equipment ───────────────────────────────────────────

    // ── Setup ▸ Grower Billing ──────────────────────────────────────
    /** Terms list (`/setup/terms`) — module-gated, may legitimately 403. */
    readonly termList: TermListPage;
    /** Billing Center create/edit form — module-gated, may legitimately 403. */
    readonly billingCenterForm: BillingCenterFormPage;
    /** Billing Center list (`/setup/billing-centers`). */
    readonly billingCenterList: BillingCenterListPage;

    // ── Setup ▸ Timesheet ───────────────────────────────────────────
    /** TimeSheet Validation form — module-gated, may legitimately 403. */
    readonly timeSheetValidationForm: TimeSheetValidationFormPage;
    /** TimeSheet Validation list, plus its soft-deleted list. */
    readonly timeSheetValidationList: TimeSheetValidationListPage;

    // Bonus moved to PageObjects (`src/fixtures/pages.fixture.ts`) with its two
    // specs — `tests/web/screens/bonus/`. No web-pet spec reaches it any more.

    // ── Accounting ──────────────────────────────────────────────────
    /** Export to Accounting, v1 filter surface (`/export-to-accounting`). */
    readonly exportToAccounting: ExportToAccountingPage;
    /** Export to Accounting v2 dispatch workspace (`?pt-export-new-ia=true`). */
    readonly exportWorkspace: ExportDispatchWorkspacePage;
    /** Reconcile Job Cards (`/reconcile-job-cards`) — preference- and permission-gated. */
    readonly reconcileJobCards: ReconcileJobCardsPage;

    // Scan and Input moved to PageObjects (`src/fixtures/pages.fixture.ts`) with
    // their specs — `tests/web/journey-a-setup/a07-*`, `tests/api/journey-a-setup/
    // a07-data-scoping`, `tests/web/journey-b-field/b03-*`. No web-pet spec
    // reaches them any more.
}

/**
 * Builds the lazy page-object accessor for a page.
 *
 * Getters with a memo map rather than eager construction, so the cost of a
 * screen is paid only by the tests that use it.
 */
export function createWebpetPages(page: Page): WebpetPages {
    const memo = new Map<string, unknown>();

    /** Constructs `key`'s page object once, then returns the same instance. */
    function lazy<T>(key: string, build: () => T): T {
        if (!memo.has(key)) memo.set(key, build());
        return memo.get(key) as T;
    }

    return {
        get shell() { return lazy('shell', () => new AppShellPage(page)); },
        get login() { return lazy('login', () => new LoginPage(page)); },
        get toasts() { return lazy('toasts', () => new ToastComponent(page)); },
        get boardForm() { return lazy('boardForm', () => new BoardFormPage(page)); },
        get profile() { return lazy('profile', () => new ProfilePage(page)); },
        get crewForm() { return lazy('crewForm', () => new CrewFormPage(page)); },
        get departmentForm() { return lazy('departmentForm', () => new DepartmentFormPage(page)); },
        get departmentList() { return lazy('departmentList', () => new DepartmentListPage(page)); },
        get customerForm() { return lazy('customerForm', () => new CustomerFormPage(page)); },
        get customerList() { return lazy('customerList', () => new CustomerListPage(page)); },
        get termList() { return lazy('termList', () => new TermListPage(page)); },
        get timeSheetValidationForm() {
            return lazy('timeSheetValidationForm', () => new TimeSheetValidationFormPage(page));
        },
        get timeSheetValidationList() {
            return lazy('timeSheetValidationList', () => new TimeSheetValidationListPage(page));
        },
        get exportToAccounting() { return lazy('exportToAccounting', () => new ExportToAccountingPage(page)); },
        get exportWorkspace() { return lazy('exportWorkspace', () => new ExportDispatchWorkspacePage(page)); },
        get reconcileJobCards() { return lazy('reconcileJobCards', () => new ReconcileJobCardsPage(page)); },
        get billingCenterForm() { return lazy('billingCenterForm', () => new BillingCenterFormPage(page)); },
        get billingCenterList() { return lazy('billingCenterList', () => new BillingCenterListPage(page)); },
    };
}
