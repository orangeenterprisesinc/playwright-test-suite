/**
 * @fileoverview Per-worker iteration tracking and a lightweight "current
 * test" pointer.
 *
 * {@link CurrentTestTracker} lets code that doesn't have `testInfo` in scope
 * (decorators, loggers, reporters) look up which test is executing right
 * now. Safe as a singleton because Playwright workers run one test at a time
 * — same assumption as {@link ../context/testMetrics}.
 *
 * @module context/testRunContext
 */
export interface CurrentTest {
    title: string;
    file: string;
    retry: number;
}

class CurrentTestTrackerImpl {
    private current: CurrentTest | null = null;

    /** Records the test that just started. Call from `onTestStart`. */
    set(test: CurrentTest): void {
        this.current = test;
    }

    /** The currently-executing test, or `null` between tests. */
    get(): CurrentTest | null {
        return this.current;
    }

    /** Clears the pointer. Call from `onTestEnd`. */
    clear(): void {
        this.current = null;
    }
}

export const CurrentTestTracker = new CurrentTestTrackerImpl();

class TestRunContextManager {
    private iteration = 0;

    /** Sets the current test's retry/iteration number. Call from `onTestStart`. */
    setIteration(retryCount: number): void {
        this.iteration = retryCount;
    }

    /** The current test's retry/iteration number (0 on the first attempt). */
    getIteration(): number {
        return this.iteration;
    }
}

export const TestRunContext = new TestRunContextManager();
