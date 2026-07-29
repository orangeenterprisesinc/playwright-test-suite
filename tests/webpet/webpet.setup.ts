/**
 * Setup spec for the `webpet-setup` dependency project (see playwright.config.ts).
 *
 * Replaces the source repo's Playwright globalSetup slot (already occupied in
 * this repo by src/fixtures/global-setup.ts): logs in as the admin user via the
 * API and persists tests/webpet/.auth/storage.json (+ best-effort restricted
 * user state). If this fails, only the dependent `webpet` project is skipped —
 * the framework's own auth-setup/chromium/api projects are unaffected.
 */
import { test as setup } from '@playwright/test';
import { provisionWebpetAuth } from './support/provision';

setup('provision webpet auth state', async () => {
    setup.setTimeout(120_000);
    await provisionWebpetAuth();
});
