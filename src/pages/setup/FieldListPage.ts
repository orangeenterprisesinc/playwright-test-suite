/**
 * @fileoverview Field list — `/setup/fields`.
 *
 * Same DataGrid surface as the ranch list (inline edit, multi-edit, Undo, URL
 * state) plus the insights strip toggle, which is reflected in the URL as
 * `?expand=top`. All of it lives on {@link WebpetDataGridComponent}; this class
 * exists to bind the route and heading.
 *
 * `field.spec.ts` covers the list only — there are no field form tests.
 */
import { Page } from '@playwright/test';
import { WebpetListPage } from '../webpet/WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class FieldListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/fields', 'Fields');
    }
}

export default FieldListPage;
