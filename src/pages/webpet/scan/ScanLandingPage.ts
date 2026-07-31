/**
 * @fileoverview The Scan Mode landing grid (`/scan`) — WEBPET-908.
 *
 * One card per scan screen. Wired cards render as `<a>` links carrying the screen
 * segment; deferred cards render as a disabled Card with `aria-disabled="true"`
 * and no `href`, so the card's *tag name* is part of the contract, not incidental.
 */
import { Locator, Page } from '@playwright/test';
import { BasePage } from '../../BasePage';

/**
 * @extends BasePage
 */
export class ScanLandingPage extends BasePage {
    readonly pageUrl: string = '/scan';
    readonly pageTitle: string | RegExp = /.*/;

    /** The card grid. Waited on explicitly before card assertions — it mounts async. */
    readonly landingGrid: Locator;

    constructor(page: Page) {
        super(page);

        this.landingGrid = page.locator('[data-testid="scan-landing-grid"]');
    }

    /**
     * Open the landing page.
     *
     * A plain `goto`, not `BasePage.navigate()` — that pins
     * `waitUntil: 'domcontentloaded'` while the lifted specs use the default.
     */
    async gotoLanding(): Promise<void> {
        await this.page.goto(this.pageUrl);
    }

    /** A screen's card, keyed by screen key (`'timeIn'`), not by route segment. */
    card(screenKey: string): Locator {
        return this.page.locator(`[data-testid="scan-card-${screenKey}"]`);
    }

    /** Wait for the grid to mount. */
    async waitForGrid(): Promise<void> {
        await this.landingGrid.waitFor({ state: 'visible' });
    }
}

export default ScanLandingPage;
