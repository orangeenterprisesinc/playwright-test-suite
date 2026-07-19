/**
 * @fileoverview Run-level execution metadata — created once per
 * `npx playwright test` invocation (module-level singleton), as opposed to
 * {@link ../context/testMetrics} which tracks the currently-executing test.
 *
 * @module context/executionContext
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';

export interface ExecutionContextSnapshot {
    runId: string;
    triggeredBy: 'github-actions' | 'gitlab-ci' | 'manual-run';
    branch: string;
    commit: string;
    environment: string;
}

function detectTrigger(): ExecutionContextSnapshot['triggeredBy'] {
    if (process.env.GITHUB_ACTIONS) return 'github-actions';
    if (process.env.GITLAB_CI) return 'gitlab-ci';
    return 'manual-run';
}

function detectBranch(): string {
    if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
    if (process.env.CI_COMMIT_REF_NAME) return process.env.CI_COMMIT_REF_NAME;
    try {
        return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf-8' }).trim();
    } catch {
        return 'unknown';
    }
}

function detectCommit(): string {
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
    if (process.env.CI_COMMIT_SHA) return process.env.CI_COMMIT_SHA.slice(0, 7);
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
    } catch {
        return 'unknown';
    }
}

class ExecutionContextManager {
    private readonly runId = randomUUID();
    private readonly triggeredBy = detectTrigger();
    private readonly branch = detectBranch();
    private readonly commit = detectCommit();

    /** Immutable snapshot of this run's metadata. */
    snapshot(): ExecutionContextSnapshot {
        return {
            runId: this.runId,
            triggeredBy: this.triggeredBy,
            branch: this.branch,
            commit: this.commit,
            environment: getConfigValue(ConfigProperties.TEST_ENV, 'local'),
        };
    }
}

/**
 * Singleton run-level context. Safe across workers since `runId`/`triggeredBy`/
 * `branch`/`commit` are constant for the whole run — only `environment` is read live.
 *
 * @example
 * ```typescript
 * const ctx = ExecutionContext.snapshot();
 * console.log(ctx.runId, ctx.triggeredBy, ctx.branch, ctx.commit, ctx.environment);
 * ```
 */
export const ExecutionContext = new ExecutionContextManager();
