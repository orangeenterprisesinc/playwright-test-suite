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
import { RanchListPage } from '../pages/setup/RanchListPage';
import { RanchFormPage } from '../pages/setup/RanchFormPage';
import { FieldListPage } from '../pages/setup/FieldListPage';
import { VarietyListPage } from '../pages/setup/VarietyListPage';
import { TraceLookupListPage } from '../pages/setup/TraceLookupListPage';
import { OnboardingBadgeListPage } from '../pages/setup/OnboardingBadgeListPage';
import { OnboardingBadgeFormPage } from '../pages/setup/OnboardingBadgeFormPage';
import { JobListPage } from '../pages/setup/JobListPage';
import { JobGroupFormPage } from '../pages/setup/JobGroupFormPage';
import { JobGroupListPage } from '../pages/setup/JobGroupListPage';
import { TimeCardFormPage } from '../pages/processing/TimeCardFormPage';
import { EquipmentListPage } from '../pages/setup/EquipmentListPage';
import { InventoryListPage } from '../pages/setup/InventoryListPage';
import { ExportToAccountingPage } from '../pages/accounting/ExportToAccountingPage';
import { ExportDispatchWorkspacePage } from '../pages/accounting/ExportDispatchWorkspacePage';
import { ReconcileJobCardsPage } from '../pages/accounting/ReconcileJobCardsPage';
import { ScanScreenPage } from '../pages/scan/ScanScreenPage';
import { ScanLandingPage } from '../pages/scan/ScanLandingPage';
import { ScanDeviceFormPage } from '../pages/setup/ScanDeviceFormPage';
import { TimeInListPage } from '../pages/input/TimeInListPage';
// Still under src/pages/webpet/ and src/components/webpet/ — each of these is
// also used by web-pet specs that have not relocated yet. A page object moves
// to its journey home in the batch that relocates its *last* web-pet consumer;
// until then the import crosses the tree. Moving one earlier would drop it from
// the web-pet registry and break those specs at typecheck.
import { CustomerFormPage } from '../pages/webpet/setup/CustomerFormPage';
import { DepartmentFormPage } from '../pages/webpet/setup/DepartmentFormPage';
import { DepartmentListPage } from '../pages/webpet/setup/DepartmentListPage';
import { CropFormPage } from '../pages/webpet/setup/CropFormPage';
import { CropListPage } from '../pages/setup/CropListPage';
import { VarietyFormPage } from '../pages/webpet/setup/VarietyFormPage';
import { EmployeeFormPage } from '../pages/webpet/setup/EmployeeFormPage';
import { EmployeeListPage } from '../pages/setup/EmployeeListPage';
import { UsersFormPage } from '../pages/webpet/settings/UsersFormPage';
import { CrewFormPage } from '../pages/webpet/setup/CrewFormPage';
import { CrewListPage } from '../pages/webpet/setup/CrewListPage';
import { JobFormPage } from '../pages/webpet/setup/JobFormPage';
import { EquipmentFormPage } from '../pages/webpet/setup/EquipmentFormPage';
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

    // ── Setup ▸ A2 traceability hierarchy ───────────────────────────
    /** Ranch list (A2, D7). */
    readonly ranchList: RanchListPage;
    /** Ranch New/Edit form, including the boundary editor (A2). */
    readonly ranchForm: RanchFormPage;
    /** Field list (A2, D7). */
    readonly fieldList: FieldListPage;
    /** Crop New/Edit form (A2). */
    readonly cropForm: CropFormPage;
    /** Crop list (A2). */
    readonly cropList: CropListPage;
    /** Variety New/Edit form (A2). */
    readonly varietyForm: VarietyFormPage;
    /** Variety list (A2). */
    readonly varietyList: VarietyListPage;
    /** Traceability ▸ Grades lookup list (A2). */
    readonly gradeList: TraceLookupListPage;
    /** Traceability ▸ Sizes lookup list (A2). */
    readonly sizeList: TraceLookupListPage;

    // ── Setup ▸ People ──────────────────────────────────────────────
    /** Employee New/Edit form (A5), including the Documents tab. */
    readonly employeeForm: EmployeeFormPage;
    /** Employee list (A5). */
    readonly employeeList: EmployeeListPage;
    /** Onboarding Badge New/Edit form (`/setup/badge`, A13) — Employee RecordType 1. */
    readonly onboardingBadgeForm: OnboardingBadgeFormPage;
    /** Onboarding Badge list (A13). */
    readonly onboardingBadgeList: OnboardingBadgeListPage;

    /** Web-pet's own user admin form (`/settings/users`, A1) — not the journey `users` screen. */
    readonly usersForm: UsersFormPage;
    /** Crew New/Edit form (A4). */
    readonly crewForm: CrewFormPage;
    /** Crew list (A4). */
    readonly crewList: CrewListPage;

    // ── Setup ▸ Jobs (A3) ───────────────────────────────────────────
    /** Job New/Edit form — Overtime Rules FK required. */
    readonly jobForm: JobFormPage;
    /** Job list. */
    readonly jobList: JobListPage;
    /** Job Group New/Edit form. */
    readonly jobGroupForm: JobGroupFormPage;
    /** Job Group list. */
    readonly jobGroupList: JobGroupListPage;

    // ── Setup ▸ Equipment (A12) ─────────────────────────────────────
    /** Equipment New/Edit form — Equipment Type FK required on create. */
    readonly equipmentForm: EquipmentFormPage;
    /** Equipment list. */
    readonly equipmentList: EquipmentListPage;

    // ── Setup ▸ Inventory ───────────────────────────────────────────
    // One class, five screens: the lists differ only in route and heading.
    /** Inventory Item Type list. */
    readonly inventoryItemTypeList: InventoryListPage;
    /** Inventory Item list. */
    readonly inventoryItemList: InventoryListPage;
    /** Inventory Center list. */
    readonly inventoryCenterList: InventoryListPage;
    /** Unit Type list. */
    readonly inventoryUnitTypeList: InventoryListPage;
    /** Unit list. */
    readonly inventoryUnitList: InventoryListPage;

    // ── Accounting ▸ export and reconcile (E9, E10) ─────────────────
    /** Export to Accounting, v1 filter surface (`/export-to-accounting`). */
    readonly exportToAccounting: ExportToAccountingPage;
    /** Export to Accounting v2 dispatch workspace. */
    readonly exportWorkspace: ExportDispatchWorkspacePage;
    /** Reconcile Job Cards — preference- and permission-gated. */
    readonly reconcileJobCards: ReconcileJobCardsPage;

    // ── Scan Mode (A7) ──────────────────────────────────────────────
    /** The scan landing grid (`/scan`) — one card per scan screen. */
    readonly scanLanding: ScanLandingPage;
    /** Any `/scan/:segment` screen — the shared shell, input and status. */
    readonly scanScreen: ScanScreenPage;
    /** Scan device create/edit form — two-step: General on new, Preferences on edit. */
    readonly scanDeviceForm: ScanDeviceFormPage;

    // ── Input ▸ time cards (D3) ─────────────────────────────────────
    /** Time card entry form — office correction of a crew time card. */
    readonly timeCardForm: TimeCardFormPage;
    /** Time In list (`/input/time-in`) — counter-keyed dropdown columns. */
    readonly timeInList: TimeInListPage;

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
        get ranchList() { return lazy('ranchList', () => new RanchListPage(page)); },
        get ranchForm() { return lazy('ranchForm', () => new RanchFormPage(page)); },
        get fieldList() { return lazy('fieldList', () => new FieldListPage(page)); },
        get cropForm() { return lazy('cropForm', () => new CropFormPage(page)); },
        get cropList() { return lazy('cropList', () => new CropListPage(page)); },
        get varietyForm() { return lazy('varietyForm', () => new VarietyFormPage(page)); },
        get varietyList() { return lazy('varietyList', () => new VarietyListPage(page)); },
        // Route and title are constructor args — the same class serves both lookups.
        get gradeList() {
            return lazy('gradeList', () => new TraceLookupListPage(page, '/setup/traceability/grades', 'Grades'));
        },
        get sizeList() {
            return lazy('sizeList', () => new TraceLookupListPage(page, '/setup/traceability/sizes', 'Sizes'));
        },
        get employeeForm() { return lazy('employeeForm', () => new EmployeeFormPage(page)); },
        get employeeList() { return lazy('employeeList', () => new EmployeeListPage(page)); },
        get onboardingBadgeForm() { return lazy('onboardingBadgeForm', () => new OnboardingBadgeFormPage(page)); },
        get onboardingBadgeList() { return lazy('onboardingBadgeList', () => new OnboardingBadgeListPage(page)); },
        get usersForm() { return lazy('usersForm', () => new UsersFormPage(page)); },
        get crewForm() { return lazy('crewForm', () => new CrewFormPage(page)); },
        get crewList() { return lazy('crewList', () => new CrewListPage(page)); },
        get jobForm() { return lazy('jobForm', () => new JobFormPage(page)); },
        get jobList() { return lazy('jobList', () => new JobListPage(page)); },
        get jobGroupForm() { return lazy('jobGroupForm', () => new JobGroupFormPage(page)); },
        get jobGroupList() { return lazy('jobGroupList', () => new JobGroupListPage(page)); },
        get equipmentForm() { return lazy('equipmentForm', () => new EquipmentFormPage(page)); },
        get equipmentList() { return lazy('equipmentList', () => new EquipmentListPage(page)); },
        get inventoryItemTypeList() {
            return lazy('inventoryItemTypeList', () => new InventoryListPage(page, '/setup/inventory/item-types', 'Inventory Item Types'));
        },
        get inventoryItemList() {
            return lazy('inventoryItemList', () => new InventoryListPage(page, '/setup/inventory/items', 'Inventory Items'));
        },
        get inventoryCenterList() {
            return lazy('inventoryCenterList', () => new InventoryListPage(page, '/setup/inventory/centers', 'Inventory Centers'));
        },
        get inventoryUnitTypeList() {
            return lazy('inventoryUnitTypeList', () => new InventoryListPage(page, '/setup/inventory/unit-types', 'Unit Types'));
        },
        get inventoryUnitList() {
            return lazy('inventoryUnitList', () => new InventoryListPage(page, '/setup/inventory/units', 'Units'));
        },
        get exportToAccounting() { return lazy('exportToAccounting', () => new ExportToAccountingPage(page)); },
        get exportWorkspace() { return lazy('exportWorkspace', () => new ExportDispatchWorkspacePage(page)); },
        get reconcileJobCards() { return lazy('reconcileJobCards', () => new ReconcileJobCardsPage(page)); },
        get scanLanding() { return lazy('scanLanding', () => new ScanLandingPage(page)); },
        get scanScreen() { return lazy('scanScreen', () => new ScanScreenPage(page)); },
        get scanDeviceForm() { return lazy('scanDeviceForm', () => new ScanDeviceFormPage(page)); },
        get timeCardForm() { return lazy('timeCardForm', () => new TimeCardFormPage(page)); },
        get timeInList() { return lazy('timeInList', () => new TimeInListPage(page)); },
        get shell() { return lazy('shell', () => new AppShellPage(page)); },
        get toasts() { return lazy('toasts', () => new ToastComponent(page)); },
    };
}
