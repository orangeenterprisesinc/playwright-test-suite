/**
 * @fileoverview Ranch create/edit form — `/setup/ranches/{new,:id}`.
 *
 * The only converted form carrying a **map boundary section** (PET-68 Step B).
 * Its shape is worth stating because the locators look arbitrary otherwise:
 *
 * - The "Edit Map" trigger moved onto the Map section's header row and became an
 *   icon button (WEBPET-786). Its accessible name still resolves via
 *   `common.mapEditor.editOnMap`, so a role+name query still finds it — but the
 *   assertion that it sits *on the header row* has to walk up from the heading,
 *   which is the one place an XPath axis is genuinely the clearest expression.
 * - Clicking it opens a full-screen editor whose heading matches
 *   `/Draw .*Boundary/i`; Escape closes it.
 * - The Advanced disclosure starts collapsed and reveals raw `#point` and
 *   `#polygon` inputs — the text fallback for entering coordinates.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetFormPage } from '../webpet/WebpetFormPage';

/**
 * @extends WebpetFormPage
 */
export class RanchFormPage extends WebpetFormPage {
    /** The Map section's heading — the readiness signal for the boundary UI. */
    readonly mapHeading: Locator;
    /** Opens the full-screen boundary editor. An icon button since WEBPET-786. */
    readonly editMapButton: Locator;
    /** The full-screen editor's heading; present only while it is open. */
    readonly boundaryEditorHeading: Locator;
    /** Reveals the raw coordinate inputs. Starts collapsed (`aria-expanded=false`). */
    readonly advancedToggle: Locator;
    /** Raw centre-point input, revealed by {@link advancedToggle}. */
    readonly pointInput: Locator;
    /** Raw polygon input, revealed by {@link advancedToggle}. */
    readonly polygonInput: Locator;
    /**
     * The footer's primary action.
     *
     * Matched as `/^Save/` rather than the exact `'Save'` the other forms use —
     * on this screen the label carries a suffix. Kept distinct from
     * `footer.saveButton` so neither screen's matcher is silently widened.
     */
    readonly saveButton: Locator;

    constructor(page: Page) {
        super(page, { listUrl: '/setup/ranches', entity: 'Ranch' });

        this.mapHeading = page.getByRole('heading', { name: /^Map$/ });
        this.editMapButton = page.getByRole('button', { name: /Edit Map/i });
        this.boundaryEditorHeading = page.getByRole('heading', { name: /Draw .*Boundary/i });
        this.advancedToggle = page.getByRole('button', { name: /Advanced.*edit coordinates/i });
        this.pointInput = page.locator('#point');
        this.polygonInput = page.locator('#polygon');
        this.saveButton = page.getByRole('button', { name: /^Save/ });
    }

    /**
     * The Edit Map trigger *as a child of the Map heading's parent* — i.e. on the
     * header row rather than below the preview. Proving the placement is the
     * point of the assertion, so the containment has to be part of the locator.
     */
    get editMapButtonOnHeaderRow(): Locator {
        return this.mapHeading.locator('xpath=..').getByRole('button', { name: /Edit Map/i });
    }

    /** Wait for the Map section to settle. */
    async waitForMap(): Promise<void> {
        await this.mapHeading.waitFor();
    }

    /** Open the full-screen boundary editor. */
    async openBoundaryEditor(): Promise<void> {
        await this.editMapButton.click();
    }

    /** Close the full-screen boundary editor. */
    async closeBoundaryEditor(): Promise<void> {
        await this.page.keyboard.press('Escape');
    }

    /** Reveal the raw coordinate inputs. */
    async openAdvanced(): Promise<void> {
        await this.advancedToggle.click();
    }
}

export default RanchFormPage;
