/**
 * Setup ▸ Crew (`/setup/crews`).
 *
 * Name is the only thing gating Save. The one non-obvious field is the notify user:
 * the API calls it `userToNotifyBreakAndMeal`, the screen labels it **"User to Notify
 * for Break & Meal"** and puts it in the Break & Automation section. Its neighbour
 * "Break & Meal Notification" (`#breakAndMealNotification`) is a minutes value — a
 * different field with a confusingly similar name.
 *
 * B12 points that field at a user as a workflow step, which is why `setNotifyUser`
 * exists here rather than as a `PUT /crews/{id}`. D10 does the same for the exercise
 * and automatic-break rule (`setBreakAutomation`).
 */
import { expect, Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface NewCrewData {
    name: string;
    code: string;
    shortName?: string;
}

/** The Break & Automation rule, by the labels the screen shows. */
export interface BreakAutomation {
    includeInTransfer: boolean;
    timeEmployeesIncluded: boolean;
    exerciseJob: string;
    exerciseJobLengthMinutes: number;
    createBreakCardFromTimeIn: string;
    autoPaidBreakType: string;
    autoReturnFromBreak: string;
    /** Comma-separated minutes, as typed into the field. */
    breakLengths: string;
}

export class CrewPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly codeInput: Locator;
    readonly shortNameInput: Locator;
    /** "User to Notify for Break & Meal" — the API's `userToNotifyBreakAndMeal`. */
    readonly notifyUserCombobox: Locator;
    readonly includeInTransferCheckbox: Locator;
    readonly timeEmployeesIncludedSwitch: Locator;
    readonly exerciseJobCombobox: Locator;
    readonly exerciseJobLengthInput: Locator;
    readonly createBreakCardSelect: Locator;
    readonly autoPaidBreakTypeSelect: Locator;
    readonly autoReturnFromBreakSelect: Locator;
    readonly breakLengthsInput: Locator;
    private readonly pickers: PickerComponent;

    constructor(page: Page) {
        super(page, {
            listUrl: '/setup/crews',
            gridName: 'Crews',
            entity: 'Crew',
            menuPath: ['Setup', 'Crew'],
            rejectionMessage: /already (exists|in use)|Failed to (create|update) crew/i,
        });
        this.nameInput = page.locator('#name');
        this.codeInput = page.locator('#code');
        this.shortNameInput = page.locator('#shortName');
        this.notifyUserCombobox = page.locator('#userToNotifyBreakAndMeal');
        this.includeInTransferCheckbox = page.getByRole('checkbox', { name: 'Include in Transfer' });
        this.timeEmployeesIncludedSwitch = page.getByRole('switch', { name: 'Time Employees Included' });
        this.exerciseJobCombobox = page.locator('input#exerciseJobCounter');
        this.exerciseJobLengthInput = page.locator('input#exerciseJobLengthMinutes');
        this.createBreakCardSelect = page.locator('button#createBreakCardFromTimeIn');
        this.autoPaidBreakTypeSelect = page.locator('button#autoPaidBreakType');
        this.autoReturnFromBreakSelect = page.locator('button#autoReturnFromBreak');
        this.breakLengthsInput = page.locator('input#breakLengthMinutesCommaSeparated');
        this.pickers = new PickerComponent(page);
    }

    protected get firstFormField(): Locator {
        return this.nameInput;
    }

    async fillForm(data: NewCrewData): Promise<void> {
        await this.assertCodeEditable(this.codeInput);
        await this.codeInput.fill(data.code);
        if (data.shortName) await this.shortNameInput.fill(data.shortName);
        await this.nameInput.fill(data.name);
    }

    async createCrew(data: NewCrewData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }

    /** The user currently set to be notified, as the picker displays it. */
    async readNotifyUser(): Promise<string> {
        return this.notifyUserCombobox.inputValue();
    }

    /**
     * Point the crew's break-and-meal notification at a user and save. A no-op when it
     * already holds that user — re-picking the same value leaves the form clean and
     * Save never enables.
     */
    async setNotifyUser(userName: string): Promise<void> {
        if (PickerComponent.labelPattern(userName).test(await this.readNotifyUser())) return;
        await this.pickers.pickCombobox(this.notifyUserCombobox, userName);
        await this.saveEdit();
    }

    /**
     * Apply the exercise and automatic-break rule on the open Edit form. Every field is read
     * first and the call returns `false` without touching Save when all already match — on a
     * second run re-entering the same values leaves the form clean, Save never enables, and
     * `saveEdit` would fail with a misleading "Save stayed disabled". Read each select's visible
     * label, never the sibling hidden textbox (the Exercise Job's holds the whole record as JSON).
     */
    async setBreakAutomation(rule: BreakAutomation): Promise<boolean> {
        // The job list behind the Exercise Job combobox is fetched after the rest of the form has
        // hydrated; until it lands the input reads empty and its placeholder says "Loading...".
        // Reading it then makes an already-correct crew look different, so the rule is re-picked,
        // nothing goes dirty, and Save never enables.
        await expect(this.exerciseJobCombobox).not.toHaveAttribute('placeholder', /^Loading/);

        const label = async (trigger: Locator) => (await trigger.innerText()).trim();
        const changes: Array<() => Promise<void>> = [];

        if ((await this.includeInTransferCheckbox.isChecked()) !== rule.includeInTransfer) {
            changes.push(() => this.includeInTransferCheckbox.click());
        }
        if ((await this.timeEmployeesIncludedSwitch.isChecked()) !== rule.timeEmployeesIncluded) {
            changes.push(() => this.timeEmployeesIncludedSwitch.click());
        }
        if (!PickerComponent.labelPattern(rule.exerciseJob).test(await this.exerciseJobCombobox.inputValue())) {
            changes.push(() => this.pickers.pickCombobox(this.exerciseJobCombobox, rule.exerciseJob));
        }
        if (Number(await this.exerciseJobLengthInput.inputValue()) !== rule.exerciseJobLengthMinutes) {
            changes.push(() => this.exerciseJobLengthInput.fill(String(rule.exerciseJobLengthMinutes)));
        }
        if ((await label(this.createBreakCardSelect)) !== rule.createBreakCardFromTimeIn) {
            changes.push(() => this.pickers.pickSelect(this.createBreakCardSelect, rule.createBreakCardFromTimeIn));
        }
        if ((await label(this.autoPaidBreakTypeSelect)) !== rule.autoPaidBreakType) {
            changes.push(() => this.pickers.pickSelect(this.autoPaidBreakTypeSelect, rule.autoPaidBreakType));
        }
        if ((await label(this.autoReturnFromBreakSelect)) !== rule.autoReturnFromBreak) {
            changes.push(() => this.pickers.pickSelect(this.autoReturnFromBreakSelect, rule.autoReturnFromBreak));
        }
        if ((await this.breakLengthsInput.inputValue()).trim() !== rule.breakLengths) {
            changes.push(() => this.breakLengthsInput.fill(rule.breakLengths));
        }

        if (!changes.length) return false;
        for (const change of changes) await change();
        await this.saveEdit();
        return true;
    }
}

export default CrewPage;
