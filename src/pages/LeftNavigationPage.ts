/**
 * @fileoverview Page Object for the PET Tiger left navigation sidebar.
 *
 * The sidebar landmarks below confirm that the authenticated app shell has
 * rendered — used as the post-login success signal.
 *
 * @module pages/LeftNavigationPage
 * @since 1.0.0
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page Object representing the authenticated shell's left navigation.
 *
 * @class LeftNavigationPage
 * @extends BasePage
 */
export class LeftNavigationPage extends BasePage {
    /** The authenticated shell lives at the app root. */
    readonly pageUrl: string = '/';
    /** Title assertion is not used by the login suite; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    /** Sidebar menu search box — visible only when logged in. */
    readonly searchMenu: Locator;
    /** "Welcome back" greeting — visible only when logged in. */
    readonly welcomeBack: Locator;

    constructor(page: Page) {
        super(page);
        this.searchMenu = page.getByPlaceholder('Search menu');
        this.welcomeBack = page.getByText('Welcome back');
    }
}
