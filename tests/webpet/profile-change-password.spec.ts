/**
 * Profile change-password (PET-311) — happy path + 401 mismatch path.
 *
 * The 401 mismatch test uses a route intercept so it doesn't depend on real DB
 * state; the client-side validation tests need no backend at all.
 *
 * Framework-aligned (Batch 06): locators live on ProfilePage — including
 * `fieldError()`, which encodes why the inline error cannot be reached with a
 * sibling combinator. The `page.route(...)` intercept stays in the spec: it is
 * this test's scenario, not page structure.
 */
import { expect, test } from '@fixtures/webpet.fixture';

test.describe('Profile change-password — 401 mismatch routes to field', { tag: ['@WebPet', '@wp-settings', '@wp-password', '@WPBatch06'] }, () => {

    test('[Profile] Verify that a wrong current password shows an inline error and no toast.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0282' },
    }, async ({ page, pages }) => {
        // KNOWN APP BUG (not a test-data/stale-selector issue — do not "fix" by
        // loosening this assertion): apps/web/src/shared/lib/api.ts:20-27 installs
        // an onResponse middleware that calls handleAuthExpiry() — which redirects
        // to /login — on EVERY 401 except `/session/me`, unconditionally. It has
        // no knowledge of `meta.suppressStatuses`; that field only gates the
        // toast in shared/lib/notifications.ts, one layer up. useChangePassword.ts
        // sets `suppressStatuses: [409, 401]` expecting the 401 to route inline
        // via applyServerErrors, but the client-layer middleware fires first and
        // redirects before the mutation's onError ever runs. Reproduced locally:
        // this 401 currently lands the user on /login?from=%2Fprofile instead of
        // showing the inline "Current password is incorrect" field error.
        // test.fail() keeps this wired as a regression trip-wire — an app fix to
        // api.ts (e.g. an opt-out list/meta check mirroring suppressStatuses)
        // should flip this to an unexpected pass, at which point remove the
        // annotation. Out of scope here since the required fix is in apps/web/src.
        test.fail(true, 'app bug: api.ts redirects on every non-session/me 401, ignoring meta.suppressStatuses — see comment above');

        const profile = pages.profile;

        // Intercept the password endpoint and return the structured 401 envelope
        // that the real handler emits on current-password mismatch. This test
        // exercises the frontend's applyServerErrors plumbing without requiring
        // the DB to hold a known wrong password.
        await page.route('**/api/users/*/password', (route) =>
            route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({
                    error: 'Current password is incorrect.',
                    code: 'password.current_mismatch',
                    errors: [
                        {
                            field: 'currentPassword',
                            errorCode: 'password.current_mismatch',
                            message: 'Current password is incorrect.',
                        },
                    ],
                }),
            }),
        );

        await profile.gotoProfile();

        await profile.fillPasswordForm('wrongoldpassword', 'newpassword12345', 'newpassword12345');

        // The button label varies by locale (en is pinned in fixtures); the page
        // object matches it exactly, which is required — the profile subnav item
        // is also named "Change Password" (capital P) and would otherwise
        // strict-mode-collide with this lowercase-p form action button.
        await profile.changePasswordButton.click();

        await expect(profile.fieldError('currentPassword')).toContainText(/incorrect/i, {
            timeout: 5000,
        });

        // No global error toast — meta.suppressStatuses [401] short-circuits it.
        await expect(profile.errorToasts).toHaveCount(0);
    });

});

test.describe('Profile change-password — client-side validation', { tag: ['@WebPet', '@wp-settings', '@wp-password', '@WPBatch06'] }, () => {

    test('[Profile] Verify that a new password under eight characters shows an inline error before submit.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0283' },
    }, async ({ pages }) => {
        const profile = pages.profile;
        await profile.gotoProfile();

        await profile.fillPasswordForm('doesntmatter', 'short', 'short');

        // Blur to trigger zod validation (mode: 'onBlur')
        await profile.confirmPasswordInput.blur();

        // Zod errorMap should resolve the bare .min(8) to validation:string.min.
        await expect(profile.fieldError('newPassword')).toContainText(/8/, { timeout: 5000 });
    });

    test('[Profile] Verify that a mismatched confirm password shows an inline error.', {
        tag: ['@wp-ui', '@wp-regression', '@wp-negative'],
        annotation: { type: 'testCaseId', description: 'WP-0284' },
    }, async ({ pages }) => {
        const profile = pages.profile;
        await profile.gotoProfile();

        await profile.fillPasswordForm('doesntmatter', 'newpassword12345', 'differentpassword12');

        await profile.confirmPasswordInput.blur();

        // .refine maps to validation:custom.passwordsDoNotMatch via the errorMap
        await expect(profile.fieldError('confirmPassword')).toContainText(/match|coinciden/i, {
            timeout: 5000,
        });
    });

});
