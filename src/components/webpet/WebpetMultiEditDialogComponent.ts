/**
 * @fileoverview Transfer to Job Cards ▸ More actions ▸ Multi-Edit dialog.
 *
 * Distinct from the Input grids' Multi Update bar (WebpetDataGridComponent): that
 * bar edits six Select-only fields, this dialog edits eighteen. web-pet's 4 → 19
 * field expansion landed here, not there.
 *
 * Flow: fieldSelect → a Value control → Continue (a dryRun POST) → review stage →
 * Apply. There is no bulk-fix-undo endpoint, so Apply is irreversible.
 */
import { expect, Locator, Page } from '@playwright/test';
import { BaseComponent } from '../BaseComponent';

/** `multi-edit-field-select` option values, in render order. */
export type MultiEditFieldValue =
    | 'jobCounter'
    | 'crewCounter'
    | 'ranchCounter'
    | 'fieldCounter'
    | 'workOrderCounter'
    | 'varietyCounter'
    | 'runCounter'
    | 'agRowCounter'
    | 'employeeCounter'
    | 'dateTime'
    | 'dateOnly'
    | 'timeOnly'
    | 'traceabilityCode'
    | 'memo'
    | 'cardType'
    | 'transferred'
    | 'numOfPieces'
    | 'breakTime';

const FK_COMBOBOX_SUFFIX: Partial<Record<MultiEditFieldValue, string>> = {
    jobCounter: 'job',
    crewCounter: 'crew',
    ranchCounter: 'ranch',
    fieldCounter: 'field',
    workOrderCounter: 'workorder',
    varietyCounter: 'variety',
    runCounter: 'run',
    agRowCounter: 'row',
    employeeCounter: 'employee',
};

/**
 * @extends BaseComponent
 */
export class WebpetMultiEditDialogComponent extends BaseComponent {
    readonly fieldSelect: Locator;
    readonly continueButton: Locator;
    readonly cancelButton: Locator;

    readonly dateTimeModeSelect: Locator;
    readonly dateTimeExactInput: Locator;
    readonly dateTimeIntervalFromInput: Locator;
    readonly dateTimeIntervalToInput: Locator;

    readonly dateInput: Locator;
    readonly timeInput: Locator;
    /** Traceability's input and Memo's textarea share this testid — see textInputControl/textAreaControl. */
    readonly textControl: Locator;
    /** Type and Transferred share one native select. */
    readonly choiceSelect: Locator;
    readonly numberInput: Locator;

    readonly reviewStage: Locator;
    readonly reviewIncludeAllCheckbox: Locator;
    readonly reviewNotInScope: Locator;
    readonly bulkfixPreview: Locator;
    readonly applyButton: Locator;

    constructor(page: Page) {
        super(page, page.getByTestId('multi-edit-dialog'));

        this.fieldSelect = this.root.getByTestId('multi-edit-field-select');
        this.continueButton = this.root.getByTestId('multi-edit-submit');
        this.cancelButton = this.root.getByTestId('multi-edit-cancel');

        this.dateTimeModeSelect = this.root.getByTestId('multi-edit-value-mode-select');
        this.dateTimeExactInput = this.root.getByTestId('multi-edit-value-datetime');
        this.dateTimeIntervalFromInput = this.root.getByTestId('multi-edit-value-interval-from');
        this.dateTimeIntervalToInput = this.root.getByTestId('multi-edit-value-interval-to');

        this.dateInput = this.root.getByTestId('multi-edit-value-date');
        this.timeInput = this.root.getByTestId('multi-edit-value-time');
        this.textControl = this.root.getByTestId('multi-edit-value-text');
        this.choiceSelect = this.root.getByTestId('multi-edit-value-choice-select');
        this.numberInput = this.root.getByTestId('multi-edit-value-number');

        this.reviewStage = this.root.getByTestId('multi-edit-review');
        this.reviewIncludeAllCheckbox = this.root.getByTestId('multi-edit-review-include-all');
        this.reviewNotInScope = this.root.getByTestId('multi-edit-review-not-in-scope');
        this.bulkfixPreview = this.root.getByTestId('v2-bulkfix-preview');
        this.applyButton = this.root.getByTestId('multi-edit-review-apply');
    }

    get dialog(): Locator {
        return this.root;
    }

    async waitForOpen(timeout = 15_000): Promise<void> {
        await this.root.waitFor({ state: 'visible', timeout });
    }

    async fieldOptions(): Promise<{ value: string; label: string }[]> {
        return this.fieldSelect.locator('option').evaluateAll((opts) =>
            (opts as HTMLOptionElement[])
                .filter((o) => o.value !== '')
                .map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() })),
        );
    }

    async selectField(field: MultiEditFieldValue): Promise<void> {
        await this.fieldSelect.selectOption(field);
    }

    fkCombobox(field: MultiEditFieldValue): Locator {
        const suffix = FK_COMBOBOX_SUFFIX[field];
        if (!suffix) throw new Error(`"${field}" is not an fk field — no combobox suffix mapping`);
        return this.root.getByTestId(`multi-edit-value-${suffix}-combobox`);
    }

    get textInputControl(): Locator {
        return this.root.locator('input[data-testid="multi-edit-value-text"]');
    }

    get textAreaControl(): Locator {
        return this.root.locator('textarea[data-testid="multi-edit-value-text"]');
    }

    /**
     * The control that distinguishes `field`'s Value area. dateTime resolves to its
     * mode select, since which of the exact/interval inputs renders depends on it.
     */
    valueControlFor(field: MultiEditFieldValue): Locator {
        switch (field) {
            case 'dateTime':
                return this.dateTimeModeSelect;
            case 'dateOnly':
                return this.dateInput;
            case 'timeOnly':
                return this.timeInput;
            case 'traceabilityCode':
            case 'memo':
                return this.textControl;
            case 'cardType':
            case 'transferred':
                return this.choiceSelect;
            case 'numOfPieces':
            case 'breakTime':
                return this.numberInput;
            default:
                return this.fkCombobox(field);
        }
    }

    get comboboxPopup(): Locator {
        return this.page.locator('[data-slot="combobox-popup"][data-open]');
    }

    get comboboxItems(): Locator {
        return this.comboboxPopup.locator('[data-slot="combobox-item"]');
    }

    /** Items can read '' for a frame after opening, so callers poll rather than read once. */
    async openFkCombobox(field: MultiEditFieldValue): Promise<void> {
        await this.fkCombobox(field).click();
        await expect(this.comboboxPopup).toBeVisible({ timeout: 5000 });
    }

    async cancel(): Promise<void> {
        await this.cancelButton.click();
        await this.root.waitFor({ state: 'hidden', timeout: 15_000 });
    }
}

export default WebpetMultiEditDialogComponent;
