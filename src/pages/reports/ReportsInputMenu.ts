import { Locator, Page, expect } from '@playwright/test';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

/**
 * The sidebar's Reports ▸ Input group. Scoped to the Reports item on purpose: the top-level Input menu has its own
 * "Job Card" and "Time In" leaves (/input/job-cards, /input/time-in), so a label walk through
 * LeftNavigationPage.openViaMenu can open those instead (measured 2026-11-02).
 */
export class ReportsInputMenu {
    private readonly inputItem: Locator;
    private readonly reportsButton: Locator;
    private readonly inputButton: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        this.leftNav = new LeftNavigationPage(page);
        const reportsItem = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Reports', exact: true }) });
        this.reportsButton = reportsItem.getByRole('button', { name: 'Reports', exact: true });
        this.inputItem = reportsItem.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Input', exact: true }) });
        this.inputButton = this.inputItem.getByRole('button', { name: 'Input', exact: true });
    }

    async expand(): Promise<void> {
        await this.leftNav.openApp();
        if ((await this.reportsButton.getAttribute('aria-expanded')) !== 'true') await this.reportsButton.click();
        await expect(this.inputButton, 'Reports ▸ Input').toBeVisible({ timeout: 15_000 });
        if ((await this.inputButton.getAttribute('aria-expanded')) !== 'true') await this.inputButton.click();
        await expect(this.inputItem.getByRole('link').first()).toBeVisible({ timeout: 15_000 });
    }

    /**
     * Since web-pet #1569 (2026-11-05) the Reports hub is a report catalogue with no Input group, so the
     * report-selection screens are deep links (shell/navigation.json `noMenuEntry`); LeftNavigationPage.openScreen
     * records that on the test. The old sidebar walk (`expand`) is kept for a shell that still has the group.
     */
    async open(leaf: string, url: string): Promise<void> {
        await this.leftNav.openScreen(['Reports', 'Input', leaf], url);
    }
}
