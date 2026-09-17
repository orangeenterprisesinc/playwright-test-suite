/**
 * Scan Devices ▸ create/edit — `/setup/scan-devices`, `/setup/scan-devices/<id>`.
 *
 * General, Crew and Field locators are confirmed against dev staging. The save toast,
 * the unsaved-changes bar and the Push control's name are still UNVERIFIED — they come
 * from a recording of a different on-prem build (WEBPET-1533) and are isolated in the
 * exported constants below so a wrong string is a one-line fix, not a locator hunt.
 */
import { expect, Locator, Page, Response } from '@playwright/test';
import { BasePage } from '../BasePage';

/** Only the pocket-class type gets a Crew section; immutable after create. */
export const DEVICE_TYPE = { generic: '0' } as const;
export const CONNECTIVITY_METHOD = { web: '4' } as const;

/** UNVERIFIED on dev — sourced from the B15 recording only. */
export const SCAN_DEVICE_STRINGS = {
    savedToast: 'Scan device saved',
    unsavedChangesHeading: 'Unsaved changes',
    discardChanges: 'Discard changes',
    saveDisabledTooltip: 'No changes to save',
    wholeRanch: 'Whole ranch',
} as const;

export const PUSH_TO_DEVICE_NAME = 'Push to Device';
/** The inline result panel the button renders — confirmed on dev staging. */
export const PUSH_RESULT = { succeeded: 'Push succeeded', destinationPrefix: 'Destination:' } as const;

export interface ScanDeviceGeneral {
    name: string;
    referencePrefix: string;
    webMailAddress: string;
}

export interface PushToDeviceOutcome {
    /** The inline panel's destination line, e.g. `Destination: ZZTEST_SD_X@silo`. */
    destination: string;
}

export class ScanDevicePage extends BasePage {
    readonly pageUrl: string = '/setup/scan-devices';
    readonly pageTitle: string | RegExp = /Scan Device/i;

    readonly generalSection: Locator;
    readonly nameInput: Locator;
    readonly referencePrefixInput: Locator;
    readonly webMailAddressInput: Locator;
    readonly saveButton: Locator;

    readonly preferencesSection: Locator;
    readonly crewSection: Locator;
    readonly crewCombobox: Locator;
    readonly crewAddButton: Locator;

    readonly ranchFieldSection: Locator;
    readonly ranchCombobox: Locator;
    readonly fieldCombobox: Locator;
    readonly ranchFieldAddButton: Locator;
    readonly ranchFieldRows: Locator;

    readonly savedToast: Locator;
    readonly unsavedChangesBar: Locator;
    readonly discardChangesButton: Locator;
    readonly saveDisabledTooltip: Locator;
    readonly pushToDeviceButton: Locator;
    readonly pushSucceeded: Locator;
    readonly pushDestination: Locator;
    readonly pushDownloadFile: Locator;

    constructor(page: Page) {
        super(page);

        this.generalSection = page.locator('section#general');
        this.nameInput = page.locator('input#name');
        this.referencePrefixInput = page.locator('input#referencePrefix');
        this.webMailAddressInput = page.locator('input#webMailAddress');
        this.saveButton = page.getByRole('button', { name: 'Save' });

        this.preferencesSection = page.locator('section#preferences');
        this.crewSection = page.locator('section#crew');
        this.crewCombobox = this.crewSection.getByRole('combobox');
        this.crewAddButton = this.crewSection.getByRole('button', { name: 'Add' });

        // The section is `field`, and neither combobox carries an accessible name —
        // the first renders "— Select Ranch —" as content, the second is disabled
        // until a ranch is chosen. Index is the only discriminator the DOM offers.
        this.ranchFieldSection = page.locator('section#field');
        this.ranchCombobox = this.ranchFieldSection.getByRole('combobox').nth(0);
        this.fieldCombobox = this.ranchFieldSection.getByRole('combobox').nth(1);
        this.ranchFieldAddButton = this.ranchFieldSection.getByRole('button', { name: 'Add' });
        this.ranchFieldRows = this.ranchFieldSection.locator('li');

        this.savedToast = page.getByText(SCAN_DEVICE_STRINGS.savedToast);
        this.unsavedChangesBar = page.getByText(SCAN_DEVICE_STRINGS.unsavedChangesHeading);
        this.discardChangesButton = page.getByRole('button', { name: SCAN_DEVICE_STRINGS.discardChanges });
        this.saveDisabledTooltip = page.getByText(SCAN_DEVICE_STRINGS.saveDisabledTooltip);
        this.pushToDeviceButton = page.getByRole('button', { name: PUSH_TO_DEVICE_NAME });
        this.pushSucceeded = page.getByText(PUSH_RESULT.succeeded);
        this.pushDestination = page.locator('p').filter({ hasText: PUSH_RESULT.destinationPrefix });
        this.pushDownloadFile = page.getByRole('button', { name: 'Download file' });
    }

    async gotoNew(): Promise<void> {
        await this.page.goto(`${this.pageUrl}/new`);
    }

    async gotoEdit(id: number): Promise<void> {
        await this.page.goto(`${this.pageUrl}/${String(id)}`);
    }

    /** General Selects carry no ids: [0] = Device Type, [1] = Connectivity Method. */
    generalSelect(index: number): Locator {
        return this.generalSection.locator('[data-slot="select-trigger"]').nth(index);
    }

