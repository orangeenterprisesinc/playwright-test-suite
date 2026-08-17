/**
 * @fileoverview Crop create/edit form — `/setup/crops/new`, `/setup/crops/:id`.
 *
 * Reference implementation for the web-pet form conversion. Every locator here
 * is relocated **verbatim** from `tests/webpet/crop.spec.ts`; none was
 * "improved". The suite is accepted by diffing each test against a committed
 * per-test baseline, and a better selector is indistinguishable from a
 * regression in that diff — so tightening one is a separate, deliberate commit.
 *
 * Screen behaviour worth knowing before changing anything here:
 *
 * - Save is disabled until `isDirty && isValid` (PET-450), and the form
 *   validates on **blur** (`mode: 'onBlur'`) — filling Name is not enough.
 * - Blurring Name auto-populates Export Identifier, but only when that field is
 *   still empty.
 * - Name uniqueness is checked on blur via `/api/validation/unique`
 *   (`entity=crop`, `field=name`), so a duplicate leaves Save disabled and the
 *   form never navigates. Submitting a duplicate instead returns a structured
 *   409 that maps to an inline Name error.
 * - Name and Export Identifier are `readonly` once the record exists.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../webpet/WebpetFormPage';

/**
 * @extends WebpetFormPage
 */
export class CropFormPage extends WebpetFormPage {
    /**
     * Edit-only section hosting the per-attribute AssignmentTab widgets
     * (Color, Grade, Variety…) that replaced the legacy tabbed UI.
     */
    readonly traceabilitySection: Locator;
    /** Shown when the id in the URL does not resolve. */
    readonly notFoundMessage: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/crops', entity: 'Crop' });

        this.traceabilitySection = page.locator('section#traceability');
        this.notFoundMessage = page.locator('text=Crop not found.');
    }

    /**
     * Narrower than the base's duplicate matcher: this screen emits either the
     * generic "Already in use" or the crop-specific sentence, and the lifted
     * spec asserts exactly this pair.
     */
    get duplicateNameError(): Locator {
        return this.page.getByText(/Already in use|A crop with this name already exists\./);
    }
}

export default CropFormPage;
