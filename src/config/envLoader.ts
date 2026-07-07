/**
 * @fileoverview Environment file loader supporting env.qe/dev/prod/stag with OS-env precedence.
 *
 * Loads a base `.env` (if present) and an environment-specific `env.<name>` file,
 * where name is resolved from `TEST_ENV` (preferred) or `ENV`. OS-level environment
 * variables always take precedence.
 *
 * @module config/envLoader
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { loadEnvFiles } from '@config/envLoader';
 *
 * // Load env.qe (default)
 * const result = loadEnvFiles();
 *
 * // Load env.dev explicitly
 * const devResult = loadEnvFiles({ envName: 'dev' });
 * ```
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

/**
 * Result of loading environment files.
 *
 * @interface EnvLoadResult
 * @property {string} envName - Resolved environment name (e.g. `'qe'`, `'dev'`)
 * @property {string[]} loadedFiles - Absolute paths of files that were loaded
 * @property {string[]} missingFiles - Absolute paths of files that were not found
 */
export interface EnvLoadResult {
    envName: string;
    loadedFiles: string[];
    missingFiles: string[];
}

/**
 * Parses a dotenv file if it exists on disk.
 *
 * @private
 * @param {string} filePath - Absolute path to the env file
 * @returns {Record<string, string>} Parsed key/value pairs, or empty object if missing
 */
function parseIfExists(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf-8');
    return dotenv.parse(content);
}

/**
 * Resolves the environment name from an explicit value, `TEST_ENV`, or `ENV`.
 *
 * @private
 * @param {string} [explicitEnv] - Explicit environment name override
 * @returns {string} Normalised environment name (defaults to `'qe'`)
 */
function resolveEnvName(explicitEnv?: string): string {
    const raw =
        (explicitEnv || process.env.TEST_ENV || process.env.ENV || 'qe').toString().toLowerCase();
    return raw === 'staging' ? 'stag' : raw;
}

/**
 * Loads environment files into process.env with the following precedence:
 * 1) Existing OS/CI env vars (never overridden)
 * 2) env.<name> file
 * 3) .env file
 */
export function loadEnvFiles(options?: {
    cwd?: string;
    envName?: string;
    baseFileName?: string;
    warnOnMissing?: boolean;
}): EnvLoadResult {
    const cwd = options?.cwd || process.cwd();
    const envName = resolveEnvName(options?.envName);
    const baseFile = options?.baseFileName || '.env';
    const warnOnMissing = options?.warnOnMissing !== false;

    const basePath = path.resolve(cwd, baseFile);
    const envPath = path.resolve(cwd, `env.${envName}`);

    const loadedFiles: string[] = [];
    const missingFiles: string[] = [];
    const baseVars = parseIfExists(basePath);
    const envVars = parseIfExists(envPath);

    const keysSetByFiles = new Set<string>();

    const applyVars = (vars: Record<string, string>, allowOverrideOfFileKeys: boolean) => {
        for (const [key, value] of Object.entries(vars)) {
            if (
                process.env[key] === undefined ||
                (allowOverrideOfFileKeys && keysSetByFiles.has(key))
            ) {
                process.env[key] = value;
                keysSetByFiles.add(key);
            }
        }
    };

    applyVars(baseVars, false);
    applyVars(envVars, true);

    if (Object.keys(baseVars).length > 0) loadedFiles.push(basePath);
    if (Object.keys(envVars).length > 0) loadedFiles.push(envPath);
    if (Object.keys(baseVars).length === 0) missingFiles.push(basePath);
    if (Object.keys(envVars).length === 0) missingFiles.push(envPath);

    if (warnOnMissing && missingFiles.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
            `[envLoader] No env file found for: ${missingFiles.join(', ')}. ` +
                `Using existing process.env values only.`,
        );
    }

    return { envName, loadedFiles, missingFiles };
}
