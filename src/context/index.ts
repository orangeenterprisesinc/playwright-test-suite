/**
 * @fileoverview Barrel export for all context-management modules.
 *
 * Re-exports execution context, test metrics, test run context, and current test tracker
 * for convenient single-import usage.
 *
 * @module context
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ExecutionContext, TestMetrics, TestRunContext, CurrentTestTracker } from '../context';
 * ```
 */
export { ExecutionContext } from './executionContext';
export type { ExecutionContextSnapshot } from './executionContext';
export { TestMetrics } from './testMetrics';
export type { TestMetricSnapshot } from './testMetrics';
export { TestRunContext, CurrentTestTracker } from './testRunContext';
