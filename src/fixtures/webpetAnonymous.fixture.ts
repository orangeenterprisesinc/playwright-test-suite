/**
 * @fileoverview Unauthenticated variant of the web-pet fixture.
 *
 * `notifications.spec.ts` needs a genuinely clean context: its 401 and
 * session-lifecycle tests assert what happens *before* login, so a context
 * seeded with the admin storage state would make them meaningless. Hence no
 * `storageState`, no `pt.locale` pin, and no `/api/session/me` rewrite — the
 * three things `webpet.fixture.ts` adds.
 *
 * It still carries the run-control gate and the lifecycle listeners, so a
 * clean-context test is as governed and as reportable as any other. That is the
 * only reason this is a fixture rather than a raw `@playwright/test` import.
 *
 * The spec that uses it imports both objects (`test` and `cleanTest`) in one
 * file, which is why this is a separate export rather than a role option on the
 * main fixture.
 *
 * @module fixtures/webpetAnonymous.fixture
 */
import { expect, test as base } from '@playwright/test';
import { applyWebpetGate } from './webpetGate';
import { createWebpetPages, type WebpetPages } from './webpetPages.fixture';
import { onTestStart, onTestEnd } from '../listeners/testLifecycleManager';

export { expect };

export const test = base.extend<{ _webpetGate: void; pages: WebpetPages }>({
    /**
     * The same page-object registry the authenticated fixture exposes.
     *
     * Page objects hold no session state — they are locators over a `page` — so
     * they are just as usable from an unauthenticated context. The sign-in and
     * sign-out specs need `login` and `shell` in particular.
     */
    pages: async ({ page }, use) => {
        await use(createWebpetPages(page));
    },

    _webpetGate: [
        async ({}, use, testInfo) => {
            onTestStart(testInfo);
            await applyWebpetGate(testInfo);
            await use();
            onTestEnd(testInfo);
        },
        { auto: true },
    ],
});
