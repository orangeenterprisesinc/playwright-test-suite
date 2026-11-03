import { Locator, Page, expect } from '@playwright/test';
import { BaseComponent } from './BaseComponent';
import { pickRangeInPopup, pickSingleDayRangeInPopup, usDate } from '../pages/processing/dateRangePopup';

/** `06:17` → `6:17 AM` (00 → 12 AM, 12 → 12 PM), the time picker's format. */
function toPickerTime(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const meridiem = h < 12 ? 'AM' : 'PM';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${meridiem}`;
}

/** The From / To / Apply strip of a date-scoped list (Job Cards, Crew Time In): no rows load until Apply. */
export class ListDateRangeComponent extends BaseComponent {
    private readonly fromInput: Locator;
    private readonly toInput: Locator;
    private readonly applyButton: Locator;

    constructor(page: Page) {
        // The strip is not inside a landmark of its own, so the root is the whole page, as the old locators were.
        super(page, page.locator('body'));
        this.fromInput = this.getByRole('textbox', { name: 'From' });
        this.toInput = this.getByRole('textbox', { name: 'To' });
        this.applyButton = this.getByTestId('list-date-range-apply');
    }

    /** From/To = the same `YYYY-MM-DD` day, then Apply. */
    async apply(day: string): Promise<void> {
        await this.applyButton.waitFor({ state: 'visible' });
        // Opened from the menu, the screen keeps the last applied range and its rows, and Apply stays disabled
        // until the range changes — so that range is already loaded and there is nothing to click.
        const alreadyApplied = (await this.fromInput.inputValue()) === day && (await this.toInput.inputValue()) === day;
        await this.fromInput.fill(day);
        await this.toInput.fill(day);
        if (alreadyApplied) return;
        await this.applyButton.click();
        await this.applyButton.waitFor({ state: 'attached' });
    }

    /** Date range through the strip's popup, then the Start/End times. Does not click the list's Apply. */
    async setRangeWithTimes(from: string, to: string, startHHmm: string, endHHmm: string): Promise<void> {
        const strip = this.getByTestId('selection-date-range');
        // The trigger's label differs per screen, so the slot attribute is used, not the role name.
        await strip.locator('[data-slot="popover-trigger"]').first().click();
        const popup = this.page.getByRole('dialog').filter({ has: this.page.getByRole('button', { name: /go to the previous month/i }) });
        if (from === to) await pickSingleDayRangeInPopup(popup, from);
        else await pickRangeInPopup(popup, from, to);
        await popup.getByRole('button', { name: 'Apply', exact: true }).click();
        await expect(popup).toBeHidden();
        await expect(strip).toContainText(new RegExp(`${usDate(from)}\\s*[–-]\\s*${usDate(to)}`));
        await this.setTime('selection-date-range-start-time', startHHmm);
        await this.setTime('selection-date-range-end-time', endHHmm);
    }

    async applyWithTimes(from: string, to: string, startHHmm: string, endHHmm: string): Promise<void> {
        await this.setRangeWithTimes(from, to, startHHmm, endHHmm);
        await this.applyButton.click();
    }

    private async setTime(testId: string, hhmm: string): Promise<void> {
        const want = toPickerTime(hhmm);
        const trigger = this.getByTestId(testId).locator('[data-slot="time-picker"]');
        await trigger.click();
        const manual = this.getByTestId('time-picker-manual');
        await manual.fill(want);
        // The value commits on blur; Enter alone did not (measured 2026-10-30).
        await manual.press('Tab');
        await this.page.keyboard.press('Escape');
        await expect(manual).toBeHidden();
        await expect(trigger).toHaveText(want);
    }
}

export default ListDateRangeComponent;
