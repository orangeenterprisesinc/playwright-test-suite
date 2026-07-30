/**
 * @fileoverview Shared base for every web-pet list screen (`/setup/<entity>`).
 *
 * Separate from {@link WebpetFormPage} rather than one class per entity, because
 * the two halves of a screen diverged in the app: `crop.spec.ts` records that
 * list pages migrated to the new DataGrid library (PET-424) while form pages
 * were untouched. Modelling them as one object would tie a stable surface to a
 * volatile one.
 *
 * @module pages/webpet/WebpetListPage
 */
import { Locator, Page, Response, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { WebpetDataGridComponent } from '../../components/webpet/WebpetDataGridComponent';

/**
 * @abstract
 * @class WebpetListPage
 * @extends BasePage
 */
export abstract class WebpetListPage extends BasePage {
    readonly pageUrl: string;
    /** Title assertion is unused on these screens; match anything. */
    readonly pageTitle: string | RegExp = /.*/;

    /** The list grid — bare `[role="grid"]`, id-keyed rows. */
    readonly grid: WebpetDataGridComponent;
    /** The page heading, and the readiness signal on screens with no grid rows. */
    readonly heading: Locator;
    /**
     * The list header's print control.
     *
     * Labelled "Report" (i18n `common.reportLabel`) — renamed from "Print
     * Report", so the anchored matcher is deliberate.
     */
    readonly reportButton: Locator;

    /**
     * @param page Playwright page
     * @param listUrl Relative list URL, e.g. `'/setup/crops'`
     * @param headingName Accessible name of the page's `<h1>`
     */
    constructor(page: Page, listUrl: string, headingName: string | RegExp) {
        super(page);
        this.pageUrl = listUrl;
        this.grid = new WebpetDataGridComponent(page, listUrl);
        this.heading = page.getByRole('heading', { name: headingName });
        this.reportButton = page.getByRole('button', { name: /^Report$/ });
    }

    /**
     * Navigate to the list and return the response.
     *
     * Deliberately a plain `page.goto` rather than `BasePage.navigate()`, which
     * pins `waitUntil: 'domcontentloaded'`. The lifted specs use the default
     * (`'load'`), and the response is load-bearing for module-gated screens —
     * a 403 is the documented outcome when the owning module is not in
     * `PT_MODULES`, and it can only be read from the return value.
     */
    async goto(): Promise<Response | null> {
        return this.page.goto(this.pageUrl);
    }

    /** Open the list and wait for the grid to render. */
    async gotoList(): Promise<void> {
        await this.goto();
        await this.grid.waitForGrid();
    }

    /**
     * Open the list with URL state applied, e.g. `'?sort=name.desc'`, and wait
     * for the grid. These screens reflect sort/filter state in the URL and
     * propagate it onto outbound links, so several tests need to arrive with it
     * already set rather than clicking their way there.
     */
    async gotoListWithQuery(query: string): Promise<void> {
        await this.page.goto(`${this.pageUrl}${query}`);
        await this.grid.waitForGrid();
    }

    /** Follow the create affordance through to the blank form. */
    async openNewForm(): Promise<void> {
        await this.grid.newLink.click();
        await this.page.waitForURL(new RegExp(`${this.pageUrl.replace(/\//g, '\\/')}\\/new(\\?|$)`));
    }

    /** Assert the list rendered — heading present and grid visible. */
    async expectLoaded(): Promise<void> {
        await expect(this.heading).toBeVisible();
        await this.grid.waitForGrid();
    }
}

export default WebpetListPage;
