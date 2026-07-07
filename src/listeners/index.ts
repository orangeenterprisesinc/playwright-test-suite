/**
 * @fileoverview Barrel export for the **listeners** module.
 *
 * Re-exports lifecycle hooks and method interception utilities so consumers
 * can import everything from a single entry-point:
 *
 * ```typescript
 * import {
 *   onTestStart, onTestEnd, getSuiteStats,
 *   isTestActive, getGrepPattern,
 * } from '@listeners';
 * ```
 *
 * @module listeners
 * @author Vicky
 * @since 1.0.0
 */

/** Test lifecycle hooks and suite statistics */
export {
    onTestStart,
    onTestEnd,
    resetSuiteCounters,
    getSuiteStats,
    formatDuration,
} from './testLifecycleManager';

/** Runner-list filtering and grep-pattern generation */
export {
    getActiveTests,
    isTestActive,
    getTestConfig,
    getGrepPattern,
    resetRunnerListCache,
} from './methodInterceptor';
export type { RunnerListEntry } from './methodInterceptor';