/**
 * @fileoverview Lightweight module-level context for tracking test iteration and current test name.
 *
 * Provides two simple context objects:
 * - {@link TestRunContext} — Tracks the current iteration/retry index within a test run.
 * - {@link CurrentTestTracker} — Tracks the name of the currently executing test.
 *
 * Both use module-level state (not class instances) for minimal overhead.
 *
 * @module context/testRunContext
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { TestRunContext, CurrentTestTracker } from '../context/testRunContext';
 *
 * TestRunContext.reset();
 * CurrentTestTracker.set('loginTest');
 * TestRunContext.incrementIteration();
 * console.log(TestRunContext.getIterationId()); // 2
 * console.log(CurrentTestTracker.get());        // 'loginTest'
 * ```
 */

/** @private Current iteration/retry counter (1-based). */
let iterationId = 1;
/** @private Name of the currently executing test. */
let currentTestName = '';

/**
 * Tracks the iteration (retry) index during test execution.
 *
 * Useful for retry-aware reporting and logging. The iteration ID is 1-based:
 * first attempt = 1, first retry = 2, etc.
 *
 * @const {object} TestRunContext
 */
export const TestRunContext = {
    /**
     * Resets the iteration counter to 1 (fresh test, no retries).
     */
    reset(): void {
        iterationId = 1;
    },

    /**
     * Increments the iteration counter by 1.
     */
    incrementIteration(): void {
        iterationId += 1;
    },

    /**
     * Returns the current iteration ID (1-based).
     * @returns {number} Current iteration number
     */
    getIterationId(): number {
        return iterationId;
    },

    /**
     * Sets the iteration ID from a 0-based retry index.
     * @param {number} retryIndex - Zero-based retry index (0 = first retry → iteration 1)
     */
    setIterationFromRetry(retryIndex: number): void {
        iterationId = retryIndex + 1;
    },

    /**
     * Alias for {@link reset}. Resets the iteration counter to 1.
     */
    clear(): void {
        iterationId = 1;
    },
};

/**
 * Tracks the name of the currently executing test.
 *
 * Typically set in `beforeEach` and cleared in `afterEach` hooks.
 *
 * @const {object} CurrentTestTracker
 */
export const CurrentTestTracker = {
    /**
     * Returns the current test name.
     * @returns {string} The test name, or empty string if not set
     */
    get(): string {
        return currentTestName;
    },

    /**
     * Sets the current test name.
     * @param {string} name - The test name to track
     */
    set(name: string): void {
        currentTestName = name;
    },

    /**
     * Clears the current test name.
     */
    clear(): void {
        currentTestName = '';
    },
};
