import { Locator, Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * Shared base for the three office crew-punch forms under Input ▸ Batch
 * (`/input/crew-time-in|crew-piece-out|crew-time-out/new`).
 *
 * These are the office equivalents of what a handheld records, and a journey spec drives them on
 * screen rather than through `POST /api/time-cards/*` — the API accepts an explicit `employeeIds`
 * list, which lets a test punch employees who are not in the crew at all and hides exactly the kind
 * of data problem the form refuses.
 *
 * Two things the forms do that the API does not (both measured live 2026-09-29):
 * - The **Employees** section only appears once a crew is chosen, and it lists that crew's active
 *   members. An employee with no home crew, or an inactive one, simply is not offered.
 * - Crew Time In has **no Job field** — the job reaches the day through the piece-out.
 *
 * Comboboxes come in two shapes here: a fillable `input` (crew, field, job) and a plain `button`
 * that only opens a listbox (ranch). `pickCombo` handles both.
 */
export abstract class CrewPunchPage extends BasePage {
    readonly dateTimeInput: Locator;
    readonly crewCombobox: Locator;
    readonly ranchCombobox: Locator;
    readonly fieldCombobox: Locator;
    readonly jobCombobox: Locator;
    readonly memoInput: Locator;
    readonly saveButton: Locator;
    readonly employeesSection: Locator;
    private wantedDateTime = '';

    protected constructor(page: Page, readonly pageUrl: string, readonly pageTitle: string | RegExp) {
        super(page);
        this.dateTimeInput = page.locator('#dateTime');
        this.crewCombobox = page.locator('#crewCounter');
        this.ranchCombobox = page.locator('#ranchCounter');
        this.fieldCombobox = page.locator('#fieldCounter');
        this.jobCombobox = page.locator('#jobCounter');
        this.memoInput = page.locator('#memo');
        this.saveButton = page.getByRole('button', { name: 'Save' }).first();
        this.employeesSection = page.getByText('Employees', { exact: false }).first();
    }

    async gotoNew(): Promise<void> {
        await this.page.goto(this.pageUrl, { waitUntil: 'domcontentloaded' });
        await this.dateTimeInput.waitFor({ state: 'visible', timeout: 45_000 });
    }

    /**
     * `YYYY-MM-DDTHH:mm` into the native datetime-local field, asserted afterwards.
     *
     * The value is re-applied by {@link selectCrew} because choosing a crew re-renders the form and
     * can reset it — and on Crew Time Out the date is what decides which employees have an open
     * time-in, so a silently reset date reads as "No employees with open time in found for this crew".
     */
    async setDateTime(day: string, hour: number, minute: number): Promise<void> {
        const pad = (n: number) => String(n).padStart(2, '0');
        this.wantedDateTime = `${day}T${pad(hour)}:${pad(minute)}`;
        await this.dateTimeInput.fill(this.wantedDateTime);
        await expect(this.dateTimeInput).toHaveValue(this.wantedDateTime, { timeout: 15_000 });
    }

    /** Put the date back if the form's re-render dropped it. */
    protected async reassertDateTime(): Promise<void> {
        if (!this.wantedDateTime) return;
        if ((await this.dateTimeInput.inputValue()) === this.wantedDateTime) return;
        await this.dateTimeInput.fill(this.wantedDateTime);
        await expect(this.dateTimeInput).toHaveValue(this.wantedDateTime, { timeout: 15_000 });
    }

    /**
     * Choose a value in one of the form's comboboxes. A fillable input is typed into to narrow the
     * list; a button-only combobox (ranch) is just opened. Either way the option is clicked, so the
     * app's own change handlers run — setting the value directly would skip them.
     */
    protected async pickCombo(combo: Locator, text: string): Promise<void> {
        await combo.waitFor({ state: 'visible', timeout: 25_000 });
        await combo.click();
        await this.page.waitForTimeout(500);
        if ((await combo.evaluate((e) => e.tagName)) === 'INPUT') await combo.fill(text);
        const option = this.page.getByRole('option').filter({ hasText: text }).first();
        await option.waitFor({ state: 'visible', timeout: 15_000 });
        await option.click();
    }

    async selectCrew(name: string): Promise<void> {
        await this.pickCombo(this.crewCombobox, name);
        await this.reassertDateTime();
        // Choosing the crew is what loads its employees; the form is not complete until they arrive.
        await this.waitForEmployees();
    }

    async selectRanch(name: string): Promise<void> {
        await this.pickCombo(this.ranchCombobox, name);
    }

    async selectField(name: string): Promise<void> {
        await this.pickCombo(this.fieldCombobox, name);
    }

    /**
     * The job. On these forms it is labelled **Phase**, not "Job" — same `#jobCounter` control. It
     * is optional on Crew Time In, but a time-in without it is not transferable: analyze reports
     * `plannableTotal 0` while still counting the rows as eligible, so the day looks fine and simply
     * never produces a job card.
     */
    async selectJob(name: string): Promise<void> {
        await this.pickCombo(this.jobCombobox, name);
    }

    /**
     * Save the punch. Validation runs on blur and the crew's employees load asynchronously, so Save
     * is polled rather than read once. A still-disabled Save is reported with the form's own text,
     * which is where the app explains itself ("No employees found for this crew").
     */
    async save(): Promise<void> {
        await this.saveButton.waitFor({ state: 'visible', timeout: 25_000 });
        try {
            await expect(async () => {
                expect(await this.saveButton.isEnabled()).toBeTruthy();
            }).toPass({ timeout: 30_000 });
        } catch {
            // The form states its own reason ("No employees with open time in found for this crew"),
            // and without it a disabled Save is indistinguishable from a slow one.
            const reason = (await this.page.locator('form').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
            throw new Error(`${this.pageUrl}: Save stayed disabled. Form says: ${reason.slice(0, 400)}`);
        }
        await this.saveButton.click();
        // Committing leaves the /new form for the list. Asserting that is what turns a rejected save
        // into a readable failure instead of a missing record noticed three steps later.
        try {
            await this.page.waitForURL((url) => !url.pathname.endsWith('/new'), { timeout: 20_000 });
        } catch {
            const reason = (await this.page.locator('form').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
            throw new Error(`${this.pageUrl}: Save was clicked but the form did not commit. Form says: ${reason.slice(0, 400)}`);
        }
    }

    /** Wait for the crew's employee list to populate — it loads after the crew is chosen. */
    protected async waitForEmployees(): Promise<void> {
        await this.page
            .getByRole('button', { name: /Deselect All|Select All/i })
            .first()
            .waitFor({ state: 'visible', timeout: 25_000 })
            .catch(() => undefined);
    }
}

export default CrewPunchPage;
