/**
 * @fileoverview Test dependency graph management.
 *
 * {@link TestDependency} lets tests declare prerequisite relationships,
 * validates for cycles, computes a valid execution order (topological sort),
 * and tracks pass/fail results to determine which tests are ready or blocked.
 *
 * @module utils/testDependency
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { TestDependency } from '@utils/testDependency';
 *
 * const deps = new TestDependency();
 * deps.registerDependency('checkout', ['login', 'add-to-cart']);
 * deps.registerDependency('login', []);
 * deps.registerDependency('add-to-cart', ['login']);
 * console.log(deps.getExecutionOrder()); // ['login', 'add-to-cart', 'checkout']
 * ```
 */

/**
 * A node in the dependency graph representing a single test.
 *
 * @interface DependencyNode
 * @property {string} testName - Name of the test
 * @property {string[]} dependencies - Tests that must pass before this one
 * @property {'pending'|'running'|'passed'|'failed'} status - Current status
 * @property {Error} [error] - Error if the test failed
 */
export interface DependencyNode {
    testName: string;
    dependencies: string[];
    status: 'pending' | 'running' | 'passed' | 'failed';
    error?: Error;
}

/**
 * Snapshot of the entire dependency graph with resolved execution order.
 *
 * @interface DependencyGraph
 * @property {Map<string, DependencyNode>} nodes - All registered nodes
 * @property {string[]} executionOrder - Topologically sorted test names
 */
export interface DependencyGraph {
    nodes: Map<string, DependencyNode>;
    executionOrder: string[];
}

/**
 * Manages test dependency relationships, cycle validation, and execution ordering.
 *
 * @class TestDependency
 */
export class TestDependency {
    /** @private Map of test name → dependency names */
    private dependencies: Map<string, string[]> = new Map();
    /** @private Map of test name → pass/fail result */
    private executionResults: Map<string, 'passed' | 'failed'> = new Map();

    /**
     * Registers a test with its prerequisite dependencies.
     *
     * @param {string} testName - Name of the test
     * @param {string[]} [dependsOn=[]] - Tests that must pass first
     */
    registerDependency(testName: string, dependsOn: string[] = []): void {
        this.dependencies.set(testName, dependsOn);
    }

    /**
     * Records a test execution result.
     * @param {string} testName - Name of the test
     * @param {boolean} passed - Whether the test passed
     */
    recordResult(testName: string, passed: boolean): void {
        this.executionResults.set(testName, passed ? 'passed' : 'failed');
    }

    /**
     * Checks whether all prerequisites for a test have passed.
     * @param {string} testName - Name of the test
     * @returns {boolean} `true` if all dependencies are satisfied
     */
    areDependenciesMet(testName: string): boolean {
        const deps = this.dependencies.get(testName) || [];
        return deps.every((dep) => this.executionResults.get(dep) === 'passed');
    }

    /** Returns tests whose dependencies are all met and which have not yet run. */
    getReadyTests(): string[] {
        const ready: string[] = [];
        for (const [testName] of this.dependencies) {
            if (!this.executionResults.has(testName) && this.areDependenciesMet(testName))
                ready.push(testName);
        }
        return ready;
    }

    /** Returns tests that have not run and whose dependencies are **not** met. */
    getBlockedTests(): string[] {
        const blocked: string[] = [];
        for (const [testName] of this.dependencies) {
            if (!this.executionResults.has(testName) && !this.areDependenciesMet(testName))
                blocked.push(testName);
        }
        return blocked;
    }

    /**
     * Validates that the dependency graph contains no cycles.
     * @returns {boolean} `true` if the graph is acyclic
     */
    validateNoCycles(): boolean {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const hasCycle = (node: string): boolean => {
            visited.add(node);
            recursionStack.add(node);
            const deps = this.dependencies.get(node) || [];
            for (const dep of deps) {
                if (!visited.has(dep)) {
                    if (hasCycle(dep)) return true;
                } else if (recursionStack.has(dep)) return true;
            }
            recursionStack.delete(node);
            return false;
        };
        for (const [testName] of this.dependencies) {
            if (!visited.has(testName)) if (hasCycle(testName)) return false;
        }
        return true;
    }

    /**
     * Returns a topologically sorted execution order.
     * @returns {string[]} Test names in valid execution order
     * @throws {Error} If a circular dependency is detected
     */
    getExecutionOrder(): string[] {
        if (!this.validateNoCycles()) throw new Error('Circular dependency detected');
        const visited = new Set<string>();
        const order: string[] = [];
        const visit = (node: string) => {
            if (visited.has(node)) return;
            visited.add(node);
            const deps = this.dependencies.get(node) || [];
            for (const dep of deps) visit(dep);
            order.push(node);
        };
        for (const [testName] of this.dependencies) visit(testName);
        return order;
    }

    /** Returns a snapshot of the full dependency graph. */
    getDependencyGraph(): DependencyGraph {
        const nodes = new Map<string, DependencyNode>();
        for (const [testName, deps] of this.dependencies) {
            nodes.set(testName, {
                testName,
                dependencies: deps,
                status: this.executionResults.has(testName)
                    ? this.executionResults.get(testName) === 'passed'
                        ? 'passed'
                        : 'failed'
                    : 'pending',
            });
        }
        return { nodes, executionOrder: this.getExecutionOrder() };
    }

    /** Generates a human-readable dependency and execution order report. */
    generateReport(): string {
        const graph = this.getDependencyGraph();
        let report = `Test Dependency Report\nTotal Tests: ${graph.nodes.size}\nExecution Order:\n`;
        graph.executionOrder.forEach((test, index) => {
            const node = graph.nodes.get(test)!;
            report += `${index + 1}. ${test} (${node.status})\n`;
        });
        return report;
    }

    /** Clears all registered dependencies and execution results. */
    clear(): void {
        this.dependencies.clear();
        this.executionResults.clear();
    }
}
