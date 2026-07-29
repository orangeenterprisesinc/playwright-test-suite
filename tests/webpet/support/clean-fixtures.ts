/**
 * Gated drop-in for the raw `@playwright/test` instance.
 *
 * notifications.spec.ts needs tests that start UNAUTHENTICATED (fresh context,
 * real UI sign-in for its 401 session-lifecycle coverage), so it can't use the
 * authed `test` from ../fixtures. In the source repo it imported
 * `@playwright/test` directly — here that would bypass the webpet runner gate,
 * so this shim re-exports a raw instance with only the gate attached (no
 * storage state, no locale pinning — identical runtime behavior otherwise).
 */
import { test as base, expect } from '@playwright/test';
import { applyWebpetGate } from './webpet-gate';

export const test = base.extend<{ _webpetGate: void }>({
    _webpetGate: [
        async ({}, use, testInfo) => {
            applyWebpetGate(testInfo);
            await use();
        },
        { auto: true },
    ],
});

export { expect };
