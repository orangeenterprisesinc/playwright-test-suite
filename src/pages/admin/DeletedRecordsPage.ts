/**
 * File ▸ Administration ▸ Deleted Records (`/settings/deleted-records`) and the per-entity
 * "Deleted <Plural>" page behind each link (e.g. `/setup/crops/deleted`).
 *
 * "Empty recycle bin" is deliberately not exposed: it purges tenant-wide.
 */
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';

/** Measured 2026-10-14: each virtualized row is about 37 px tall. */
const ROW_HEIGHT = 37;
const MAX_SCROLL_STEPS = 120;

export class DeletedRecordsPage extends BasePage {
    readonly pageUrl = '/settings/deleted-records';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.heading = page.getByRole('heading', { name: 'Deleted Records', level: 1, exact: true });
        this.leftNav = new LeftNavigationPage(page);
    }

    async gotoIndex(): Promise<void> {
        await this.leftNav.openViaMenu(['File', 'Administration', 'Deleted Records'], this.pageUrl);
        await this.heading.waitFor({ state: 'visible' });
    }

    entityLink(label: string): Locator {
        return this.page.getByRole('main').getByRole('link', { name: `${label} View deleted records`, exact: true });
    }

    /** Click the entity's link on screen and wait for its Deleted page. */
    async openEntity(label: string, plural: string): Promise<void> {
        await this.entityLink(label).click();
        await this.page.waitForURL(/\/deleted(\?|$)/);
        await this.deletedHeading(plural).waitFor({ state: 'visible' });
    }

    deletedHeading(plural: string): Locator {
        return this.page.getByRole('heading', { name: `Deleted ${plural}`, level: 1, exact: true });
    }

    deletedGrid(plural: string): Locator {
        return this.page.getByRole('grid', { name: `Deleted ${plural}` });
    }

    deletedRow(plural: string, name: string): Locator {
        return this.deletedGrid(plural)
            .getByRole('row')
            .filter({ has: this.page.getByRole('cell', { name, exact: true }) });
    }

    /**
     * The grid is virtualized (about 27 of thousands of rows attached) and its `?name=` filter is
     * broken, so scroll the inner scroller until the row attaches: first to the hinted index, then
     * a page at a time, then once more from the top in case the bin's order shifted.
     */
    async revealRow(plural: string, name: string, hintIndex: number): Promise<void> {
        const grid = this.deletedGrid(plural);
        const row = this.deletedRow(plural, name).first();
        await grid.waitFor({ state: 'visible' });
        const scroller = grid.locator('div.overflow-auto').first();
        const attached = () => row.waitFor({ state: 'attached', timeout: 800 }).then(() => true, () => false);
        const metrics = () => scroller.evaluate((el) => ({ top: el.scrollTop, height: el.clientHeight }));

        await grid.hover();
        const { height } = await metrics();
        await this.page.mouse.wheel(0, Math.max(0, hintIndex * ROW_HEIGHT - height / 2));

        for (const fromTop of [false, true]) {
            if (fromTop) await scroller.evaluate((el) => { el.scrollTop = 0; });
            let last = -1;
            for (let step = 0; step < MAX_SCROLL_STEPS; step += 1) {
                if (await attached()) {
                    await row.scrollIntoViewIfNeeded();
                    return;
                }
                const { top } = await metrics();
                if (top === last) break; // bottom reached
                last = top;
                await this.page.mouse.wheel(0, height);
            }
        }
        throw new Error(`Deleted ${plural}: row '${name}' never attached (hint index ${String(hintIndex)})`);
    }

    /**
     * Click the row's Restore until the POST for this record is seen: the first click after a
     * scroll was swallowed on 2026-10-14. The caller asserts the toast and the row leaving.
     */
    async restore(plural: string, name: string, id: number): Promise<void> {
        const row = this.deletedRow(plural, name);
        await expect(async () => {
            const posted = this.page.waitForResponse(
                (res) => res.request().method() === 'POST' && new RegExp(`/${String(id)}/restore(\\?|$)`).test(res.url()),
                { timeout: 5_000 },
            );
            posted.catch(() => undefined); // handled if the click throws first
            await row.getByRole('button', { name: 'Restore' }).click({ timeout: 5_000 });
            await posted;
        }).toPass({ timeout: 20_000 });
    }

    backToListButton(label: string): Locator {
        return this.page.getByRole('button', { name: `Back to ${label} list` });
    }

    async backToList(label: string): Promise<void> {
        await this.backToListButton(label).click();
    }
}

export default DeletedRecordsPage;
