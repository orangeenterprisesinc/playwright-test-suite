/**
 * @fileoverview Framework-wide path constants.
 * @module core/frameworkConstants
 */
import path from 'node:path';

export const FrameworkConstants = Object.freeze({
    /** Path to the optional runner list JSON that gates which tests are active (see listeners/methodInterceptor.ts). */
    RUNNER_LIST_PATH: path.join(process.cwd(), 'src', 'data', 'runnerList.json'),
});
