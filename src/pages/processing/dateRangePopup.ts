import type { Locator } from '@playwright/test';

const ordinal = (n: number): string => {
    if (n % 10 === 1 && n % 100 !== 11) return 'st';
    if (n % 10 === 2 && n % 100 !== 12) return 'nd';
    if (n % 10 === 3 && n % 100 !== 13) return 'rd';
    return 'th';
};

/** One day's cell in an open single-date popover, paging back up to 12 months to reach it. The caller checks the field. */
export async function pickDayInPopup(popup: Locator, day: string): Promise<void> {
    const [y, m, d] = day.split('-').map(Number);
    const monthName = new Date(y, m - 1, d).toLocaleString('en-US', { month: 'long' });
    // A cell reads "Tuesday, October 20th, 2026", today's with a "Today, " prefix.
    const cell = popup.getByRole('button', { name: new RegExp(`${monthName} ${d}${ordinal(d)}, ${y}`) });
    const previousMonth = popup.getByRole('button', { name: /go to the previous month/i });
    for (let i = 0; i < 12 && (await cell.count()) === 0; i += 1) await previousMonth.click();
    await cell.first().waitFor({ state: 'visible', timeout: 10_000 });
    await cell.first().click();
}

/** `YYYY-MM-DD` → `MM/DD/YYYY`, the date chip's format. */
export function usDate(day: string): string {
    const [year, month, date] = day.split('-');
    return `${month}/${date}/${year}`;
}

/**
 * Today preset, then `from`'s day cell, then `to`'s, in an open two-month date popup; the Month/Day segments are
 * read back and a mismatch fails by name. Apply is the caller's.
 *
 * Measured 2026-10-26: a click before the current start moves the start, a click after it moves the end, so the
 * result depends on the range the popup opened with (View ▸ Job Cards opens on a range, Transfer on none). Today
 * first makes it today–today, and every journey day is in the past: `from` then becomes the start, `to` the end.
 */
export async function pickRangeInPopup(popup: Locator, from: string, to: string): Promise<void> {
    const parts = (day: string) => {
        const [y, m, d] = day.split('-').map(Number);
        return { y, m, d, monthName: new Date(y, m - 1, d).toLocaleString('en-US', { month: 'long' }) };
    };
    const cellOf = (day: string): Locator => {
        const { y, d, monthName } = parts(day);
        return popup.getByRole('button', { name: new RegExp(`${monthName} ${d}${ordinal(d)}, ${y}`) });
    };
    const previousMonth = popup.getByRole('button', { name: /go to the previous month/i });
    const nextMonth = popup.getByRole('button', { name: /go to the next month/i });

    const today = popup.getByRole('button', { name: 'Today', exact: true });
    if (await today.isVisible().catch(() => false)) await today.click();

    const fromCell = cellOf(from);
    for (let i = 0; i < 12 && (await fromCell.count()) === 0; i += 1) await previousMonth.click();
    await fromCell.first().waitFor({ state: 'visible', timeout: 10_000 });
    await fromCell.first().click();

    // `to` is later than `from`, so only forward navigation can be needed (two months are shown).
    const toCell = cellOf(to);
    for (let i = 0; i < 2 && (await toCell.count()) === 0; i += 1) await nextMonth.click();
    await toCell.first().waitFor({ state: 'visible', timeout: 10_000 });
    await toCell.first().click();

    const segment = async (name: 'Month' | 'Day'): Promise<[number, number]> => {
        const boxes = popup.getByRole('textbox', { name });
        return [Number(await boxes.nth(0).inputValue()), Number(await boxes.nth(1).inputValue())];
    };
    const a = parts(from);
    const b = parts(to);
    const [month0, month1] = await segment('Month');
    const [day0, day1] = await segment('Day');
    if (month0 !== a.m || day0 !== a.d || month1 !== b.m || day1 !== b.d) {
        throw new Error(
            `The date popup reads ${month0}/${day0} – ${month1}/${day1} after clicking ${from} then ${to}; ` +
                'refusing a third click, which would toggle the range.',
        );
    }
}
