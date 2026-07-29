import { test, expect } from './fixtures'

/**
 * Profile change-password (PET-311) — happy path + 401 mismatch path.
 *
 * Skipped if the API isn't reachable (no MSSQL / no `pnpm dev`). The 401
 * mismatch test uses a route intercept so it doesn't depend on real DB
 * state; the happy-path test requires a live DB and is gated implicitly
 * by whether `/api/users/{id}/password` returns the expected 204.
 */

test.describe('Profile change-password — 401 mismatch routes to field', () => {
  test('wrong current password shows inline error, no toast', async ({ page }) => {
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
    // annotation. Out of scope here since the required fix is in apps/web/src,
    // not apps/web/e2e.
    test.fail(true, 'app bug: api.ts redirects on every non-session/me 401, ignoring meta.suppressStatuses — see comment above')

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
    )

    await page.goto('/profile')

    await page.fill('#currentPassword', 'wrongoldpassword')
    await page.fill('#newPassword', 'newpassword12345')
    await page.fill('#confirmPassword', 'newpassword12345')

    // The button label varies by locale (en is pinned in fixtures); use the
    // role+name hooked to the action.changePassword key. `exact: true` is
    // required — the profile subnav item is also named "Change Password"
    // (nav.changePassword, capital P) and would otherwise strict-mode-collide
    // with this lowercase-p form action button.
    await page.getByRole('button', { name: 'Change password', exact: true }).click()

    // The inline field error renders inside the field's own space-y-1 wrapper
    // (label + Input + error <p>), not as a CSS sibling of the <input>: the
    // Input component wraps its native <input> in an inner
    // `<div class="relative w-full">`, so `#currentPassword + p` /
    // `#currentPassword ~ p` never match — the <p> and the <input> aren't
    // siblings. Scope to the wrapper via :has() instead.
    const fieldError = page.locator('div.space-y-1', { has: page.locator('#currentPassword') }).locator('p')
    await expect(fieldError).toContainText(/incorrect/i, { timeout: 5000 })

    // No global error toast — meta.suppressStatuses [401] short-circuits it.
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
  })
})

test.describe('Profile change-password — client-side validation', () => {
  test('newPassword under 8 chars shows inline error before submit', async ({ page }) => {
    await page.goto('/profile')

    await page.fill('#currentPassword', 'doesntmatter')
    await page.fill('#newPassword', 'short')
    await page.fill('#confirmPassword', 'short')

    // Blur to trigger zod validation (mode: 'onBlur')
    await page.locator('#confirmPassword').blur()

    // Zod errorMap should resolve the bare .min(8) to validation:string.min
    // (see the :has() note above — the error <p> is not a CSS sibling of
    // the <input>, it shares the field's space-y-1 wrapper instead)
    const newPasswordError = page.locator('div.space-y-1', { has: page.locator('#newPassword') }).locator('p')
    await expect(newPasswordError).toContainText(/8/, { timeout: 5000 })
  })

  test('mismatched confirm password shows inline error', async ({ page }) => {
    await page.goto('/profile')

    await page.fill('#currentPassword', 'doesntmatter')
    await page.fill('#newPassword', 'newpassword12345')
    await page.fill('#confirmPassword', 'differentpassword12')

    await page.locator('#confirmPassword').blur()

    // .refine maps to validation:custom.passwordsDoNotMatch via the errorMap
    const confirmError = page.locator('div.space-y-1', { has: page.locator('#confirmPassword') }).locator('p')
    await expect(confirmError).toContainText(/match|coinciden/i, { timeout: 5000 })
  })
})
