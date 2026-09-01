import { expect, Locator, Page } from '@playwright/test';

/**
 * The shared date-range column filter used by the office grids (Transfer to Job
 * Cards, View ▸ Time Cards). Extracted from `TransferToJobCardsPage` when a
 * second screen needed it — the behaviour below was learned the hard way against
 * dev staging and is worth having in exactly one place.
 *
 * The filter is a segmented date input, not a text field: two groups of
 * Month/Day/Year with `aria-label`s, plus Cancel/Apply.
 *
 *   - Apply does nothing while the segments are untouched, even though they
 *     already display today.
 *   - For any day other than today/yesterday, typing into the segments never
 *     commits (the chip keeps the previous range); clicking the calendar day
 *     cell does. One click collapses the range onto that day, a second click on
 *     the same cell toggles it back — hence the read-back guard rather than
 *     clicking blindly.
 */
export async function applyDateRange(page: Page, filter: Locator, date = new Date()): Promise<void> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await filter.click();
    const popup = page.getByRole('dialog');
    await popup.waitFor({ state: 'visible', timeout: 10_000 });

    const preset = sameDay(date, new Date()) ? 'Today' : sameDay(date, yesterday) ? 'Yesterday' : null;
    if (preset) {
        await popup.getByText(preset, { exact: true }).click();
    } else {
        const ordinal = (n: number) => {
            if (n % 10 === 1 && n % 100 !== 11) return 'st';
            if (n % 10 === 2 && n % 100 !== 12) return 'nd';
            if (n % 10 === 3 && n % 100 !== 13) return 'rd';
            return 'th';
        };
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const dayLabel = new RegExp(
            `${monthName} ${date.getDate()}${ordinal(date.getDate())}, ${date.getFullYear()}`,
        );
        // Only the past is ever requested (punchDate = today − N days), so only
        // "previous month" navigation is needed.
        const prevMonthButton = popup.getByRole('button', { name: /go to the previous month/i });
        const dayCell = popup.getByRole('button', { name: dayLabel });
        for (let i = 0; i < 12 && (await dayCell.count()) === 0; i += 1) {
            await prevMonthButton.click();
        }
        await dayCell.first().waitFor({ state: 'visible', timeout: 10_000 });
        await dayCell.first().click();

        const daySegments = popup.getByRole('textbox', { name: 'Day' });
        const collapsed = async () =>
            (await daySegments.nth(0).inputValue()) === String(date.getDate()) &&
            (await daySegments.nth(1).inputValue()) === String(date.getDate());
        if (!(await collapsed())) {
            await dayCell.first().click();
        }
    }
    await page.getByRole('button', { name: /^apply$/i }).click();

    const expected = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
    await expect(filter).toContainText(expected, { timeout: 20_000 });
}
