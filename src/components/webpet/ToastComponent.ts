/**
 * @fileoverview The global notification surface — sonner toasts driven by the
 * TanStack Query MutationCache.
 *
 * Toast **messages** are matched inside the toast container — a page-wide match
 * also catches unrelated copy (the PWA's "Ready to work offline." toast collided
 * with a `/offline/i` assertion). Toast **absence** is asserted against the
 * container's own attributes — `[data-sonner-toast][data-type="error"]`.
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @extends BaseComponent
 */
export class ToastComponent extends BaseComponent {
    /**
     * Every error toast.
     *
     * Used far more often for `toHaveCount(0)` than for presence: several
     * mutations set `meta.suppressStatuses` so a given status routes to inline UI
     * *instead of* a toast, and the absence is the thing under test.
     */
    readonly errorToasts: Locator;

    constructor(page: Page) {
        super(page, page.locator('[data-sonner-toast]'));

        this.errorToasts = page.locator('[data-sonner-toast][data-type="error"]');
    }

    /** A toast by its message text, scoped to the toast container. */
    message(text: string | RegExp): Locator {
        return this.root.getByText(text);
    }
}

export default ToastComponent;
