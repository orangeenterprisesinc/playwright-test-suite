/**
 * @fileoverview Employee list — `/setup/employees`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class EmployeeListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/employees', 'Employees');
    }

    /**
     * An employee name anywhere on the list, used to assert a discarded record
     * was never saved. Page-scoped, matching the lifted spec.
     */
    employeeNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default EmployeeListPage;
