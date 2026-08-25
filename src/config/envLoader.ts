/**
 * @fileoverview Environment file loader supporting .env.dev/qa with OS-env precedence.
 *
 * Loads a base `.env` (if present) and an environment-specific `.env.<name>`
 * file, where name is resolved from `TEST_ENV` (preferred) or `ENV`, defaulting
 * to `'dev'`. OS-level environment variables always take precedence.
 *
 * The default is `dev` because dev staging is the only target this suite runs
 * against — a bare `npx playwright test` with no TEST_ENV would otherwise load
 * nothing and leave every spec with an undefined baseURL.
 *
 * Credentials are 1Password secret references (`op://vault/item/field`) in the
 * committed `.env.dev`, resolved here through the 1Password CLI's desktop-app
 * integration, so a fresh clone runs with no credential file at all. CI is
 * untouched: it injects the values as job env, which always wins over a file
 * value, so the reference is never resolved there. A literal for the same key in
 * the gitignored `.env` also wins over a reference — the offline escape hatch.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const OP_REF_PREFIX = 'op://';

/** Result of loading environment files. */
export interface EnvLoadResult {
    envName: string;
    loadedFiles: string[];
    missingFiles: string[];
}

/** Parses a dotenv file if it exists on disk. */
function parseIfExists(filePath: string): Record<string, string> {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf-8');
    return dotenv.parse(content);
}

/**
 * Replaces `op://` references among the keys the files set with the secret the
 * 1Password CLI returns. Runs once per process: Playwright workers inherit the
 * runner's already-resolved environment, so they never spawn `op`. Fails loudly —
 * an unresolved reference would otherwise reach the login form as a literal
 * `op://…` string and surface as an indistinguishable "invalid credentials".
 */
function resolveOnePasswordRefs(keys: Iterable<string>, baseVars: Record<string, string>): void {
    for (const key of keys) {
        const value = process.env[key];
        if (!value || !value.startsWith(OP_REF_PREFIX)) continue;

        const literal = baseVars[key];
        if (literal !== undefined && !literal.startsWith(OP_REF_PREFIX)) {
            process.env[key] = literal;
            continue;
        }

        const result = spawnSync('op', ['read', '--no-newline', value], {
            encoding: 'utf-8',
            windowsHide: true,
        });
        if (result.error || result.status !== 0 || !result.stdout) {
            const detail = result.error ? result.error.message : (result.stderr ?? '').trim();
            throw new Error(
                `[envLoader] ${key} is a 1Password reference (${value}) that could not be resolved` +
                    (detail ? `: ${detail}` : '. op read returned nothing') +
                    '. Install the 1Password CLI and enable "Integrate with 1Password CLI" in the ' +
                    `desktop app (docs/ENVIRONMENTS.md). To bypass, set ${key} directly in the ` +
                    'environment or as a literal in the gitignored .env.',
            );
        }
        process.env[key] = result.stdout;
    }
}

/** Resolves the environment name from an explicit value, `TEST_ENV`, or `ENV`. */
function resolveEnvName(explicitEnv?: string): string {
    const raw =
        (explicitEnv || process.env.TEST_ENV || process.env.ENV || 'dev').toString().toLowerCase();
    return raw;
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

    // Dotfile naming at the repo root — the Node/dotenv convention: `.env` for
    // personal overrides (gitignored) and `.env.<name>` per environment. Tooling
    // (dotenv, editors, `docker --env-file`, most CI actions) looks for `.env` in
    // the working directory, so this is the one group of config files that stays
    // at the root rather than moving into a folder. See docs/STRUCTURE.md.
    const basePath = path.resolve(cwd, baseFile);
    const envPath = path.resolve(cwd, `.env.${envName}`);

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
    resolveOnePasswordRefs(keysSetByFiles, baseVars);

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
