/**
 * @fileoverview Reusable form component for interacting with HTML forms.
 *
 * Provides methods for filling fields by label/placeholder/name, selecting options,
 * checking/unchecking checkboxes, uploading files, submitting/resetting, and asserting
 * form state (errors, success messages, field values).
 *
 * @module components/FormComponent
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * const form = new FormComponent(page, '#registration-form');
 * await form.fillByLabel('Email', 'user@example.com');
 * await form.fillByLabel('Password', 'secret123');
 * await form.submit();
 * await form.assertSuccess(/registered successfully/i);
 * ```
 */
import { expect, Locator, Page } from '@playwright/test';
import { BaseComponent } from './BaseComponent';

/**
 * Describes a single form field for batch filling via {@link FormComponent.fillForm}.
 *
 * @interface FormField
 * @property {string} name - Label text used to locate the field
 * @property {string | boolean | string[]} value - Value to set
 * @property {('text' | 'select' | 'checkbox' | 'radio' | 'file')} [type='text'] - Field type
 */
interface FormField {
    name: string;
    value: string | boolean | string[];
    type?: 'text' | 'select' | 'checkbox' | 'radio' | 'file';
}

/**
 * Reusable component for interacting with HTML `<form>` elements.
 *
 * Auto-discovers common form elements (submit/reset buttons, error/success messages)
 * and provides high-level methods for filling, submitting, and asserting form state.
 *
 * @class FormComponent
 * @extends {BaseComponent}
 */
export class FormComponent extends BaseComponent {
    /** Submit button locator (matches buttons named submit/save/send). */
    readonly submitButton: Locator;
    /** Reset button locator (matches buttons named reset/clear). */
    readonly resetButton: Locator;
    /** Error message elements locator. */
    readonly formErrors: Locator;
    /** Success message element locator. */
    readonly successMessage: Locator;

    /**
     * Creates a FormComponent scoped to the given root selector.
     * @param {Page} page - Playwright Page instance
     * @param {string} [rootSelector='form'] - CSS selector for the form element
     */
    constructor(page: Page, rootSelector: string = 'form') {
        super(page, rootSelector);

        this.submitButton = this.getByRole('button', { name: /submit|save|send/i });
        this.resetButton = this.getByRole('button', { name: /reset|clear/i });
        this.formErrors = this.locator('.form-error, .error-message, [role="alert"]');
        this.successMessage = this.locator('.success-message, .form-success');
    }

    /**
     * Fills a text input identified by its label.
     * @param {string} label - The label text of the field
     * @param {string} value - The text value to fill
     */
    async fillByLabel(label: string, value: string): Promise<void> {
        this.logger.debug(`Filling field "${label}" with value`);
        await this.getByLabel(label).fill(value);
    }

    /**
     * Fills a text input identified by its placeholder text.
     * @param {string} placeholder - The placeholder text of the field
     * @param {string} value - The text value to fill
     */
    async fillByPlaceholder(placeholder: string, value: string): Promise<void> {
        this.logger.debug(`Filling field with placeholder "${placeholder}"`);
        await this.getByPlaceholder(placeholder).fill(value);
    }

    /**
     * Fills a text input identified by its `name` attribute.
     * @param {string} name - The `name` attribute of the input element
     * @param {string} value - The text value to fill
     */
    async fillByName(name: string, value: string): Promise<void> {
        this.logger.debug(`Filling field "${name}" with value`);
        await this.locator(`[name="${name}"]`).fill(value);
    }

    /**
     * Selects an option in a `<select>` element identified by its label.
     * @param {string} label - The label text of the select element
     * @param {string | string[]} value - Option value(s) to select
     */
    async selectByLabel(label: string, value: string | string[]): Promise<void> {
        this.logger.debug(`Selecting "${value}" in "${label}"`);
        await this.getByLabel(label).selectOption(value);
    }

    /**
     * Checks a checkbox identified by its label.
     * @param {string} label - The label text of the checkbox
     */
    async checkByLabel(label: string): Promise<void> {
        this.logger.debug(`Checking "${label}"`);
        await this.getByLabel(label).check();
    }

    /**
     * Unchecks a checkbox identified by its label.
     * @param {string} label - The label text of the checkbox
     */
    async uncheckByLabel(label: string): Promise<void> {
        this.logger.debug(`Unchecking "${label}"`);
        await this.getByLabel(label).uncheck();
    }

    /**
     * Selects a radio button identified by its label.
     * @param {string} label - The label text of the radio button
     */
    async selectRadioByLabel(label: string): Promise<void> {
        this.logger.debug(`Selecting radio "${label}"`);
        await this.getByLabel(label).check();
    }

    /**
     * Uploads a file to a file input identified by its label.
     * @param {string} label - The label text of the file input
     * @param {string | string[]} filePath - Absolute file path(s) to upload
     */
    async uploadFileByLabel(label: string, filePath: string | string[]): Promise<void> {
        this.logger.debug(`Uploading file to "${label}"`);
        await this.getByLabel(label).setInputFiles(filePath);
    }

