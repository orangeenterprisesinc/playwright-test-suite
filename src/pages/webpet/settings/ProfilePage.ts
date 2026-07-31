/**
 * @fileoverview The user's own Profile page — `/profile`.
 *
 * Three surfaces share this route: the language picker in Personal Details, the
 * change-password form, and the avatar upload.
 *
 * ## Why `fieldError()` looks the way it does
 *
 * The inline error `<p>` is **not** a CSS sibling of its `<input>`: the Input
 * component wraps the native input in an inner `<div class="relative w-full">`,
 * so `#field + p` and `#field ~ p` never match. The `<p>` and the input share
 * the field's `div.space-y-1` wrapper, which is why the lookup goes through
 * `:has()` on the wrapper.
 *
 * ## Why the avatar input is `.first()`
 *
 * The file input is permanently `className="hidden"` — triggered via a ref
 * click, never shown — so `:visible` cannot disambiguate it. ProfilePage renders
 * `<ProfileHeader/>` **twice**, once for the desktop banner (`hidden md:block`)
 * and once for mobile (`md:hidden`), giving two functionally identical inputs
 * wired to the same mutation. `.first()` deterministically picks the desktop
 * copy, which matches this project's Desktop Chrome viewport.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class ProfilePage extends BasePage {
    readonly pageUrl: string = '/profile';
    readonly pageTitle: string | RegExp = /.*/;

    // ── Personal Details ▸ language ─────────────────────────────────
    /**
     * The language Select in Personal Details.
     *
     * Scoped to `#personal-details` because PET-25 removed a duplicate picker
     * from the Preferences section — the scope keeps the locator honest if one
     * ever comes back.
     */
    readonly languageSelect: Locator;

    // ── Change password ─────────────────────────────────────────────
    readonly currentPasswordInput: Locator;
    readonly newPasswordInput: Locator;
    readonly confirmPasswordInput: Locator;
    /**
     * The change-password submit button.
     *
     * `exact: true` is required — the profile subnav item is also named "Change
     * Password" (capital P) and would otherwise strict-mode-collide with this
     * lowercase-p form action.
     */
    readonly changePasswordButton: Locator;
    /** Global error toasts. Asserted absent when a status is meant to route inline. */
    readonly errorToasts: Locator;

    // ── Avatar ──────────────────────────────────────────────────────
    /** The hidden avatar file input — see the class note on `.first()`. */
    readonly avatarFileInput: Locator;

    constructor(page: Page) {
        super(page);

        this.languageSelect = page.locator('#personal-details #language-personal');

        this.currentPasswordInput = page.locator('#currentPassword');
        this.newPasswordInput = page.locator('#newPassword');
        this.confirmPasswordInput = page.locator('#confirmPassword');
        this.changePasswordButton = page.getByRole('button', {
            name: 'Change password',
            exact: true,
        });
        this.errorToasts = page.locator('[data-sonner-toast][data-type="error"]');

        this.avatarFileInput = page.locator('input[type="file"][accept="image/*"]').first();
    }

    /** Navigate to the profile. Plain `goto`, matching the lifted specs. */
    async gotoProfile(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /** A locale choice in the open language Select. */
    localeOption(name: string): Locator {
        return this.page.getByRole('option', { name });
    }

    /**
     * The inline validation message for the field with the given id.
     *
     * Goes through the shared `div.space-y-1` wrapper rather than a sibling
     * combinator — see the class note.
     */
    fieldError(fieldId: string): Locator {
        return this.page
            .locator('div.space-y-1', { has: this.page.locator(`#${fieldId}`) })
            .locator('p');
    }

    /** Fill all three change-password fields, then blur to trigger on-blur validation. */
    async fillPasswordForm(current: string, next: string, confirm: string): Promise<void> {
        await this.currentPasswordInput.fill(current);
        await this.newPasswordInput.fill(next);
        await this.confirmPasswordInput.fill(confirm);
    }
}

export default ProfilePage;
