import { Locator, Page } from "@playwright/test";

export class LeftNavigationPage {

    readonly page: Page;
    // Sidebar landmarks that confirm the authenticated shell has rendered.
    readonly searchMenu: Locator;
    readonly welcomeBack: Locator;

    constructor(page: Page) {
        this.page = page;
        this.searchMenu = page.getByPlaceholder('Search menu');
        this.welcomeBack = page.getByText('Welcome back');
    }
}
