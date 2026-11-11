/**
 * @fileoverview Page Object for the PET Tiger app shell's navigation.
 *
 * Since web-pet #1569 ("PET Tiger Cloud new experience", dev 2026-11-05) the sidebar is ten hub links
 * (Home, Input, View, Transfer & Reconcile, Bonus, Export, Employees, Setup, Devices, Reports, Admin);
 * each opens a hub page of cards, and a card opens the screen. The screen routes did not change.
 * `src/data/static/shell/navigation.json` (generated from a walk of that shell) maps every route to
 * its hub and card, so `openViaMenu` walks sidebar → hub card → screen the way a person does, and
 * the recorded video shows it. The old group walk (File ▸ Administration ▸ …) stays as the fallback
 * for a route the table does not know.
 */
import { expect, Locator, Page, test } from '@playwright/test';
import { BasePage } from '../BasePage';
import shellNavigation from '../../data/static/shell/navigation.json';

interface ShellNavigation {
    /** Sidebar link name → the hub route it opens. */
    sidebar: Record<string, string>;
    /** Screen route → the hub that holds its card. */
    /** `hubView`: test id of the hub button that reveals the card (Reports lists screen reports only under "By screen"). */
    screens: Record<string, { group: string; card: string; hubView?: string }>;
    /** Screen route → why the new shell offers no card for it (a product gap the spec records as a deep link). */
    noMenuEntry: Record<string, string>;
}
const SHELL = shellNavigation as ShellNavigation;

/**
 * Page Object representing the authenticated shell's navigation.
 *
 * @extends BasePage
 */
export class LeftNavigationPage extends BasePage {
    /** The authenticated shell lives at the app root. */
    readonly pageUrl: string = '/';
    /** Title assertion is not used by the login suite; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    /** The header's global search (Ctrl+K) — visible only when logged in; the post-login landmark. */
    readonly searchMenu: Locator;
    /** The sidebar's Home link — visible only when logged in (the old shell's "Welcome back" greeting is gone). */
    readonly welcomeBack: Locator;

    constructor(page: Page) {
        super(page);
        this.searchMenu = page.getByRole('button', { name: /^Search people, crews, jobs, pages/ });
        this.welcomeBack = page.getByRole('link', { name: 'Home', exact: true }).first();
    }

    /** A sidebar hub link ("Setup", "Admin"), matched exactly: the hub page repeats the name as a heading, not a link. */
    sidebarLink(group: string): Locator {
        return this.page.getByRole('link', { name: group, exact: true }).first();
    }

    /** The hub card that opens `route`; matched by href, because a card's accessible name is its title plus its description. */
    hubCard(route: string): Locator {
        return this.page.locator(`a[href="${route}"]`).first();
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
     * Open a screen the way a person does in the new shell: sidebar hub link → hub card → screen. Every PET
     * Tiger screen is reached through this one method. `menuPath` is the caller's old label path; it is logged,
     * and walked as groups only when `expectedUrl` is not in the navigation table.
     */
    async openViaMenu(menuPath: string[], expectedUrl: string): Promise<void> {
        if (menuPath.length < 1) throw new Error('openViaMenu needs at least a leaf label');
        const route = expectedUrl.split('?')[0];
        const entry = SHELL.screens[route];
        if (!entry) {
            const gap = SHELL.noMenuEntry[route];
            if (gap) return this.openDeepLink(route, gap);
            this.logger.warn(`No hub card for ${route} in shell/navigation.json; walking the old groups ${menuPath.join(' ▸ ')}`);
            return this.openViaGroups(menuPath, expectedUrl);
        }
        const hubRoute = SHELL.sidebar[entry.group];
        this.logger.info(`Navigating via menu: ${entry.group} ▸ ${entry.card.split(/(?<=[a-z0-9.])(?=[A-Z])/)[0]} (was ${menuPath.join(' ▸ ')})`);
        const landed = new RegExp(`${route.replace(/\//g, '\\/')}(\\?|$)`);
        const onHub = new RegExp(`${hubRoute.replace(/\//g, '\\/')}(\\?|$)`);
        for (let attempt = 1; ; attempt += 1) {
            await this.sidebarLink(entry.group).click();
            await this.page.waitForURL(onHub, { timeout: 30_000 });
            if (entry.hubView) await this.page.getByTestId(entry.hubView).click();
            await this.hubCard(route).click();
            const arrived = await this.page.waitForURL(landed, { timeout: 30_000 }).then(() => true, () => false);
            // The route changed and the app still bounced back a moment later (dev, 2026-10-22), so the URL
            // has to stay put before the caller waits on the screen.
            const stayed = arrived && (await this.page.waitForURL((u) => !landed.test(u.href), { timeout: 1_500 }).then(() => false, () => true));
            if (stayed) return;
            if (attempt >= 2) throw new Error(`${entry.group} ▸ ${route} did not land on ${expectedUrl}; the app is at ${this.page.url()}`);
            this.logger.warn(`${entry.group} ▸ ${route} did not stick (app at ${this.page.url()}); walking it once more`);
        }
    }

    /** The pre-#1569 walk: expand each group of `menuPath` in turn and click the leaf. Kept for routes the table lacks. */
    private async openViaGroups(menuPath: string[], expectedUrl: string): Promise<void> {
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

    /**
     * A screen the new shell offers no menu entry for (`noMenuEntry` in shell/navigation.json): the only way a
     * person reaches it is by address, so the test does the same and says so in its annotations. The precedent is
     * CrewPunchPage's Crew Piece Out (product gap 2026-10-16).
     */
    async openDeepLink(route: string, gap: string): Promise<void> {
        this.logger.warn(`Deep link ${route}: ${gap}`);
        try {
            test.info().annotations.push({ type: 'deep-link', description: `${route} has no menu entry: ${gap}` });
        } catch {
            // Outside a test context — nothing to annotate.
        }
        await this.page.goto(route, { waitUntil: 'domcontentloaded' });
        await this.page.waitForURL((u) => u.pathname === route, { timeout: 30_000 });
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
