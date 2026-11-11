/**
 * Exercises the Header and Profile language pickers.
 *
 * The shared fixture pins every context to `en` and intercepts
 * `/api/session/me` to rewrite `user.language` to `en`, so these tests run
 * entirely in the English UI. They verify the picker's structure (System +
 * 3 locale options with BCP-47 suffixes) and the System-sentinel side
 * effect (a PUT /api/users/{id} with language=null).
 *
 * Framework-aligned (Batch 06): the user-menu locators live on AppShellPage and
 * the Personal Details picker on ProfilePage. Action order and assertions
 * unchanged.
 */
import { expect, test } from '@fixtures/webpet.fixture';

/** The picker's full option set, System sentinel first. */
const LOCALE_OPTIONS = ['System', 'English (en)', 'Spanish (es)', 'Spanish (Mexico) (es-MX)'];

test.describe('Language picker — Header', { tag: ['@WebPet', '@wp-shell', '@wp-localization', '@WPBatch06'] }, () => {

    test('[Localization] Verify that the header dropdown lists the Language submenu with System and three locales.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0239' },
    }, async ({ pages }) => {
        const shell = pages.shell;
        await shell.gotoRoot();

        // Open the avatar dropdown. UserMenu (app/layout/UserMenu.tsx) lives in the
        // sidebar, not a <header> — a header-scoped selector never matched and hung
        // on the actionability wait until a CONTEXT-CLOSED cascade misreported the
        // real cause. AppShellPage.userMenuTrigger encodes the working locator.
        await shell.userMenuTrigger.click();
        // Sub-triggers use data-slot="dropdown-menu-sub-trigger" in the shared
        // dropdown-menu primitive; the page object filters to the Language one.
        await expect(shell.languageSubTrigger).toBeVisible({ timeout: 5000 });
        await shell.languageSubTrigger.click();

        for (const expected of LOCALE_OPTIONS) {
            await expect(shell.localeOption(expected)).toBeVisible({ timeout: 5000 });
        }
    });

    test('[Localization] Verify that picking System sends a null language to the user endpoint.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0240' },
    }, async ({ page, pages }) => {
        test.fixme(
            true,
            'support account cannot save its own language: web-pet #1589 PUT /users/{id}/profile is behind RefuseSupportUserWrites (403), and super users act as PET Tiger Support since #1580 — re-enable under a non-super automation user',
        );
        const shell = pages.shell;
        await shell.gotoRoot();

        // Since web-pet #1589 the user menu saves the language through the self-service route.
        const putResponse = page.waitForRequest(
            (req) => /\/api\/users\/\d+\/profile$/.test(req.url()) && req.method() === 'PUT',
            { timeout: 10_000 },
        );

        await shell.openLanguageMenu();
        await shell.localeOption('System').click();

        const req = await putResponse;
        const body = req.postDataJSON() as { language: unknown };
        expect(body.language).toBeNull();
    });

});

test.describe('Language picker — Profile', { tag: ['@WebPet', '@wp-shell', '@wp-localization', '@WPBatch06'] }, () => {

    test('[Localization] Verify that Profile Personal Details lists System and all three locales with BCP-47 suffixes.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0241' },
    }, async ({ pages }) => {
        const profile = pages.profile;
        await profile.gotoProfile();
        // PersonalDetails section is the only home of the language picker now
        // (PET-25 removed the duplicate Preferences-section picker).
        await profile.languageSelect.waitFor({ state: 'visible', timeout: 10_000 });
        await profile.languageSelect.click();

        for (const expected of LOCALE_OPTIONS) {
            await expect(profile.localeOption(expected)).toBeVisible({ timeout: 5000 });
        }
    });

});
