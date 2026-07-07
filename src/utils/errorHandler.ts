/**
 * @fileoverview Error classification, context enrichment, and retry delegation.
 *
 * {@link ErrorHandler} inspects error messages to categorise them into
 * well-known {@link ErrorCategory} buckets, provides recovery suggestions,
 * and delegates retries to {@link RetryHelper}.
 *
 * @module utils/errorHandler
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ErrorHandler, ErrorCategory } from '@utils/errorHandler';
 *
 * try { await page.click('#btn'); }
 * catch (e) {
 *   const ctx = ErrorHandler.getErrorContext(e as Error);
 *   if (ErrorHandler.isRetryable(e as Error)) {
 *     await ErrorHandler.retry(() => page.click('#btn'));
 *   }
 * }
 * ```
 */
import {RetryHelper, type RetryOptions} from './retryHelper';

export {RetryOptions};

/**
 * Well-known categories for classifying test errors.
 *
 * @enum {string}
 */
export enum ErrorCategory {
    /** Network connectivity issues */
    NETWORK = 'NETWORK',
    /** Operation timeout / exceeded deadline */
    TIMEOUT = 'TIMEOUT',
    /** Target element not found in the DOM */
    ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
    /** Page navigation failures */
    NAVIGATION = 'NAVIGATION',
    /** Assertion / expectation failures */
    ASSERTION = 'ASSERTION',
    /** Authentication or authorization failures */
    AUTHENTICATION = 'AUTHENTICATION',
    /** Input validation errors */
    VALIDATION = 'VALIDATION',
    /** Errors that don't match any known pattern */
    UNKNOWN = 'UNKNOWN',
}

/**
 * Rich error context that wraps the original error with metadata.
 *
 * @interface ErrorContext
 * @property {ErrorCategory} category      - Classified category
 * @property {string}        message       - Original error message
 * @property {Error}         originalError - The raw Error instance
 * @property {Date}          timestamp     - When the error was categorised
 */
export interface ErrorContext {
    category: ErrorCategory;
    message: string;
    originalError: Error;
    timestamp: Date;
}

/**
 * Static utility for classifying errors, creating rich contexts, suggesting
 * recovery actions, and delegating retries to {@link RetryHelper}.
 *
 * @class ErrorHandler
 */
export class ErrorHandler {
    /**
     * Categorises an error based on its message using specific keyword patterns.
     * Uses word boundaries / specific phrases to avoid false positives
     * (e.g., `'author'` no longer matches `AUTHENTICATION`).
     *
     * @param {Error} error - The error to classify
     * @returns {ErrorCategory} The determined category
     *
     * @example
     * ```typescript
     * const cat = ErrorHandler.categorizeError(new Error('net::ERR_CONNECTION_REFUSED'));
     * // cat === ErrorCategory.NETWORK
     * ```
     */
    static categorizeError(error: Error): ErrorCategory {
        const msg = error.message.toLowerCase();
        if (msg.includes('network') || msg.includes('net::err_')) return ErrorCategory.NETWORK;
        if (msg.includes('timeout') || msg.includes('timed out')) return ErrorCategory.TIMEOUT;
        if (msg.includes('not found') || msg.includes('no element matches'))
            return ErrorCategory.ELEMENT_NOT_FOUND;
        if (msg.includes('navigation')) return ErrorCategory.NAVIGATION;
        if (msg.includes('assert') || msg.includes('expect(')) return ErrorCategory.ASSERTION;
        if (msg.includes('authentication') || msg.includes('unauthorized') || msg.includes('403'))
            return ErrorCategory.AUTHENTICATION;
        if (msg.includes('validation') || msg.includes('invalid input'))
            return ErrorCategory.VALIDATION;
        return ErrorCategory.UNKNOWN;
    }

    /**
     * Wraps an error with rich contextual metadata.
     *
     * @param {Error} error - The error to wrap
     * @returns {ErrorContext} Enriched error context object
     */
    static getErrorContext(error: Error): ErrorContext {
        return {
            category: this.categorizeError(error),
            message: error.message,
            originalError: error,
            timestamp: new Date(),
        };
    }

    /**
     * Delegates to RetryHelper.retry to avoid duplicate retry implementations.
     */
    static async retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
        return RetryHelper.retry(fn, options);
    }

    /**
     * Determines whether an error is worth retrying (network, timeout, or element-not-found).
     *
     * @param {Error} error - The error to evaluate
     * @returns {boolean} `true` if the error category is retryable
     */
    static isRetryable(error: Error): boolean {
        const cat = this.categorizeError(error);
        return [
            ErrorCategory.NETWORK,
            ErrorCategory.TIMEOUT,
            ErrorCategory.ELEMENT_NOT_FOUND,
        ].includes(cat);
    }

    /**
     * Returns a human-readable recovery suggestion based on the error category.
     *
     * @param {Error} error - The error to analyse
     * @returns {string} Suggested recovery action
     */
    static getRecoverySuggestion(error: Error): string {
        const cat = this.categorizeError(error);
        switch (cat) {
            case ErrorCategory.NETWORK:
                return 'Check network connectivity and retry';
            case ErrorCategory.TIMEOUT:
                return 'Increase timeout or check page load performance';
            case ErrorCategory.ELEMENT_NOT_FOUND:
                return 'Verify element selector and wait for element to appear';
            case ErrorCategory.NAVIGATION:
                return 'Check URL and navigation flow';
            case ErrorCategory.AUTHENTICATION:
                return 'Verify authentication credentials and session';
            default:
                return 'Check error details and retry';
        }
    }
}
