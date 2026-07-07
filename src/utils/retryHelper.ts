/**
 * @fileoverview Configurable retry utilities with multiple backoff strategies.
 *
 * Provides {@link RetryHelper} with static methods for retrying async operations
 * using constant, linear, exponential, or Fibonacci backoff schedules.
 *
 * @module utils/retryHelper
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { RetryHelper } from '@utils/retryHelper';
 *
 * const result = await RetryHelper.retry(
 *   () => fetchData('/api/users'),
 *   { maxAttempts: 5, delayMs: 1000, backoff: true },
 * );
 * ```
 */

/**
 * Configuration options for retry operations.
 *
 * @interface RetryOptions
 * @property {number}  [maxAttempts=3]        - Maximum number of attempts before giving up
 * @property {number}  [delayMs=1000]         - Base delay between retries (ms)
 * @property {boolean} [backoff=true]         - Whether to apply exponential backoff
 * @property {number}  [backoffMultiplier=2]  - Multiplier for exponential backoff
 * @property {number}  [maxDelayMs=30000]     - Maximum delay cap (ms)
 * @property {Function} [onRetry]             - Callback invoked on each retry with attempt number and error
 * @property {Function} [onSuccess]           - Callback invoked on success with the attempt number
 */
export interface RetryOptions {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: boolean;
    backoffMultiplier?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
    onSuccess?: (attempt: number) => void;
}

/**
 * Static utility class providing multiple retry strategies for async operations.
 *
 * @class RetryHelper
 *
 * @example
 * ```typescript
 * // Exponential backoff (default)
 * await RetryHelper.retry(fetchUsers, { maxAttempts: 3 });
 *
 * // Retry until a condition is met
 * await RetryHelper.retryUntil(checkStatus, (s) => s === 'ready');
 *
 * // Fibonacci backoff
 * await RetryHelper.retryFibonacci(fetchUsers, 500, 5);
 * ```
 */
export class RetryHelper {

    /**
     * Retries an async function with configurable backoff.
     *
     * @template T
     * @param {() => Promise<T>} fn - Async function to retry
     * @param {RetryOptions} [options={}] - Retry configuration
     * @returns {Promise<T>} The result of the first successful invocation
     * @throws {Error} The last error if all attempts are exhausted
     */
    static async retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
        const {
            maxAttempts = 3,
            delayMs = 1000,
            backoff = true,
            backoffMultiplier = 2,
            maxDelayMs = 30000,
            onRetry,
            onSuccess,
        } = options;

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await fn();
                onSuccess?.(attempt);
                return result;
            } catch (error) {
                lastError = error as Error;

                if (attempt === maxAttempts) {
                    throw lastError;
                }

                onRetry?.(attempt, lastError);

                let delay = delayMs;
                if (backoff) {
                    delay = Math.min(
                        delayMs * Math.pow(backoffMultiplier, attempt - 1),
                        maxDelayMs,
                    );
                }

                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }

        throw lastError || new Error('Retry exhausted');
    }


    /**
     * Retries an async function until a condition is satisfied.
     *
     * @template T
     * @param {() => Promise<T>} fn - Async function to execute
     * @param {(result: T) => boolean} condition - Predicate that must return `true` to stop retrying
     * @param {RetryOptions} [options={}] - Retry configuration
     * @returns {Promise<T>} The result that satisfies the condition
     * @throws {Error} If the condition is not met within `maxAttempts`
     *
     * @example
     * ```typescript
     * const status = await RetryHelper.retryUntil(
     *   () => getDeployStatus(),
     *   (s) => s === 'deployed',
     *   { maxAttempts: 20, delayMs: 3000 },
     * );
     * ```
     */
    static async retryUntil<T>(
        fn: () => Promise<T>,
        condition: (result: T) => boolean,
        options: RetryOptions = {},
    ): Promise<T> {
        const { maxAttempts = 10, delayMs = 500, onRetry, onSuccess } = options;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await fn();
                if (condition(result)) {
                    onSuccess?.(attempt);
                    return result;
                }

                if (attempt < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
            } catch (error) {
                onRetry?.(attempt, error as Error);
                if (attempt < maxAttempts) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
            }
        }

        throw new Error(`Condition not met after ${maxAttempts} attempts`);
    }


    /**
     * Retries with a custom backoff function that receives the attempt number.
     *
     * @template T
     * @param {() => Promise<T>} fn - Async function to retry
     * @param {(attempt: number) => number} backoffFn - Returns delay (ms) for each attempt
     * @param {number} [maxAttempts=3] - Maximum attempts
     * @returns {Promise<T>} Result of first successful call
     * @throws {Error} The last error if all attempts are exhausted
     */
    static async retryWithBackoff<T>(
        fn: () => Promise<T>,
        backoffFn: (attempt: number) => number,
        maxAttempts: number = 3,
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;

                if (attempt === maxAttempts) {
                    throw lastError;
                }

                const delay = backoffFn(attempt);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }

        throw lastError || new Error('Retry exhausted');
    }

    /**
     * Retries with linear backoff (delay × attempt number).
     *
     * @template T
     * @param {() => Promise<T>} fn - Async function to retry
     * @param {number} [delayMs=1000] - Base delay (ms)
     * @param {number} [maxAttempts=3] - Maximum attempts
     * @returns {Promise<T>} Result of first successful call
     */
    static async retryLinear<T>(
        fn: () => Promise<T>,
        delayMs: number = 1000,
        maxAttempts: number = 3,
    ): Promise<T> {
        return this.retryWithBackoff(fn, (attempt) => delayMs * attempt, maxAttempts);
    }

    /**
     * Retries with exponential backoff (delay × 2^(attempt−1)).
     *
     * @template T
     * @param {() => Promise<T>} fn - Async function to retry
     * @param {number} [delayMs=1000] - Base delay (ms)
     * @param {number} [maxAttempts=3] - Maximum attempts
     * @returns {Promise<T>} Result of first successful call
     */
    static async retryExponential<T>(
        fn: () => Promise<T>,
        delayMs: number = 1000,
        maxAttempts: number = 3,
    ): Promise<T> {
        return this.retryWithBackoff(
            fn,
            (attempt) => delayMs * Math.pow(2, attempt - 1),
            maxAttempts,
        );
    }


    /**
     * Retries with Fibonacci backoff (delay × fib(attempt)).
     *
     * Uses an iterative O(n) Fibonacci implementation.
     *
     * @template T
     * @param {() => Promise<T>} fn - Async function to retry
     * @param {number} [delayMs=1000] - Base delay (ms)
     * @param {number} [maxAttempts=3] - Maximum attempts
     * @returns {Promise<T>} Result of first successful call
     */
    static async retryFibonacci<T>(
        fn: () => Promise<T>,
        delayMs: number = 1000,
        maxAttempts: number = 3,
    ): Promise<T> {
        /** Iterative fibonacci — O(n) instead of O(2^n) */
        const fibonacci = (n: number): number => {
            if (n <= 2) return 1;
            let a = 1, b = 1;
            for (let i = 3; i <= n; i++) {
                const temp = a + b;
                a = b;
                b = temp;
            }
            return b;
        };

        return this.retryWithBackoff(fn, (attempt) => delayMs * fibonacci(attempt), maxAttempts);
    }
}
