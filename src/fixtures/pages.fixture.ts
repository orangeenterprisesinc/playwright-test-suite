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
    };
}
