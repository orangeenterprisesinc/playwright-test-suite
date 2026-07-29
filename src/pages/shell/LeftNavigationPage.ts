/**
 * @fileoverview Page Object for the PET Tiger left navigation sidebar.
 *
 * The sidebar landmarks below confirm that the authenticated app shell has
 * rendered — used as the post-login success signal — and expose the real
 * click-through menu path (File ▸ Administration ▸ Users) so tests can navigate
 * the way a human does instead of jumping straight to a URL with `page.goto`.
 * Driving the actual menu is what lets the recorded video capture the
 * navigation steps (see tests/ui/journey-a1-walkthrough.spec.ts).
 *
 * @module pages/LeftNavigationPage
 * @since 1.0.0
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object representing the authenticated shell's left navigation.
 *
 * @class LeftNavigationPage
 * @extends BasePage
 */
export class LeftNavigationPage extends BasePage {
    /** The authenticated shell lives at the app root. */
    readonly pageUrl: string = '/';
    /** Title assertion is not used by the login suite; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    /** Sidebar menu search box — visible only when logged in. */
    readonly searchMenu: Locator;
    /** "Welcome back" greeting — visible only when logged in. */
    readonly welcomeBack: Locator;

    constructor(page: Page) {
        super(page);
        this.searchMenu = page.getByPlaceholder('Search menu');
        this.welcomeBack = page.getByText('Welcome back');
    }

    /**
     * A single sidebar menu entry, matched by its visible label.
     *
     * The sidebar renders its groups ("File", "Administration") and leaf items
     * ("Users") as clickable text whose element role varies, so this matches a
     * link, button, menuitem, or treeitem with the given accessible name. Names
     * are matched exactly to avoid "Users" also matching the "Users" list
     * heading; the first match wins.
     */
    menuItem(name: string): Locator {
        return this.page
            .getByRole('link', { name, exact: true })
            .or(this.page.getByRole('button', { name, exact: true }))
            .or(this.page.getByRole('menuitem', { name, exact: true }))
            .or(this.page.getByRole('treeitem', { name, exact: true }))
            .first();
    }

    /**
     * Expand a collapsible sidebar group ("File", "Administration") if its
     * children are not already showing. Clicking an already-expanded group in
     * PET Tiger collapses it, so this only clicks when the target child is
     * hidden — keeping the walkthrough idempotent regardless of the sidebar's
     * starting state.
     *
     * @param group the group label to expand (e.g. "File")
     * @param child a child label used to detect whether the group is open
     */
    async expandGroup(group: string, child: string): Promise<void> {
        if (await this.menuItem(child).isVisible().catch(() => false)) return;
        await this.menuItem(group).click();
        await this.menuItem(child).waitFor({ state: 'visible' });
    }

    /**
     * Navigate to the Users administration screen the way a user does:
     * File ▸ Administration ▸ Users. Waits for the Users list URL so callers
     * can proceed once the grid route is active.
     */
    async openUsersViaMenu(): Promise<void> {
        this.logger.info('Navigating via menu: File ▸ Administration ▸ Users');
        await this.expandGroup('File', 'Administration');
        await this.expandGroup('Administration', 'Users');
        await this.menuItem('Users').click();
        // Tolerate a query string (the app can carry grid state in the URL).
        await this.page.waitForURL(/\/settings\/users(\?|$)/);
    }
}
