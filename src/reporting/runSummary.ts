/**
 * @fileoverview Shared run-summary collector for the custom reporters
 * (email, Slack, ELK dashboard).
 *
 * Each reporter used to maintain its own `records` map + `counts()` + metadata
 * assembly, which drifted apart over time. This module centralises all of it:
 * a reporter creates a {@link RunSummaryCollector}, forwards `onBegin` /
 * `onTestEnd` to it, and calls {@link RunSummaryCollector.build} in `onEnd` to
 * get one fully-populated, render-agnostic {@link RunSummary}. Each reporter is
 * then only responsible for turning that object into HTML / Slack blocks / JSON.
 *
 * @module reporting/runSummary
 */
import type { FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import path from 'node:path';
import { ExecutionContext } from '../context/executionContext';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';

/** Final state of one test, keyed by test id (retries overwrite earlier entries). */
export interface TestRecord {
    /** Human-readable title path (describe › … › test), without project/file prefix. */
    title: string;
    /** Repo-relative spec file path. */
    spec: string;
    /** Playwright project name (e.g. `chromium`). */
    project: string;
    outcome: 'expected' | 'unexpected' | 'flaky' | 'skipped';
    /** First line of the failure message, if any. */
    error?: string;
    durationMs: number;
}

/** A coloured environment badge (e.g. `DEV`, `CI`) for report headers. */
export interface EnvBadge {
    label: string;
    /** Hex colour for rich renderers (email); Slack renders the label as text. */
    color: string;
}

/** Fully-assembled, render-agnostic summary of a whole test run. */
export interface RunSummary {
    status: FullResult['status'];
    passed: number;
    failed: number;
    flaky: number;
    skipped: number;
    total: number;
    /** Percentage of executed (non-skipped) tests that passed, 0–100, rounded. */
    passRate: number;
    durationMs: number;
    /** Human-friendly duration, e.g. `1m 23s`. */
    durationText: string;
    /** Resolved `TEST_ENV` (e.g. `local`, `dev`, `qa`). */
    env: string;
    isCI: boolean;
    /** Env + CI badges for the report header. */
    badges: EnvBadge[];
    branch: string;
    commit: string;
    /** Friendly trigger, e.g. `push`, `scheduled`, `manual`, `local run`. */
    trigger: string;
    /** Distinct Playwright project names that ran, comma-joined. */
    projects: string;
    nodeVersion: string;
    /** Run finish time as an ISO string. */
    finishedAt: string;
    /** CI run URL, or empty string when not running in CI. */
    runUrl: string;
    /** Only the unexpected (failed) records, for the failures section. */
    failures: TestRecord[];
    /** Every test record. */
    records: TestRecord[];
}

/** Env → header-badge colour. Anything unmapped falls back to slate grey. */
const ENV_COLORS: Record<string, string> = {
    local: '#3b82f6', // blue
    dev: '#f59e0b', // amber
    qa: '#8b5cf6', // violet
    stag: '#14b8a6', // teal
    staging: '#14b8a6',
    prod: '#ef4444', // red
    production: '#ef4444',
};

const CI_BADGE_COLOR = '#6b7280'; // slate grey

/** Green when the run passed, red otherwise — used for banners / colour bars. */
export function statusColor(status: FullResult['status']): string {
    return status === 'passed' ? '#22c55e' : '#ef4444';
}

/** Formats a millisecond duration as `Xm Ys` (or `Ys` under a minute). */
export function formatDuration(durationMs: number): string {
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function buildBadges(env: string, isCI: boolean): EnvBadge[] {
    const badges: EnvBadge[] = [
        { label: env.toUpperCase(), color: ENV_COLORS[env.toLowerCase()] ?? CI_BADGE_COLOR },
    ];
    // A distinct CI badge, so "dev run on a laptop" reads differently from
    // "dev run in CI" — the env badge alone can't tell them apart.
    if (isCI) badges.push({ label: 'CI', color: CI_BADGE_COLOR });
    return badges;
}

function resolveTrigger(): string {
    const event = process.env.GITHUB_EVENT_NAME;
    if (event) {
        switch (event) {
            case 'push':
                return 'push';
            case 'schedule':
                return 'scheduled';
            case 'workflow_dispatch':
                return 'manual';
            case 'repository_dispatch':
                return 'external dispatch';
            default:
                return event;
        }
    }
    return process.env.CI ? 'ci' : 'local run';
}

function resolveRunUrl(): string {
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
    return GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
        ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
        : '';
}

/**
 * Accumulates per-test outcomes across a run and assembles a {@link RunSummary}.
 * Instantiate one per reporter; forward `onBegin`/`onTestEnd` and call
 * {@link build} in `onEnd`.
 */
export class RunSummaryCollector {
    private readonly records = new Map<string, TestRecord>();
    private startTime = 0;

    /** Call from the reporter's `onBegin`. */
    onBegin(): void {
        this.startTime = Date.now();
    }

    /** Call from the reporter's `onTestEnd`; later retries overwrite earlier entries. */
    recordTest(test: TestCase, result: TestResult): void {
        // titlePath() → ['', project, file, ...describes, test]. Drop the first
        // three to get a clean "describe › … › test" title, keep project/file
        // separately.
        const titlePath = test.titlePath();
        const title = titlePath.slice(3).join(' › ') || test.title;
        this.records.set(test.id, {
            title,
            project: titlePath[1] ?? '',
            spec: path.relative(process.cwd(), test.location.file),
            outcome: test.outcome(),
            error: result.error?.message?.split('\n')[0],
            durationMs: result.duration,
        });
    }

    /** Assembles the final, render-agnostic summary. Call from `onEnd`. */
    build(result: FullResult): RunSummary {
        let passed = 0;
        let failed = 0;
        let flaky = 0;
        let skipped = 0;
        for (const r of this.records.values()) {
            if (r.outcome === 'expected') passed++;
            else if (r.outcome === 'unexpected') failed++;
            else if (r.outcome === 'flaky') flaky++;
            else skipped++;
        }

        const total = passed + failed + flaky + skipped;
        const executed = passed + failed + flaky;
        const passRate = executed > 0 ? Math.round(((passed + flaky) / executed) * 100) : 0;

        const ctx = ExecutionContext.snapshot();
        const env = getConfigValue(ConfigProperties.TEST_ENV, 'local');
        const isCI = !!process.env.CI;
        const durationMs = Date.now() - this.startTime;

        const records = [...this.records.values()];

        return {
            status: result.status,
            passed,
            failed,
            flaky,
            skipped,
            total,
            passRate,
            durationMs,
            durationText: formatDuration(durationMs),
            env,
            isCI,
            badges: buildBadges(env, isCI),
            branch: ctx.branch,
            commit: ctx.commit,
            trigger: resolveTrigger(),
            projects: [...new Set(records.map((r) => r.project).filter(Boolean))].join(', ') || 'n/a',
            nodeVersion: process.version,
            finishedAt: new Date().toISOString(),
            runUrl: resolveRunUrl(),
            failures: records.filter((r) => r.outcome === 'unexpected'),
            records,
        };
    }
}
