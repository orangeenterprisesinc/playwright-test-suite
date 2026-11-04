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
import { expect, Locator, Page } from '@playwright/test';
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

    private menuItems(name: string, root: Page | Locator = this.page): Locator {
        return root
            .getByRole('link', { name, exact: true })
            .or(root.getByRole('button', { name, exact: true }))
            .or(root.getByRole('menuitem', { name, exact: true }))
            .or(root.getByRole('treeitem', { name, exact: true }));
    }

    /**
     * The child as rendered in the panel this group button controls (base-ui `aria-controls`, measured 2026-11-03), or
     * the page-wide match when the child is not in that panel: File ▸ Export to Accounting is a top-level link.
     * "Setup" is also a top-level group, so a page-wide match passed for File ▸ Administration's child before
     * Administration had rendered it; the next step then saw one "Setup", toggled the top-level one and never found
     * Scripts (3817, full runs 2026-11-02 and 11-03).
     */
    private async childInGroup(groupButton: Locator, child: string, childIsLeaf: boolean, pageWide: Locator): Promise<Locator> {
        const panel = await this.panelOf(groupButton);
        if (!panel) return pageWide;
        const items = childIsLeaf ? panel.getByRole('link', { name: child, exact: true }) : this.menuItems(child, panel);
        return (await items.count()) > 0 ? items.filter({ visible: true }).first() : pageWide;
    }

    /** The rendered panel a group button controls (base-ui `aria-controls`), if it has one. */
    private async panelOf(groupButton: Locator): Promise<Locator | undefined> {
        const panelId = await groupButton.getAttribute('aria-controls');
        if (!panelId) return undefined;
        const panel = this.page.locator(`[id="${panelId}"]`);
        const shown = await panel.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
        return shown ? panel : undefined;
    }

    /**
     * Expand a collapsible sidebar group ("File", "Administration") if its
     * children are not already showing. Clicking an already-expanded group in
     * PET Tiger collapses it, so this only clicks when the target child is
     * hidden — keeping the walkthrough idempotent regardless of the sidebar's
     * starting state.
     *
     * `scope` is the panel the previous group opened; the return value is this group's panel, for the next step.
     */
    async expandGroup(group: string, child: string, childIsLeaf = false, topLevel = false, scope: Page | Locator = this.page): Promise<Page | Locator> {
        const childItem = childIsLeaf ? this.leafLink(child) : this.menuItem(child);
        // `.all()` below does not wait, and right after a goto('/') the dashboard has not rendered the
        // sidebar yet: it would see no candidates, click nothing, and hang on the final wait (2026-10-13).
        await this.menuItems(group).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
        // Inside the parent's panel the group is unique. Page-wide, Reports left open adds its own "Administration",
        // so the walk fell back below and never opened File ▸ Administration (3817, CI 2026-11-03 and 11-04).
        const inScope = scope !== this.page && (await this.menuItems(group, scope).filter({ visible: true }).count()) > 0;
        const root = inScope ? scope : this.page;
        // A unique group button says whether it is open. The child's visibility cannot: "Setup" is also a top-level
        // group, so with Administration still shut, File ▸ Administration ▸ Setup looked open (E13, 2026-10-26).
        const groupButtons = root.getByRole('button', { name: group, exact: true }).filter({ visible: true });
        if ((await groupButtons.count()) === 1) {
            const expanded = await groupButtons.first().getAttribute('aria-expanded');
            if (expanded === 'true' || expanded === 'false') {
                if (expanded === 'false') await groupButtons.first().click();
                const inGroup = await this.childInGroup(groupButtons.first(), child, childIsLeaf, childItem);
                const shown = await inGroup.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false);
                if (!shown) {
                    // The group opened but never rendered its children (B8, 2026-10-29, slow dev): fold it and open it once more.
                    await groupButtons.first().click();
                    await expect(groupButtons.first()).toHaveAttribute('aria-expanded', 'false', { timeout: 5_000 });
                    await groupButtons.first().click();
                    await expect(groupButtons.first()).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 });
                    await inGroup.waitFor({ state: 'visible', timeout: 15_000 });
                }
                return (await this.panelOf(groupButtons.first())) ?? this.page;
            }
        }
        // Re-checked after the render: the group may already be open, and a click would collapse it.
        if (await childItem.isVisible().catch(() => false)) return this.page;
        // "Setup" is both a top-level group and File ▸ Administration ▸ Setup, and the nested one comes first
        // in the DOM once Administration is open (e.g. after Preferences) — try each until the child shows.
        let candidates = await this.menuItems(group, root).all();
        if (topLevel) {
            // Shallowest first: a nested namesake ("Setup" under Administration) otherwise costs the 3 s probe.
            const ranked: { candidate: Locator; depth: number }[] = [];
            for (const candidate of candidates) {
                if (!(await candidate.isVisible())) continue;
                const depth = await candidate.evaluate((el) => {
                    let n = 0;
                    for (let p = el.parentElement; p; p = p.parentElement) if (p.matches('ul,ol,[role=group],[role=tree]')) n += 1;
                    return n;
                });
                ranked.push({ candidate, depth });
            }
            candidates = ranked.sort((a, b) => a.depth - b.depth).map((r) => r.candidate);
        }
        for (const candidate of candidates) {
            if (!(await candidate.isVisible())) continue;
            await candidate.click();
            const shown = await childItem.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true, () => false);
            if (shown) return this.page;
        }
        await childItem.waitFor({ state: 'visible', timeout: 10_000 });
        return this.page;
    }

    /** Expand every group of `menuPath` in turn, each looked up inside the panel the one before it opened. */
    private async expandPath(menuPath: string[]): Promise<Page | Locator> {
        let scope: Page | Locator = this.page;
        for (let i = 0; i < menuPath.length - 1; i++) {
            scope = await this.expandGroup(menuPath[i], menuPath[i + 1], i + 1 === menuPath.length - 1, i === 0, scope);
        }
        return scope;
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
        const scope = await this.expandPath(menuPath);

        const leaf = menuPath[menuPath.length - 1];
        // The leaf inside the last group's panel; else page-wide (File ▸ Export to Accounting is a top-level link).
        const scoped = scope === this.page ? undefined : scope.getByRole('link', { name: leaf, exact: true }).filter({ visible: true }).first();
        const link = scoped && (await scoped.count()) > 0 ? scoped : this.leafLink(leaf);
        // A top-level entry has no expand step to wait for the sidebar; fall back to the generic match then.
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
            await this.expandPath(menuPath);
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
