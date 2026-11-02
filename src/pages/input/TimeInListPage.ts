import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { LeftNavigationPage } from '../shell/LeftNavigationPage';
import { DataGridComponent } from '../../components/DataGridComponent';
import { ListDateRangeComponent } from '../../components/ListDateRangeComponent';

export interface ShownTimeIn {
    reference: string;
    /** The Date / Time cell as shown (locale-formatted). */
    shown: string;
    /** The same instant as `YYYY-MM-DDTHH:mm:ss`, local wall clock; '' when unparseable. */
    at: string;
}

/**
 * Input ▸ Time In, `/input/time-in` (WEBPET-3932). Measured on dev 2026-11-02 (su): the `selection-date-range` strip
 * (From – To popup, Start time, End time) loads nothing until `list-date-range-apply`. Apply writes
 * `?from=YYYY-MM-DDTHH:mm&to=…`, and the range is continuous (start time on the start date, end time on the end date).
 * Rows are labelled by Reference; Date / Time reads like "10/21/2026, 7:00:00 AM" in en-US.
 */
export class TimeInListPage extends BasePage {
    static readonly MENU_PATH = ['Input', 'Time In'];
    readonly pageUrl = '/input/time-in';
    readonly pageTitle: string | RegExp = /.*/;

    readonly heading: Locator;
    readonly dates: ListDateRangeComponent;
    readonly grid: DataGridComponent;
    readonly applyButton: Locator;
    private readonly leftNav: LeftNavigationPage;

    constructor(page: Page) {
        super(page);
        this.leftNav = new LeftNavigationPage(page);
        this.heading = page.getByRole('heading', { level: 1 });
        this.dates = new ListDateRangeComponent(page);
        this.grid = new DataGridComponent(page, 'Time In', 'Time In');
        this.applyButton = page.getByTestId('list-date-range-apply');
    }

    async openFromMenu(): Promise<void> {
        await this.leftNav.openScreen(TimeInListPage.MENU_PATH, this.pageUrl);
        await this.applyButton.waitFor({ state: 'visible', timeout: 30_000 });
    }

    /** Dates through the popup, Start/End time, Apply; waits until the URL carries the range and the footer shows. */
    async applyRange(from: string, to: string, startHHmm: string, endHHmm: string): Promise<void> {
        await this.dates.applyWithTimes(from, to, startHHmm, endHHmm);
        await this.page.waitForURL(
            (u) => u.searchParams.get('from') === `${from}T${startHHmm}` && u.searchParams.get('to') === `${to}T${endHHmm}`,
            { timeout: 30_000 },
        );
        await expect(this.grid.totalRowsStatus).toBeVisible({ timeout: 30_000 });
    }

    appliedRange(): { from: string | null; to: string | null } {
        const p = new URL(this.page.url()).searchParams;
        return { from: p.get('from'), to: p.get('to') };
    }

    row(reference: string): Locator {
        return this.page.getByRole('grid', { name: 'Time In' }).getByRole('row', { name: reference, exact: true });
    }

    /**
     * Every rendered row's Reference and Date / Time. The cell is formatted in the app's i18n language (localStorage
     * `i18nextLng`, else the browser's), so the date-part order and AM/PM words come from Intl for that language and are
     * never hard-coded. The caller checks one own row's value, which calibrates the parse.
     */
    async shownRows(): Promise<ShownTimeIn[]> {
        const total = await this.grid.totalRowCount();
        await expect
            .poll(() => this.grid.bodyRows.count(), { timeout: 15_000, message: `grid is virtualizing rows (footer says ${total}); narrow the range` })
            .toBe(total);
        const refs = await this.grid.columnValues('Reference');
        const shown = await this.grid.columnValues('Date / Time');
        const at = await this.page.evaluate((texts) => {
            const lang = localStorage.getItem('i18nextLng') || navigator.language;
            const order = new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'numeric', day: 'numeric' })
                .formatToParts(new Date(2026, 10, 22))
                .filter((p) => p.type === 'year' || p.type === 'month' || p.type === 'day')
                .map((p) => p.type);
            const period = (h: number): string =>
                (new Intl.DateTimeFormat(lang, { hour: 'numeric', hour12: true }).formatToParts(new Date(2026, 0, 1, h)).find((p) => p.type === 'dayPeriod')?.value ?? '').toLowerCase();
            const am = period(1);
            const pm = period(13);
            const pad = (n: number): string => String(n).padStart(2, '0');
            return texts.map((t) => {
                const n = (t.match(/\d+/g) ?? []).map(Number);
                if (n.length < 5) return '';
                const d: Record<string, number> = {};
                order.forEach((k, i) => { d[k] = n[i]; });
                let h = n[3];
                const low = t.toLowerCase();
                if (pm && low.includes(pm) && h < 12) h += 12;
                else if (am && low.includes(am) && h === 12) h = 0;
                return `${d.year}-${pad(d.month)}-${pad(d.day)}T${pad(h)}:${pad(n[4])}:${pad(n[5] ?? 0)}`;
            });
        }, shown);
        return refs.map((reference, i) => ({ reference, shown: shown[i], at: at[i] }));
    }
}

export default TimeInListPage;