    selectOption(value: string): Locator {
        return this.page.locator(`[data-slot="select-content"] [data-value="${value}"]`);
    }

    openComboboxOption(value: string): Locator {
        return this.page.locator(`[data-slot="combobox-popup"][data-open] [data-value="${value}"]`);
    }

    /**
     * Field-section options carry no usable `data-value`, and their listbox renders
     * inline inside the combobox rather than in a portaled popup — so neither the
     * Crew section's `data-value` nor its `combobox-popup` wrapper applies here.
     * Only one listbox is open at a time, which is what makes this unambiguous.
     */
    openComboboxOptionByName(name: string): Locator {
        return this.page.getByRole('listbox').getByRole('option', { name, exact: true });
    }

    /** The id comes from the create response — dev's save redirect is unreliable. */
    async createDevice(general: ScanDeviceGeneral): Promise<number> {
        await this.gotoNew();
        await this.nameInput.fill(general.name);

        await this.generalSelect(0).click();
        await this.selectOption(DEVICE_TYPE.generic).click();

        await this.referencePrefixInput.fill(general.referencePrefix);

        await this.generalSelect(1).click();
        await this.selectOption(CONNECTIVITY_METHOD.web).click();

        await this.webMailAddressInput.fill(general.webMailAddress);

        const [response] = await Promise.all([
            this.page.waitForResponse(
                (res) =>
                    res.request().method() === 'POST' &&
                    /\/api\/scan-devices\/?$/.test(new URL(res.url()).pathname),
                { timeout: 30_000 },
            ),
            this.saveButton.click(),
        ]);
        if (!response.ok()) {
            throw new Error(
                `POST /api/scan-devices returned ${String(response.status())}: ${(await response.text()).slice(0, 300)}`,
            );
        }
        const { deviceCounter } = (await response.json()) as { deviceCounter?: number };
        if (!deviceCounter) throw new Error('POST /api/scan-devices response carried no deviceCounter');
        return deviceCounter;
    }

    /** Crew/Preferences render only after the first save. */
    async waitForEditReady(): Promise<void> {
        await this.preferencesSection.waitFor({ state: 'visible', timeout: 60_000 });
    }

    async addCrew(crewCounter: number | string): Promise<void> {
        await this.crewSection.scrollIntoViewIfNeeded();
        await this.crewCombobox.click();
        const option = this.openComboboxOption(String(crewCounter));
        await option.waitFor({ state: 'visible', timeout: 15_000 });
        await option.click();
        await this.crewAddButton.click();
    }

    /**
     * Omitting `fieldCounter` is the whole-ranch case: the field combobox already
     * defaults to "Whole ranch" (`__ranch_only__`). Both it and Add stay disabled
     * until a ranch is chosen, so each step waits for enablement rather than racing it.
     */
    async addRanch(ranchName: string, fieldName?: string): Promise<void> {
        await this.ranchFieldSection.scrollIntoViewIfNeeded();
        await this.ranchCombobox.click();
        const ranchOption = this.openComboboxOptionByName(ranchName);
        await ranchOption.waitFor({ state: 'visible', timeout: 15_000 });
        await ranchOption.click();

        if (fieldName !== undefined) {
            await expect(this.fieldCombobox).toBeEnabled({ timeout: 15_000 });
            await this.fieldCombobox.click();
            const fieldOption = this.openComboboxOptionByName(fieldName);
            await fieldOption.waitFor({ state: 'visible', timeout: 15_000 });
            await fieldOption.click();
        }

        await expect(this.ranchFieldAddButton).toBeEnabled({ timeout: 15_000 });
        await this.ranchFieldAddButton.click();
    }

    ranchFieldRow(ranchName: string, fieldLabel: string = SCAN_DEVICE_STRINGS.wholeRanch): Locator {
        return this.ranchFieldRows.filter({ hasText: `${ranchName} | ${fieldLabel}` });
    }

    /** Scoped to `id` because dev's scan-device save can double-fire. */
    async save(id: number): Promise<Response> {
        const [response] = await Promise.all([
            this.page.waitForResponse(
                (res) => res.request().method() === 'PUT' && res.url().includes(`/api/scan-devices/${String(id)}`),
                { timeout: 60_000 },
            ),
            this.saveButton.click(),
        ]);
        if (!response.ok()) {
            throw new Error(
                `PUT /api/scan-devices/${String(id)} returned ${String(response.status())}: ${(await response.text()).slice(0, 300)}`,
            );
        }
        return response;
    }

    /**
     * Push to Device renders its outcome inline — "Push succeeded" plus the
     * destination mailbox — and offers the produced file for download.
     *
     * The transient "Pushing..." label is deliberately not asserted: the endpoint
     * returns fast enough that the busy state is not reliably observable, so a
     * check on it races rather than verifies.
     */
    async pushToDevice(): Promise<PushToDeviceOutcome> {
        await this.pushToDeviceButton.waitFor({ state: 'visible', timeout: 30_000 });
        await this.pushToDeviceButton.click();
        await expect(this.pushSucceeded).toBeVisible({ timeout: 120_000 });
        const destination = (await this.pushDestination.first().textContent())?.trim() ?? '';
        return { destination };
    }
}

export default ScanDevicePage;
