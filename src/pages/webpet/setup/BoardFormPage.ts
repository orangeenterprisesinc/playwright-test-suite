/**
 * @fileoverview Board create/edit form — `/setup/boards/{new,:id}`.
 *
 * Converted only as far as the notification spec needs: it exists to prove that
 * a server error surfaces as an **error toast** rather than the native `alert()`
 * this form used to fire. Name plus the footer is the whole surface required.
 *
 * @module pages/webpet/setup/BoardFormPage
 */
import { Page } from '@playwright/test';
import { WebpetFormPage } from '../WebpetFormPage';

/**
 * @class BoardFormPage
 * @extends WebpetFormPage
 */
export class BoardFormPage extends WebpetFormPage {
    constructor(page: Page) {
        super(page, { listUrl: '/setup/boards', entity: 'Board' });
    }
}

export default BoardFormPage;
