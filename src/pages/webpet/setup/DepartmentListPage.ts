/**
 * @fileoverview Department list — `/setup/departments`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class DepartmentListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/departments', 'Departments');
    }

    /**
     * A department name anywhere on the list, used to assert a discarded record
     * was never saved. Page-scoped, matching the lifted spec.
     */
    departmentNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default DepartmentListPage;
