import { Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

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
}

export default ListDateRangeComponent;
