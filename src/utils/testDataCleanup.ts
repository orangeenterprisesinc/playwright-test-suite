/**
 * @fileoverview Test data cleanup management for teardown phases.
 *
 * {@link TestDataCleanup} collects cleanup callbacks during a test and executes
 * them in LIFO (or priority-based) order, guaranteeing resource release even
 * when individual tasks throw.
 *
 * @module utils/testDataCleanup
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { TestDataCleanup } from '@utils/testDataCleanup';
 *
 * const cleanup = new TestDataCleanup();
 * await cleanup.register('remove-user', () => api.deleteUser(userId));
 * // ... test logic ...
 * await cleanup.executeAll();
 * ```
 */

/**
 * A named, prioritised cleanup callback.
 *
 * @interface CleanupTask
 * @property {string} name - Descriptive name (used in reports)
 * @property {() => Promise<void>} execute - Async cleanup function
 * @property {number} [priority] - Higher values execute first (default 0)
 */
export interface CleanupTask {
    name: string;
    execute: () => Promise<void>;
    priority?: number;
}

/**
 * Manages an ordered set of cleanup tasks to be executed during test teardown.
 *
 * @class TestDataCleanup
 */
export class TestDataCleanup {
    private cleanupTasks: CleanupTask[] = [];
    private isExecuting = false;
    private executedTasks: string[] = [];

    /**
     * Registers a named cleanup task with optional priority.
     *
     * @param {string} name - Descriptive name
     * @param {() => Promise<void>} task - Cleanup function
     * @param {number} [priority=0] - Execution priority (higher = earlier)
     * @throws {Error} If called while tasks are already executing
     */
    async register(name: string, task: () => Promise<void>, priority: number = 0): Promise<void> {
        if (this.isExecuting) throw new Error('Cannot register');
        this.cleanupTasks.push({ name, execute: task, priority });
    }

    /**
     * Registers an anonymous cleanup task with an auto-generated name.
     * @param {() => Promise<void>} task - Cleanup function
     */
    async registerSimple(task: () => Promise<void>): Promise<void> {
        await this.register(`cleanup-${Date.now()}`, task);
    }

    /**
     * Executes all registered cleanup tasks in priority / LIFO order.
     * Failures are logged but do not prevent subsequent tasks from running.
     *
     * @throws {Error} If already executing
     */
    async executeAll(): Promise<void> {
        if (this.isExecuting) throw new Error('Already executing');
        this.isExecuting = true;
        this.executedTasks = [];
        try {
            // Check if any task has priority
            const hasPriority = this.cleanupTasks.some(
                (t) => t.priority !== undefined && t.priority !== 0,
            );

            const tasksToExecute = [...this.cleanupTasks];

            if (hasPriority) {
                // Sort by priority (high to low), then by registration order (LIFO)
                tasksToExecute.sort((a, b) => {
                    const priorityDiff = (b.priority || 0) - (a.priority || 0);
                    if (priorityDiff !== 0) return priorityDiff;
                    // Same priority: maintain LIFO order (reverse registration order)
                    return this.cleanupTasks.indexOf(b) - this.cleanupTasks.indexOf(a);
                });
            } else {
                // No priorities: execute in LIFO order (reverse registration order)
                tasksToExecute.reverse();
            }

            for (const task of tasksToExecute) {
                try {
                    await task.execute();
                    this.executedTasks.push(task.name);
                } catch {
                    console.error(`Failed: ${task.name}`);
                }
            }
        } finally {
            this.isExecuting = false;
            this.cleanupTasks = [];
        }
    }

    /**
     * Runs `fn` and guarantees that all registered tasks are executed afterwards.
     *
     * @template T
     * @param {(cleanup: TestDataCleanup) => Promise<T>} fn - Function body
     * @returns {Promise<T>} Result of `fn`
     */
    async withTransaction<T>(fn: (cleanup: TestDataCleanup) => Promise<T>): Promise<T> {
        try {
            return await fn(this);
        } finally {
            await this.executeAll();
        }
    }

    /** Returns the number of registered (pending) cleanup tasks. */
    getTaskCount(): number {
        return this.cleanupTasks.length;
    }

    /** Returns the names of tasks that were successfully executed. */
    getExecutedTasks(): string[] {
        return [...this.executedTasks];
    }

    /** Clears all pending and executed task records. */
    clear(): void {
        this.cleanupTasks = [];
        this.executedTasks = [];
    }

    /** Returns `true` if cleanup execution is currently in progress. */
    isRunning(): boolean {
        return this.isExecuting;
    }

    /** Generates a plain-text cleanup summary report. */
    getReport(): string {
        return `Test Data Cleanup Report\nRegistered Tasks: ${this.cleanupTasks.length}\nExecuted Tasks: ${this.executedTasks.length}\nExecuted: ${this.executedTasks.join(', ')}`;
    }
}
