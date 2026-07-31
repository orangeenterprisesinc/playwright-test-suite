/**
 * @fileoverview Crew list — `/setup/crews`.
 */
import { Locator, Page } from '@playwright/test';
import { WebpetListPage } from '../WebpetListPage';

/**
 * @extends WebpetListPage
 */
export class CrewListPage extends WebpetListPage {
    constructor(page: Page) {
        super(page, '/setup/crews', 'Crews');
    }

    /**
     * A crew name anywhere on the list, used to assert a discarded record was
     * never saved. Page-scoped, matching the lifted spec.
     */
    crewNamed(name: string): Locator {
        return this.page.getByText(name);
    }
}

export default CrewListPage;
