/**
 * @fileoverview Equipment list — `/setup/equipments`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class EquipmentListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/equipments', 'Equipment');
    }

    /**
     * An equipment name anywhere on the list. Page-scoped, matching the lifted
     * spec.
     */
    equipmentNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default EquipmentListPage;