    /**
     * Fills multiple form fields in a single call.
     *
     * Each field is identified by its label text; the `type` property determines
     * the interaction method (fill, select, check, upload).
     *
     * @param {FormField[]} fields - Array of field descriptors
     *
     * @example
     * ```typescript
     * await form.fillForm([
     *   { name: 'Email', value: 'user@test.com' },
     *   { name: 'Country', value: 'US', type: 'select' },
     *   { name: 'Terms', value: true, type: 'checkbox' },
     * ]);
     * ```
     */
    async fillForm(fields: FormField[]): Promise<void> {
        this.logger.info(`Filling form with ${fields.length} fields`);

        for (const field of fields) {
            const locator = this.getByLabel(field.name);

            switch (field.type) {
                case 'select':
                    await locator.selectOption(field.value as string | string[]);
                    break;
                case 'checkbox':
                    if (field.value) {
                        await locator.check();
                    } else {
                        await locator.uncheck();
                    }
                    break;
                case 'radio':
                    await locator.check();
                    break;
                case 'file':
                    await locator.setInputFiles(field.value as string | string[]);
                    break;
                default:
                    await locator.fill(field.value as string);
            }
        }
    }

    /** Clicks the submit button to submit the form. */
    async submit(): Promise<void> {
        this.logger.info('Submitting form');
        await this.submitButton.click();
    }

    /** Clicks the reset/clear button to reset the form. */
    async reset(): Promise<void> {
        this.logger.info('Resetting form');
        await this.resetButton.click();
    }

    /** Clears all text inputs, email inputs, password inputs, and textareas in the form. */
    async clearAllInputs(): Promise<void> {
        const inputs = this.locator(
            'input[type="text"], input[type="email"], input[type="password"], textarea',
        );
        const count = await inputs.count();

        for (let i = 0; i < count; i++) {
            await inputs.nth(i).clear();
        }
    }

    /**
     * Gets the current value of a form field identified by its label.
     * @param {string} label - The label text
     * @returns {Promise<string>} The current input value
     */
    async getFieldValue(label: string): Promise<string> {
        return await this.getByLabel(label).inputValue();
    }

    /**
     * Returns all visible error messages in the form.
     * @returns {Promise<string[]>} Array of error message texts
     */
    async getErrors(): Promise<string[]> {
        return await this.formErrors.allTextContents();
    }

    /**
     * Returns the success message text (trimmed), or empty string if none.
     * @returns {Promise<string>} Success message text
     */
    async getSuccessMessage(): Promise<string> {
        const text = await this.successMessage.textContent();
        return text?.trim() || '';
    }

    /** Asserts that no form error messages are displayed. */
    async assertNoErrors(): Promise<void> {
        await expect(this.formErrors).toHaveCount(0);
    }

    /** Asserts that at least one form error message is visible. */
    async assertHasErrors(): Promise<void> {
        await expect(this.formErrors.first()).toBeVisible();
    }

    /**
     * Asserts a specific error message is visible in the form.
     * @param {string | RegExp} message - Expected error text or pattern
     */
    async assertError(message: string | RegExp): Promise<void> {
        await expect(this.formErrors.filter({ hasText: message })).toBeVisible();
    }

    /**
     * Asserts the success message is visible, optionally matching its text.
     * @param {string | RegExp} [message] - Expected success text or pattern
     */
    async assertSuccess(message?: string | RegExp): Promise<void> {
        await expect(this.successMessage).toBeVisible();
        if (message) {
            await expect(this.successMessage).toHaveText(message);
        }
    }

    /**
     * Asserts a field's value matches the expected value or pattern.
     * @param {string} label - Field label text
     * @param {string | RegExp} value - Expected value
     */
    async assertFieldValue(label: string, value: string | RegExp): Promise<void> {
        await expect(this.getByLabel(label)).toHaveValue(value);
    }

    /**
     * Asserts that a checkbox/radio is checked.
     * @param {string} label - Label text of the checkbox/radio
     */
    async assertChecked(label: string): Promise<void> {
        await expect(this.getByLabel(label)).toBeChecked();
    }

    /**
     * Asserts that a checkbox/radio is not checked.
     * @param {string} label - Label text of the checkbox/radio
     */
    async assertUnchecked(label: string): Promise<void> {
        await expect(this.getByLabel(label)).not.toBeChecked();
    }

    /** Asserts the submit button is enabled. */
    async assertSubmitEnabled(): Promise<void> {
        await expect(this.submitButton).toBeEnabled();
    }

    /** Asserts the submit button is disabled. */
    async assertSubmitDisabled(): Promise<void> {
        await expect(this.submitButton).toBeDisabled();
    }
}
