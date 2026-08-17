// spec: test-plans/screens/shared.md
// seed: tests/seed.spec.ts

/**
 * Exercises the Header and Profile language pickers.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/shared.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-149`…`SCR-151` |
 *
 * Relocated from `tests/webpet/localization.spec.ts` (WP-0239…WP-0241). Every
 * assertion below is the one that spec carried, in the same order and the same
 * describes; what changed is the fixture (`base.fixture`) and the id and tag
 * vocabulary.
 *
 * `webpet.fixture` pinned every context to `en` and intercepted
 * `/api/session/me` to rewrite `user.language` to `en`. `base.fixture` does
 * neither — the locale pin is gone. Every English-copy assertion here is
 * therefore *positive*: under a non-English session it fails loudly rather
 * than passing vacuously. If it ever reds for that reason, the fix is a
 * locale-neutral locator, never a weakened assertion.
 */
import { expect, test } from '@fixtures/base.fixture';

/** The picker's full option set, System sentinel first. */
const LOCALE_OPTIONS = ['System', 'English (en)', 'Spanish (es)', 'Spanish (Mexico) (es-MX)'];

test.describe('Language picker — Header', { tag: ['@Screens', '@Shared'] }, () => {

    test('[Localization] Verify that the header dropdown lists the Language submenu with System and three locales.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-149' },
            { type: 'requirement', description: 'SCR-R166' },
        ],
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
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-150' },
            { type: 'requirement', description: 'SCR-R167' },
        ],
    }, async ({ page, pages }) => {
        const shell = pages.shell;
        await shell.gotoRoot();

        // Capture the next PUT /api/users/{id} so we can assert the payload.
        const putResponse = page.waitForRequest(
            (req) => /\/api\/users\/\d+$/.test(req.url()) && req.method() === 'PUT',
            { timeout: 10_000 },
        );

        await shell.openLanguageMenu();
        await shell.localeOption('System').click();

        const req = await putResponse;
        const body = req.postDataJSON() as { language: unknown };
        expect(body.language).toBeNull();
    });

});

test.describe('Language picker — Profile', { tag: ['@Screens', '@Shared'] }, () => {

    test('[Localization] Verify that Profile Personal Details lists System and all three locales with BCP-47 suffixes.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-151' },
            { type: 'requirement', description: 'SCR-R166' },
        ],
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
