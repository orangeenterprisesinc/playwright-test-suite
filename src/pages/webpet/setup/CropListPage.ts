/**
 * @fileoverview Crop list — `/setup/crops`.
 *
 * Separate from {@link CropFormPage} because the two halves of the screen
 * diverged in the app: the list migrated to the new DataGrid library (PET-424)
 * — hence `[role="grid"]` and no `<td>` elements — while the form was untouched.
 * `crop.spec.ts` records exactly that, which is why its list assertions are so
 * thin: the substantive list coverage moved to `setup-batch-b-smoke.spec.ts`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class CropListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/crops', 'Crops');
    }

    /**
     * A crop name anywhere on the list, used to assert a discarded record was
     * never saved. Page-scoped, matching the lifted spec — narrowing it to the
     * grid would change which elements can match and therefore what the
     * assertion proves.
     */
    cropNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default CropListPage;
