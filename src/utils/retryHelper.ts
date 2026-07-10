/**
 * @fileoverview Configurable retry utilities with multiple backoff strategies.
 * @module utils/retryHelper
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

export class RetryHelper {
    /** Retries an async function with configurable (default: exponential) backoff. */
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
                if (attempt === maxAttempts) throw lastError;

                onRetry?.(attempt, lastError);
                const delay = backoff
                    ? Math.min(delayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs)
                    : delayMs;
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }

        throw lastError || new Error('Retry exhausted');
    }

    /** Retries until `condition(result)` is true, or throws after `maxAttempts`. */
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
                if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
            } catch (error) {
                onRetry?.(attempt, error as Error);
                if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        throw new Error(`Condition not met after ${maxAttempts} attempts`);
    }

    /** Retries with a custom backoff function that receives the attempt number. */
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
                if (attempt === maxAttempts) throw lastError;
                await new Promise((resolve) => setTimeout(resolve, backoffFn(attempt)));
            }
        }

        throw lastError || new Error('Retry exhausted');
    }

    /** Retries with linear backoff (delay × attempt number). */
    static async retryLinear<T>(fn: () => Promise<T>, delayMs: number = 1000, maxAttempts: number = 3): Promise<T> {
        return this.retryWithBackoff(fn, (attempt) => delayMs * attempt, maxAttempts);
    }

    /** Retries with exponential backoff (delay × 2^(attempt−1)). */
    static async retryExponential<T>(fn: () => Promise<T>, delayMs: number = 1000, maxAttempts: number = 3): Promise<T> {
        return this.retryWithBackoff(fn, (attempt) => delayMs * Math.pow(2, attempt - 1), maxAttempts);
    }

    /** Retries with Fibonacci backoff (delay × fib(attempt)), iterative O(n). */
    static async retryFibonacci<T>(fn: () => Promise<T>, delayMs: number = 1000, maxAttempts: number = 3): Promise<T> {
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
