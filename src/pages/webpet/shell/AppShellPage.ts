/**
 * @fileoverview The authenticated app shell — dashboard and sidebar navigation.
 *
 * Introduced for one assertion in `term.spec.ts`: when a module is absent from
 * `PT_MODULES`, its route 403s **and** its sidebar entry disappears, and the
 * second half of that has to be checked from `/dashboard`. Kept deliberately
 * thin — Batch 6 converts the dashboard specs and will grow it.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class AppShellPage extends BasePage {
    readonly pageUrl: string = '/dashboard';
    readonly pageTitle: string | RegExp = /.*/;

    /**
     * The UserMenu's avatar dropdown trigger.
     *
     * UserMenu lives in the **sidebar**, not a `<header>` — an earlier
     * header-scoped selector never matched and hung on the actionability wait,
     * which then surfaced as a misleading context-closed cascade. Matched by
     * slot and `.first()` because the shell mounts more than one dropdown.
     */
    readonly userMenuTrigger: Locator;
    /** The Language submenu inside the open user menu. */
    readonly languageSubTrigger: Locator;
    /** The sign-out item inside the open user menu. */
    readonly logOutMenuItem: Locator;
    /**
     * The sidebar navigation container.
     *
     * Exposed so an entry can be asserted *absent within the sidebar* rather than
     * absent from the page: the label under test also appears in page headings and
     * breadcrumbs, so a page-wide `toHaveCount(0)` would fail for the wrong reason.
     */
    readonly sidebarNav: Locator;

    constructor(page: Page) {
        super(page);

        this.sidebarNav = page.locator('[data-testid="sidebar-nav"]');
        this.userMenuTrigger = page.locator('[data-slot="dropdown-menu-trigger"]').first();
        this.languageSubTrigger = page
            .locator('[data-slot="dropdown-menu-sub-trigger"]')
            .filter({ hasText: 'Language' });
        this.logOutMenuItem = page.getByRole('menuitem', { name: /log out/i });
    }

    /** A locale choice in the open Language submenu, e.g. `'Spanish (es)'` or `'System'`. */
    localeOption(name: string): Locator {
        return this.page.getByRole('menuitemradio', { name });
    }

    /** Open the user menu, then its Language submenu. */
    async openLanguageMenu(): Promise<void> {
        await this.userMenuTrigger.click();
        await this.languageSubTrigger.click();
    }

    /**
     * Navigate to the dashboard.
     *
     * A plain `goto`, not `BasePage.navigate()`, which pins
     * `waitUntil: 'domcontentloaded'` — the lifted specs use the default.
     */
    async gotoDashboard(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /**
     * Navigate to the app root, which redirects into the authenticated shell.
     *
     * A plain `goto`, not `BasePage.navigateTo()` — that pins
     * `waitUntil: 'domcontentloaded'` while the lifted specs use the default.
     */
    async gotoRoot(): Promise<void> {
        await this.page.goto('/');
    }

    /**
     * A sidebar entry by anchored, case-insensitive name.
     *
     * Used to assert **absence** for a module the tenant has not licensed, so
     * the match is anchored: a loose match would also hit "Payment Terms" and
     * report a link that is not the one under test.
     */
    navLink(name: string): Locator {
        return this.page.getByRole('link', { name: new RegExp(`^${name}$`, 'i') });
    }

    /**
     * A sidebar entry by exact name.
     *
     * `exact: true` is load-bearing wherever sibling entries nest: role-name
     * matching is substring by default, so "Inventory Item" would also match
     * "Inventory Item Type" and "Unit" would match "Unit Type", tripping strict
     * mode once every link in the group is live.
     */
    navLinkExact(name: string): Locator {
        return this.page.getByRole('link', { name, exact: true });
    }

    /**
     * A sidebar entry by Playwright's **default** name match — substring,
     * case-insensitive, whitespace-normalised.
     *
     * A fourth matcher because the three above are each stricter in a different
     * way and none of them is a drop-in substitute: `navLink` anchors, so it
     * rejects a label with a suffix; `navLinkExact` is case-*sensitive*; and
     * `navLinkMatching`'s regex is case-sensitive too. Where a lifted spec passed
     * a plain string, this is the faithful relocation. Do not consolidate them.
     */
    navLinkNamed(name: string): Locator {
        return this.page.getByRole('link', { name });
    }

    /** Sidebar text matched inside the nav container — see {@link sidebarNav}. */
    sidebarNavText(text: string): Locator {
        return this.sidebarNav.getByText(text);
    }

    /**
     * A sidebar entry matched by an arbitrary pattern.
     *
     * For the module-gated links, whose labels are asserted loosely — the tests
     * care that the entry is *absent* when a module is off, not about its exact
     * wording.
     */
    navLinkMatching(pattern: RegExp): Locator {
        return this.page.getByRole('link', { name: pattern });
    }

    /**
     * A collapsible sidebar group's trigger. The sidebar uses the group label as
     * the button text.
     */
    navGroup(name: string): Locator {
        return this.page.getByRole('button', { name });
    }

    /** Expand a collapsible sidebar group. */
    async openNavGroup(name: string): Promise<void> {
        await this.navGroup(name).click();
    }
}

export default AppShellPage;
