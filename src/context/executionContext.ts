/**
 * @fileoverview Singleton execution context that tracks run-level metadata for each test session.
 *
 * Captures the run ID, service name, CI/CD pipeline information, branch name,
 * environment, and start time. The context can be serialised to JSON for sharing
 * across processes (e.g., global setup → workers) and hydrated back.
 *
 * @module context/executionContext
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { ExecutionContext } from '../context/executionContext';
 *
 * ExecutionContext.init();
 * console.log(ExecutionContext.runId);       // UUID
 * console.log(ExecutionContext.triggeredBy); // 'github-actions' | 'manual-run' | ...
 * ```
 */
import {randomUUID} from 'crypto';
import {FrameworkConstants} from '../constants/frameworkConstants';

/**
 * Immutable snapshot of the execution context at a point in time.
 *
 * @interface ExecutionContextSnapshot
 * @property {string} runId - Unique identifier for the test run (UUID)
 * @property {string} serviceName - Name of the service under test
 * @property {string} buildVersion - CI pipeline/build identifier (empty for local runs)
 * @property {('gitlab-ci' | 'github-actions' | 'jenkins' | 'manual-run')} triggeredBy - Source that triggered the run
 * @property {string} branch - Git branch name
 * @property {string} environment - Deployment environment (e.g., `'dev'`, `'stag'`)
 * @property {Date} startTime - Timestamp when the test run started
 */
export interface ExecutionContextSnapshot {
    runId: string;
    serviceName: string;
    buildVersion: string;
    triggeredBy: 'gitlab-ci' | 'github-actions' | 'jenkins' | 'manual-run';
    branch: string;
    environment: string;
    startTime: Date;
}

/**
 * Manages run-level execution metadata as a singleton.
 *
 * Automatically detects CI/CD environment from well-known env vars
 * (`CI_PIPELINE_ID`, `GITHUB_RUN_ID`, `BUILD_NUMBER`). Supports serialization
 * for cross-process sharing (e.g., Playwright global-setup → test workers).
 *
 * @class ExecutionContextManager
 * @private — Use the exported {@link ExecutionContext} singleton instead.
 */
class ExecutionContextManager {
    /** @private Unique run identifier (UUID). */
    private _runId: string = '';

    /** Unique test run identifier (UUID). */
    get runId(): string {
        return this._runId;
    }

    set runId(value: string) {
        this._runId = value;
    }

    /** @private Service name, defaulting from {@link FrameworkConstants.SERVICE_NAME}. */
    private _serviceName: string = FrameworkConstants.SERVICE_NAME;

    /** Name of the service under test. */
    get serviceName(): string {
        return this._serviceName;
    }

    set serviceName(value: string) {
        this._serviceName = value;
    }

    /** @private CI pipeline or build version. */
    private _buildVersion: string = '';

    /** CI pipeline or build version identifier. */
    get buildVersion(): string {
        return this._buildVersion;
    }

    set buildVersion(v: string) {
        this._buildVersion = v;
    }

    /** @private CI trigger source. */
    private _triggeredBy: ExecutionContextSnapshot['triggeredBy'] = 'manual-run';

    /** The CI/CD system or trigger that initiated this run. */
    get triggeredBy(): ExecutionContextSnapshot['triggeredBy'] {
        return this._triggeredBy;
    }

    set triggeredBy(value: ExecutionContextSnapshot['triggeredBy']) {
        this._triggeredBy = value;
    }

    /** @private Run start timestamp. */
    private _startTime: Date = new Date();

    /** Timestamp when the current test run started. */
    get startTime(): Date {
        return this._startTime;
    }

    /**
     * Generates a UUID for `runId` if one hasn't been set yet.
     * Safe to call multiple times — only the first call generates the ID.
     */
    initRunIdIfAbsent(): void {
        if (!this._runId) {
            this._runId = randomUUID();
        }
    }

    /**
     * Auto-detects the CI/CD environment from well-known environment variables.
     *
     * Sets {@link triggeredBy} and {@link buildVersion} based on which CI env vars are present:
     * - `CI_PIPELINE_ID` → GitLab CI
     * - `GITHUB_RUN_ID` → GitHub Actions
     * - `BUILD_NUMBER` → Jenkins
     * - None → `'manual-run'`
     */
    detectCIEnvironment(): void {
        const pipelineId =
            process.env.CI_PIPELINE_ID || // GitLab
            process.env.GITHUB_RUN_ID || // GitHub Actions
            process.env.BUILD_NUMBER || // Jenkins
            '';

        if (process.env.CI_PIPELINE_ID) {
            this._triggeredBy = 'gitlab-ci';
        } else if (process.env.GITHUB_RUN_ID) {
            this._triggeredBy = 'github-actions';
        } else if (process.env.BUILD_NUMBER) {
            this._triggeredBy = 'jenkins';
        } else {
            this._triggeredBy = 'manual-run';
        }

        this._buildVersion = pipelineId;
    }

    /**
     * Initializes the execution context: generates a run ID, detects CI, and records the start time.
     * Should be called once in `globalSetup`.
     */
    init(): void {
        this.initRunIdIfAbsent();
        this.detectCIEnvironment();
        this._startTime = new Date();
    }

    /**
     * Serialises the context to a JSON string for cross-process sharing.
     * @returns {string} JSON representation of the current {@link ExecutionContextSnapshot}
     */
    serialise(): string {
        return JSON.stringify(this.snapshot());
    }

    /**
     * Restores the context from a JSON string (typically received in a worker process).
     * @param {string} json - JSON string produced by {@link serialise}
     */
    hydrate(json: string): void {
        const data: ExecutionContextSnapshot = JSON.parse(json);
        this._runId = data.runId;
        this._serviceName = data.serviceName;
        this._buildVersion = data.buildVersion;
        this._triggeredBy = data.triggeredBy;
        this._startTime = new Date(data.startTime);
    }

    /**
     * Creates an immutable snapshot of the current execution context.
     * @returns {ExecutionContextSnapshot} Current context state
     */
    snapshot(): ExecutionContextSnapshot {
        return {
            runId: this._runId,
            serviceName: this._serviceName,
            buildVersion: this._buildVersion,
            triggeredBy: this._triggeredBy,
            branch: FrameworkConstants.BRANCH_NAME,
            environment: FrameworkConstants.ENVIRONMENT,
            startTime: this._startTime,
        };
    }
}

/**
 * Pre-initialized singleton instance of the execution context manager.
 *
 * @const {ExecutionContextManager}
 *
 * @example
 * ```typescript
 * ExecutionContext.init();
 * const snap = ExecutionContext.snapshot();
 * console.log(snap.runId, snap.triggeredBy);
 * ```
 */
export const ExecutionContext = new ExecutionContextManager();


