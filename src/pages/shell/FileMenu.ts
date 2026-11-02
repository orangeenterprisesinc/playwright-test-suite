import { Locator, Page, expect } from '@playwright/test';
import { LeftNavigationPage } from './LeftNavigationPage';

/**
 * The sidebar's File group. Restore or Reverse exists twice for su: File ▸ Restore or Reverse and File ▸ Administration ▸
 * Restore or Reverse (measured 2026-11-02). The File-level one comes after Administration's subtree in DOM order, so it is
 * the last match.
 */
export class FileMenu {
    readonly fileItem: Locator;
    private readonly fileButton: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        this.leftNav = new LeftNavigationPage(page);
        this.fileButton = page.getByRole('button', { name: 'File', exact: true });
        this.fileItem = page.getByRole('listitem').filter({ has: this.fileButton });
    }

    private async expand(button: Locator): Promise<void> {
        if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
    }

    private restoreOrReverseButton(): Locator {
        return this.fileItem.getByRole('button', { name: 'Restore or Reverse', exact: true }).last();
    }

    /** A button's own list item, whose nested list is the group's entries. */
    private groupItem(button: Locator): Locator {
        return button.locator('xpath=..');
    }

    /** File ▸ Restore or Reverse captions, disabled entries included (they render without a link). */
    async restoreOrReverseItems(): Promise<string[]> {
        await this.leftNav.openApp();
        await this.expand(this.fileButton);
        const rr = this.restoreOrReverseButton();
        await expect(rr, 'File ▸ Restore or Reverse').toBeVisible({ timeout: 15_000 });
        await this.expand(rr);
        const items = this.groupItem(rr).getByRole('listitem');
        await expect(items.first()).toBeVisible({ timeout: 15_000 });
        return (await items.allInnerTexts()).map((t) => t.trim());
    }

    restoreOrReverseLink(caption: string): Locator {
        return this.groupItem(this.restoreOrReverseButton()).getByRole('link', { name: caption, exact: true });
    }
}

export default FileMenu;
