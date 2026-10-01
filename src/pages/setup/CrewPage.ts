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
 * exists here rather than as a `PUT /crews/{id}`.
 */
import { Locator, Page } from '@playwright/test';
import { SetupScreenPage, type FormOutcome } from '../SetupScreenPage';
import { PickerComponent } from '../../components/PickerComponent';

export interface NewCrewData {
    name: string;
    code: string;
    shortName?: string;
}

export class CrewPage extends SetupScreenPage {
    readonly nameInput: Locator;
    readonly codeInput: Locator;
    readonly shortNameInput: Locator;
    /** "User to Notify for Break & Meal" — the API's `userToNotifyBreakAndMeal`. */
    readonly notifyUserCombobox: Locator;
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
}

export default CrewPage;
