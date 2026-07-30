/**
 * @fileoverview The global notification surface — sonner toasts driven by the
 * TanStack Query MutationCache.
 *
 * Toast **messages** are matched page-wide rather than inside the toast
 * container, because that is what the lifted specs do and because the message
 * text is the assertion: a success string appearing anywhere proves the mutation
 * reported success. Toast **absence**, by contrast, is asserted against the
 * container's own attributes — `[data-sonner-toast][data-type="error"]` — since
 * "no error text anywhere on the page" would be far too broad a claim.
 *
 * @module components/webpet/ToastComponent
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @class ToastComponent
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

    /** A toast by its message text. Page-scoped — see the class note. */
    message(text: string | RegExp): Locator {
        return this.page.getByText(text);
    }
}

export default ToastComponent;
