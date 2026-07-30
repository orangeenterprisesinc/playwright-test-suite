/**
 * @fileoverview The navigation guard raised when leaving a dirty web-pet form.
 *
 * A separate component from the framework's `ModalComponent` because that one
 * cannot drive this dialog: its confirm/cancel locators are
 * `/confirm|ok|yes|submit/i` and `/cancel|no/i`, and this modal's abandon button
 * is labelled **"Don't Save"** — which matches neither. (`/cancel|no/i` does not
 * match "Don't Save"; the apostrophe-t is not the word "no".) Reusing it would
 * silently resolve to nothing and time out.
 *
 * @module components/webpet/UnsavedChangesModal
 */
import { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/**
 * @class UnsavedChangesModal
 * @extends BaseComponent
 */
export class UnsavedChangesModal extends BaseComponent {
    /** Abandon the edits and continue navigating. */
    readonly dontSaveButton: Locator;
    /** Commit the edits, then continue navigating. */
    readonly saveButton: Locator;
    /** Stay on the form. */
    readonly cancelButton: Locator;

    constructor(page: Page) {
        super(page, page.getByRole('dialog'));

        // Page-scoped, matching the lifted specs. The dialog renders in a portal
        // and not every screen wraps it in role=dialog, so scoping the buttons to
        // the root would change which element resolves on some screens.
        this.dontSaveButton = page.getByRole('button', { name: "Don't Save" });
        this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
        this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    }

    /** Abandon pending edits — the path the lifted specs take after Discard changes. */
    async discard(): Promise<void> {
        await this.dontSaveButton.click();
    }
}

export default UnsavedChangesModal;
