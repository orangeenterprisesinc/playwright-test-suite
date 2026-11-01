import { Locator, Page } from '@playwright/test';
import { BulkDeleteHistoryPage } from './BulkDeleteHistoryPage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

/** File ▸ Restore or Reverse ▸ Reverse Multi Edit (`/restore-or-reverse/bulk-update-history`); newest first, capped at 500 rows. */
export class ReverseMultiEditPage extends BulkDeleteHistoryPage {
    override readonly pageUrl = '/restore-or-reverse/bulk-update-history' as string;
    override readonly heading: Locator;
    private readonly menu: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Reverse Multi Edit — Bulk Update History', level: 1 });
        this.menu = new LeftNavigationPage(page);
    }

    override async goto(): Promise<void> {
        await this.menu.openViaMenu(['File', 'Restore or Reverse', 'Reverse Multi Edit'], this.pageUrl);
        await this.heading.waitFor({ state: 'visible' });
    }
}

export default ReverseMultiEditPage;
