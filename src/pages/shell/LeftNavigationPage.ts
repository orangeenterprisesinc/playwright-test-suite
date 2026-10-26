/**
 * @fileoverview Page Object for the PET Tiger left navigation sidebar.
 *
 * The sidebar landmarks below confirm that the authenticated app shell has
 * rendered — used as the post-login success signal — and expose the real
 * click-through menu path (File ▸ Administration ▸ Users) so tests can navigate
 * the way a human does instead of jumping straight to a URL with `page.goto`.
 * Driving the actual menu is what lets the recorded video capture the
 * navigation steps (see the journey specs under tests/web/).
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Page Object representing the authenticated shell's left navigation.
 *
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
        return this.menuItems(name).first();
    }

    /**
     * A screen entry. Groups are buttons and screens are links, and the same label can be both:
     * with File ▸ Administration open, its "Employee" group button precedes Setup ▸ Employee in the
     * DOM, so a label-only match opens the wrong thing and the URL never changes (A6, 2026-10-16).
     */
    private leafLink(name: string): Locator {
        return this.page.getByRole('link', { name, exact: true }).filter({ visible: true }).first();
    }

    private menuItems(name: string): Locator {
        return this.page
            .getByRole('link', { name, exact: true })
            .or(this.page.getByRole('button', { name, exact: true }))
            .or(this.page.getByRole('menuitem', { name, exact: true }))
            .or(this.page.getByRole('treeitem', { name, exact: true }));
    }

    /**
     * Expand a collapsible sidebar group ("File", "Administration") if its
     * children are not already showing. Clicking an already-expanded group in
     * PET Tiger collapses it, so this only clicks when the target child is
     * hidden — keeping the walkthrough idempotent regardless of the sidebar's
     * starting state.
     */
    async expandGroup(group: string, child: string, childIsLeaf = false): Promise<void> {
        const childItem = childIsLeaf ? this.leafLink(child) : this.menuItem(child);
        // `.all()` below does not wait, and right after a goto('/') the dashboard has not rendered the
        // sidebar yet: it would see no candidates, click nothing, and hang on the final wait (2026-10-13).
        await this.menuItems(group).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
        // A unique group button says whether it is open. The child's visibility cannot: "Setup" is also a top-level
        // group, so with Administration still shut, File ▸ Administration ▸ Setup looked open (E13, 2026-10-26).
        const groupButtons = this.page.getByRole('button', { name: group, exact: true }).filter({ visible: true });
        if ((await groupButtons.count()) === 1) {
            const expanded = await groupButtons.first().getAttribute('aria-expanded');
            if (expanded === 'true' || expanded === 'false') {
                if (expanded === 'false') await groupButtons.first().click();
                await childItem.waitFor({ state: 'visible', timeout: 10_000 });
                return;
            }
        }
        // Re-checked after the render: the group may already be open, and a click would collapse it.
        if (await childItem.isVisible().catch(() => false)) return;
        // "Setup" is both a top-level group and File ▸ Administration ▸ Setup, and the nested one comes first
        // in the DOM once Administration is open (e.g. after Preferences) — try each until the child shows.
        for (const candidate of await this.menuItems(group).all()) {
            if (!(await candidate.isVisible())) continue;
            await candidate.click();
            const shown = await childItem.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
            if (shown) return;
        }
        await childItem.waitFor({ state: 'visible', timeout: 10_000 });
    }

    /**
     * Walk an arbitrary sidebar path the way a person does, expanding each group
     * in turn and clicking the leaf. Every PET Tiger screen is reached this way —
     * `['File', 'Administration', 'Users']`, `['Input', 'Setup', 'Ranch']`,
     * `['Input', 'Transfer to Job Card']` — so the whole catalog navigates through
     * this one method.
     */
    async openViaMenu(menuPath: string[], expectedUrl: string): Promise<void> {
        if (menuPath.length < 1) throw new Error('openViaMenu needs at least a leaf label');

        this.logger.info(`Navigating via menu: ${menuPath.join(' ▸ ')}`);

        // Expand each group using the next label as the "is it open?" probe.
        for (let i = 0; i < menuPath.length - 1; i++) {
            await this.expandGroup(menuPath[i], menuPath[i + 1], i + 1 === menuPath.length - 1);
        }

        const leaf = menuPath[menuPath.length - 1];
        // A top-level entry has no expand step to wait for the sidebar; fall back to the generic match then.
        const link = this.leafLink(leaf);
        const target = (await link.count()) > 0 ? link : this.menuItem(leaf);
        // Tolerate a query string (the app can carry grid state in the URL).
        const landed = new RegExp(`${expectedUrl.replace(/\//g, '\\/')}(\\?|$)`);
        for (let attempt = 1; ; attempt += 1) {
            await target.click();
            const arrived = await this.page.waitForURL(landed, { timeout: 30_000 }).then(() => true, () => false);
            // The route changed and the app still bounced back to the dashboard a moment later (dev, 2026-10-22,
            // three tests in one run), so the URL has to stay put before the caller waits on the screen.
            const stayed = arrived && (await this.page.waitForURL((u) => !landed.test(u.href), { timeout: 1_500 }).then(() => false, () => true));
            if (stayed) return;
            if (attempt >= 2) throw new Error(`Menu ${menuPath.join(' ▸ ')} did not land on ${expectedUrl}; the app is at ${this.page.url()}`);
            this.logger.warn(`Menu ${menuPath.join(' ▸ ')} did not stick (app at ${this.page.url()}); walking it once more`);
            for (let i = 0; i < menuPath.length - 1; i++) {
                await this.expandGroup(menuPath[i], menuPath[i + 1], i + 1 === menuPath.length - 1);
            }
        }
    }

    /** The app's front door: the one place a journey types an address, as a person opens the app. */
    async openApp(): Promise<void> {
        if (await this.searchMenu.isVisible().catch(() => false)) return;
        await this.page.goto('/', { waitUntil: 'domcontentloaded' });
        await this.searchMenu.waitFor({ state: 'visible' });
    }

    /** Open a screen from the menu. Already on it: a menu click does not refetch, so reload (as the old goto did). */
    async openScreen(menuPath: string[], url: string): Promise<void> {
        await this.openApp();
        // Exact pathname, so /setup/jobs never matches /setup/jobs/12.
        if (new URL(this.page.url()).pathname === url) {
            await this.page.reload({ waitUntil: 'domcontentloaded' });
            return;
        }
        await this.openViaMenu(menuPath, url);
    }
}
