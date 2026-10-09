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
    /** A swatch hex from the Badge Color popover. */
    badgeColor?: string;
    supervisor?: string;
    department?: string;
    defaultRanch?: string;
    /** Offered only for the chosen ranch, so pick the ranch first. */
    defaultField?: string;
    defaultJob?: string;
}

export interface CrewAutoBreak {
    autoPaidBreakType: string;
    autoReturnFromBreak: string;
    /** Comma-separated minutes, as typed into the field. */
    breakLengths: string;
}

export interface CrewExerciseNotification {
    exerciseJob: string;
    exerciseJobLengthMinutes: number;
    breakAndMealNotification: string;
    notifyUser: string;
}

/** 24h `HH:mm`, as the `type=time` inputs take and report it. */
export interface CrewDayStart {
    from: string;
    to: string;
    fixedTime: string;
}

/** Every displayed value the A4 reload check compares; picker values carry no `<exportId> : ` prefix. */
export interface CrewForm {
    name: string;
    exportIdentifier: string;
    code: string;
    badgeColor: string;
    supervisor: string;
    department: string;
    defaultRanch: string;
    defaultField: string;
    defaultJob: string;
    autoPaidBreakType: string;
    autoReturnFromBreak: string;
    breakLengths: string;
    exerciseJob: string;
    exerciseJobLengthMinutes: string;
    breakAndMealNotification: string;
    notifyUser: string;
    dayStartFrom: string;
    dayStartTo: string;
    dayStartFixedTime: string;
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
    readonly exportIdentifierInput: Locator;
    /** No stable id: `label[for="badgeColor"]` points at nothing, so the trigger is found through its wrapper. */
    readonly badgeColorTrigger: Locator;
    readonly badgeColorDialog: Locator;
    readonly supervisorCombobox: Locator;
    readonly departmentCombobox: Locator;
    readonly defaultRanchSelect: Locator;
    readonly defaultFieldCombobox: Locator;
    readonly defaultJobCombobox: Locator;
    /** A text input, not a number: the wire value is a string. */
    readonly breakAndMealNotificationInput: Locator;
    readonly dayStartFromInput: Locator;
    readonly dayStartToInput: Locator;
    readonly dayStartFixedTimeInput: Locator;
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
        this.exportIdentifierInput = page.locator('#exportIdentifier');
        this.badgeColorTrigger = page
            .locator('div.space-y-1', { has: page.locator('label[for="badgeColor"]') })
            .locator('button[data-slot="popover-trigger"]');
        this.badgeColorDialog = page.getByRole('dialog');
        this.supervisorCombobox = page.locator('input#supervisorCounter');
        this.departmentCombobox = page.locator('input#departmentCounter');
        this.defaultRanchSelect = page.locator('button#defaultRanchCounter');
        this.defaultFieldCombobox = page.locator('input#defaultFieldCounter');
        this.defaultJobCombobox = page.locator('input#defaultJobCounter');
        this.breakAndMealNotificationInput = page.locator('input#breakAndMealNotification');
        this.dayStartFromInput = page.locator('input#dayStartFrom');
        this.dayStartToInput = page.locator('input#dayStartTo');
        this.dayStartFixedTimeInput = page.locator('input#dayStartFixedTime');
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
        if (data.badgeColor) await this.pickBadgeColor(data.badgeColor);
        if (data.supervisor) await this.pickers.pickCombobox(this.supervisorCombobox, data.supervisor);
        if (data.department) {
            // Disabled until /departments lands.
            await expect(this.departmentCombobox).toBeEnabled();
            await this.pickers.pickCombobox(this.departmentCombobox, data.department);
        }
        if (data.defaultRanch) await this.pickers.pickSelect(this.defaultRanchSelect, data.defaultRanch);
        if (data.defaultField) await this.pickers.pickCombobox(this.defaultFieldCombobox, data.defaultField);
        if (data.defaultJob) await this.pickers.pickCombobox(this.defaultJobCombobox, data.defaultJob);
    }

    async createCrew(data: NewCrewData): Promise<FormOutcome> {
        return this.createOnScreen(() => this.fillForm(data));
    }

    successToast(text: string): Locator {
        return this.page.getByText(text, { exact: true });
    }

    heading(text: string): Locator {
        return this.page.getByRole('heading', { name: text, level: 1, exact: true });
    }

    async pickBadgeColor(hex: string): Promise<void> {
        await this.badgeColorTrigger.click();
        await this.badgeColorDialog.getByRole('button', { name: hex, exact: true }).click();
        await expect(this.badgeColorTrigger).toHaveText(hex);
        await this.badgeColorDialog.getByRole('button', { name: 'Close' }).click();
        await expect(this.badgeColorDialog).toBeHidden();
    }

    /** Fill only; the caller saves. `setBreakAutomation` stays the all-in-one path D10 uses. */
    async fillAutoBreak(rule: CrewAutoBreak): Promise<void> {
        await this.breakLengthsInput.fill(rule.breakLengths);
        await this.pickers.pickSelect(this.autoReturnFromBreakSelect, rule.autoReturnFromBreak);
        await this.pickers.pickSelect(this.autoPaidBreakTypeSelect, rule.autoPaidBreakType);
    }

    async fillExerciseAndNotification(rule: CrewExerciseNotification): Promise<void> {
        // Jobs load after the form; picking before they land reads "Loading..." and can pick nothing.
        await expect(this.exerciseJobCombobox).not.toHaveAttribute('placeholder', /^Loading/);
        await this.pickers.pickCombobox(this.exerciseJobCombobox, rule.exerciseJob);
        await this.exerciseJobLengthInput.fill(String(rule.exerciseJobLengthMinutes));
        await this.breakAndMealNotificationInput.fill(rule.breakAndMealNotification);
        await this.pickers.pickCombobox(this.notifyUserCombobox, rule.notifyUser);
    }

    async fillDayStart(day: CrewDayStart): Promise<void> {
        // Filled straight after the previous save, From went out as null in the PUT while To/Fixed did not
        // (trace 2026-10-09). Re-fill until all three hold together, so Save sends what the screen shows.
        const fields: Array<[Locator, string]> = [
            [this.dayStartFromInput, day.from],
            [this.dayStartToInput, day.to],
            [this.dayStartFixedTimeInput, day.fixedTime],
        ];
        await expect(async () => {
            for (const [input, value] of fields) {
                if ((await input.inputValue()) !== value) await input.fill(value);
            }
            for (const [input, value] of fields) await expect(input).toHaveValue(value, { timeout: 1_000 });
        }).toPass({ timeout: 15_000 });
    }

    async readCrewForm(): Promise<CrewForm> {
        await expect(this.exerciseJobCombobox).not.toHaveAttribute('placeholder', /^Loading/);
        const trigger = async (select: Locator) => (await select.innerText()).trim();
        // Pickers show "<exportId> : <name>"; a row without an export id reads " : C6 SUPERVISOR".
        const picked = async (combobox: Locator) => (await combobox.inputValue()).replace(/^[^:]*: /, '').trim();
        return {
            name: await this.nameInput.inputValue(),
            exportIdentifier: await this.exportIdentifierInput.inputValue(),
            code: await this.codeInput.inputValue(),
            badgeColor: await trigger(this.badgeColorTrigger),
            supervisor: await picked(this.supervisorCombobox),
            department: await picked(this.departmentCombobox),
            defaultRanch: await trigger(this.defaultRanchSelect),
            defaultField: await picked(this.defaultFieldCombobox),
            defaultJob: await picked(this.defaultJobCombobox),
            autoPaidBreakType: await trigger(this.autoPaidBreakTypeSelect),
            autoReturnFromBreak: await trigger(this.autoReturnFromBreakSelect),
            breakLengths: (await this.breakLengthsInput.inputValue()).trim(),
            exerciseJob: await picked(this.exerciseJobCombobox),
            exerciseJobLengthMinutes: await this.exerciseJobLengthInput.inputValue(),
            breakAndMealNotification: await this.breakAndMealNotificationInput.inputValue(),
            notifyUser: await picked(this.notifyUserCombobox),
            dayStartFrom: await this.dayStartFromInput.inputValue(),
            dayStartTo: await this.dayStartToInput.inputValue(),
            dayStartFixedTime: await this.dayStartFixedTimeInput.inputValue(),
        };
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
