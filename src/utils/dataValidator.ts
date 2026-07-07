/**
 * @fileoverview Data validation utilities for test input sanitisation and verification.
 *
 * {@link DataValidator} provides static methods to validate emails, URLs, phone numbers,
 * string lengths, numeric ranges, patterns, and enum membership.
 *
 * @module utils/dataValidator
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { DataValidator } from '@utils/dataValidator';
 *
 * const result = DataValidator.validateEmail('user@example.com'); // true
 * const lengthCheck = DataValidator.validateMinLength('abc', 5, 'name');
 * console.log(DataValidator.getReport(lengthCheck));
 * ```
 */

/**
 * Result of a validation check.
 *
 * @interface ValidationResult
 * @property {boolean} valid - Whether the validation passed
 * @property {string[]} errors - List of error messages (empty when valid)
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Static validation utility class for common data checks.
 *
 * @class DataValidator
 */
export class DataValidator {

    /**
     * Trims whitespace and collapses internal whitespace runs to a single space.
     * @param {string} str - Input string
     * @returns {string} Sanitised string
     */
    static sanitizeString(str: string): string {
        return str.trim().replace(/\s+/g, ' ');
    }


    /**
     * Validates that a string is a well-formed email address.
     * @param {string} email - Email to validate
     * @returns {boolean} `true` if valid
     */
    static validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validates that a string is a well-formed URL.
     * @param {string} url - URL to validate
     * @returns {boolean} `true` if valid
     */
    static validateUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validates that a phone string contains at least 10 digits.
     * @param {string} phone - Phone number to validate
     * @returns {boolean} `true` if valid
     */
    static validatePhone(phone: string): boolean {
        const phoneRegex = /^[\d\s\-+()]+$/;
        return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
    }

    /**
     * Validates that the value is neither `null` nor `undefined`.
     * @param {*} value - Value to check
     * @param {string} [fieldName='value'] - Label for error messages
     * @returns {ValidationResult}
     */
    static validateRequired(value: any, fieldName: string = 'value'): ValidationResult {
        const errors: string[] = [];
        if (value === null || value === undefined) {
            errors.push(`${fieldName} is required`);
        }
        return {valid: errors.length === 0, errors};
    }

    /**
     * Validates that a string meets a minimum length.
     * @param {string} str - String to check
     * @param {number} minLength - Minimum allowed length
     * @param {string} [fieldName='value'] - Label for error messages
     * @returns {ValidationResult}
     */
    static validateMinLength(
        str: string,
        minLength: number,
        fieldName: string = 'value',
    ): ValidationResult {
        const errors: string[] = [];
        if (str.length < minLength) {
            errors.push(`${fieldName} must be at least ${minLength} characters`);
        }
        return {valid: errors.length === 0, errors};
    }

    /**
     * Validates that a string does not exceed a maximum length.
     * @param {string} str - String to check
     * @param {number} maxLength - Maximum allowed length
     * @param {string} [fieldName='value'] - Label for error messages
     * @returns {ValidationResult}
     */
    static validateMaxLength(
        str: string,
        maxLength: number,
        fieldName: string = 'value',
    ): ValidationResult {
        const errors: string[] = [];
        if (str.length > maxLength) {
            errors.push(`${fieldName} must be at most ${maxLength} characters`);
        }
        return {valid: errors.length === 0, errors};
    }


    /**
     * Validates that a number falls within an inclusive range.
     * @param {number} num - Number to check
     * @param {number} min - Minimum value (inclusive)
     * @param {number} max - Maximum value (inclusive)
     * @param {string} [fieldName='value'] - Label for error messages
     * @returns {ValidationResult}
     */
    static validateRange(
        num: number,
        min: number,
        max: number,
        fieldName: string = 'value',
    ): ValidationResult {
        const errors: string[] = [];
        if (num < min || num > max) {
            errors.push(`${fieldName} must be between ${min} and ${max}`);
        }
        return {valid: errors.length === 0, errors};
    }


    /**
     * Validates that a string matches a regular expression pattern.
     * @param {string} value - String to test
     * @param {RegExp} pattern - Regex pattern
     * @param {string} [fieldName='value'] - Label for error messages
     * @returns {ValidationResult}
     */
    static validatePattern(
        value: string,
        pattern: RegExp,
        fieldName: string = 'value',
    ): ValidationResult {
        const errors: string[] = [];
        if (!pattern.test(value)) {
            errors.push(`${fieldName} does not match required pattern`);
        }
        return {valid: errors.length === 0, errors};
    }

    /**
     * Validates that a value is included in a set of allowed values.
     * @param {*} value - Value to check
     * @param {any[]} allowedValues - Permitted values
     * @param {string} [fieldName='value'] - Label for error messages
     * @returns {ValidationResult}
     */
    static validateEnum(
        value: any,
        allowedValues: any[],
        fieldName: string = 'value',
    ): ValidationResult {
        const errors: string[] = [];
        if (!allowedValues.includes(value)) {
            errors.push(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
        }
        return {valid: errors.length === 0, errors};
    }

    /**
     * Generates a human-readable report from a {@link ValidationResult}.
     * @param {ValidationResult} result - The validation result to format
     * @returns {string} Formatted report string
     */
    static getReport(result: ValidationResult): string {
        if (result.valid) {
            return 'Validation passed';
        }
        return `Validation failed:\n${result.errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`;
    }
}
