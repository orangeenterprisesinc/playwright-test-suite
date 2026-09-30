/**
 * @fileoverview The two base-ui picker shapes the PET Tiger setup forms use.
 *
 * Both report `role="combobox"`, so the role does not tell them apart — and they
 * behave differently enough that driving one like the other silently does nothing:
 *
 * - **Select** — a `BUTTON[data-slot="select-trigger"]`. No filter input. Click it and
 *   the whole option list appears; typing goes nowhere. Options carry `data-value`
 *   with the wire enum (`#paymentType`: Time `0`, Piece `1`).
 * - **Combobox** — an `INPUT[type=text]`. Types to filter, and server-backed ones cap
 *   at 100 rows with a "keep typing to narrow" footer, so an option past the first
 *   page only exists after typing its name.
 *
 * Journey page objects use this rather than `src/components/webpet/*`: the two page
 * registries do not mix, and lint enforces that. (A shared *component* would be legal,
 * but the web-pet one models web-pet's own variants.)
 *
 * `CrewTablePage.pick()` is the original of the combobox half.
 */
import { Locator, Page, expect } from '@playwright/test';

export class PickerComponent {
    private readonly listbox: Locator;

    constructor(private readonly page: Page) {
        this.listbox = page.getByRole('listbox');
    }

    /**
     * How the pickers label an option: the bare name, or `"<exportIdentifier> : <name>"`.
     * Anchored so `B1 CREW` never matches `B1 CREW EXTRA`.
     */
    static labelPattern(label: string): RegExp {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|: )${escaped}$`);
    }

    private option(label: string): Locator {
        return this.page.getByRole('option', { name: PickerComponent.labelPattern(label) });
    }

    /**
     * Pick from a typable combobox. Types the label only when the option is not
     * already on screen — the server-backed pickers page at 100.
     */
    async pickCombobox(combobox: Locator, label: string): Promise<void> {
        await combobox.click();
        await this.listbox.waitFor({ state: 'visible' });
        const option = this.option(label);
        if (!(await option.isVisible().catch(() => false))) {
            await this.page.keyboard.type(label);
        }
        await option.click();
        // The selection is the input's value, not its text.
        await expect(combobox).toHaveValue(PickerComponent.labelPattern(label));
    }

    /**
     * Pick from a Select by the option's visible text. Never types: the trigger is a
     * button and keystrokes are dropped.
     */
    async pickSelect(trigger: Locator, label: string): Promise<void> {
        await trigger.click();
        await this.listbox.waitFor({ state: 'visible' });
        await this.page.getByRole('option', { name: label, exact: true }).click();
        await expect(trigger).toContainText(label);
    }

    /**
     * Pick from a Select by the wire value behind the option, for fields where the
     * enum is the contract and the label is presentation — `#paymentType` above all.
     */
    async pickSelectByValue(trigger: Locator, value: string | number): Promise<void> {
        await trigger.click();
        await this.listbox.waitFor({ state: 'visible' });
        await this.listbox.locator(`[data-value="${String(value)}"]`).click();
    }

    /** Whether a picker currently holds a value, for "is this already set" checks. */
    async comboboxValue(combobox: Locator): Promise<string> {
        return combobox.inputValue();
    }
}

export default PickerComponent;
