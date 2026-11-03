import type { Page } from '@playwright/test';

/** `YYYY-MM-DD` of today + `offset` days on the browser's clock, the one the selection screens default from. */
export async function browserDay(page: Page, offset = 0): Promise<string> {
    return page.evaluate((o) => {
        const d = new Date();
        d.setDate(d.getDate() + o);
        return d.toLocaleDateString('en-CA');
    }, offset);
}

/**
 * A date and time as a Filter description prints it. The app formats with its i18n language, detected from the browser
 * (`toLocaleString(lang, { year, month, day: 'numeric', hour: 'numeric', minute: '2-digit' })`, bundle 2026-11-02): the
 * en-US Docker browser reads `11/2/2026, 12:00 AM`, a d/m browser its own form. Built with the same call, never hard-coded.
 */
export async function summaryStamp(page: Page, day: string, hhmm: string): Promise<string> {
    return page.evaluate(
        ({ d, t }) => {
            const [y, m, dd] = d.split('-').map(Number);
            const [h, mi] = t.split(':').map(Number);
            return new Date(y, m - 1, dd, h, mi).toLocaleString(navigator.language, {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
            });
        },
        { d: day, t: hhmm },
    );
}
