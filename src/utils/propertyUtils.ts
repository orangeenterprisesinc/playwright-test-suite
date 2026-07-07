/**
 * @fileoverview Configuration property loading and lookup utilities.
 *
 * Reads `.env` and Java-style `.properties` files into an in-memory map,
 * falling back to `process.env` when a key is not found in files.
 *
 * @module utils/propertyUtils
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { getPropertyValue, hasProperty } from '@utils/propertyUtils';
 *
 * const baseUrl = getPropertyValue('APP_URL', 'http://localhost:3000');
 * if (hasProperty('API_KEY')) { ... }
 * ```
 */
import fs from 'fs';
import path from 'path';
import { Logger } from './logger';
import { PropertyFileUsageException } from '../exceptions/frameworkExceptions';
import { FrameworkConstants } from '../constants/frameworkConstants';

const logger = new Logger('PropertyUtils');

/** @private In-memory cache of all loaded configuration key-value pairs (lower-cased keys). */
const CONFIG_MAP = new Map<string, string>();

/** @private Whether the configuration has been loaded at least once. */
let loaded = false;

/**
 * Parses a Java-style `.properties` file (`key=value` or `key:value`).
 * Lines starting with `#` or `!` are treated as comments.
 *
 * @param {string} filePath - Path to the properties file
 * @returns {Map<string, string>} Parsed key-value pairs
 * @private
 */
function parsePropertiesFile(filePath: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!fs.existsSync(filePath)) return map;

    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
        const separatorIndex = trimmed.search(/[=:]/);
        if (separatorIndex < 0) continue;
        const key = trimmed.substring(0, separatorIndex).trim();
        const value = trimmed.substring(separatorIndex + 1).trim();
        map.set(key, value);
    }
    return map;
}

/**
 * Parses a `.env` file, stripping optional surrounding quotes from values.
 *
 * @param {string} filePath - Path to the `.env` file
 * @returns {Map<string, string>} Parsed key-value pairs
 * @private
 */
function parseDotEnvFile(filePath: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!fs.existsSync(filePath)) return map;

    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex < 0) continue;
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        map.set(key, value);
    }
    return map;
}

/**
 * Lazily loads configuration from `.env` and `.properties` files into {@link CONFIG_MAP}.
 * Subsequent calls are no-ops until {@link reloadProperties} is invoked.
 *
 * @private
 */
function loadConfig(): void {
    if (loaded) return;

    const envFile = FrameworkConstants.ENV_FILE;
    if (fs.existsSync(envFile)) {
        const entries = parseDotEnvFile(envFile);
        entries.forEach((v, k) => CONFIG_MAP.set(k.toLowerCase(), v));
        logger.info(`Loaded ${entries.size} entries from ${envFile}`);
    }

    const propFiles = [
        path.join(FrameworkConstants.PROJECT_ROOT, 'config.properties'),
        path.join(FrameworkConstants.PROJECT_ROOT, 'src', 'config', 'config.properties'),
    ];
    for (const propFile of propFiles) {
        if (fs.existsSync(propFile)) {
            const entries = parsePropertiesFile(propFile);
            entries.forEach((v, k) => CONFIG_MAP.set(k.toLowerCase(), v));
            logger.info(`Loaded ${entries.size} entries from ${propFile}`);
        }
    }

    loaded = true;
}


/**
 * Retrieves a configuration property by key, searching (in order):
 * 1. Loaded config files (case-insensitive)
 * 2. `process.env[key]`
 * 3. `process.env[KEY]` (upper-cased)
 *
 * @param {string} key - Property key
 * @param {string} [fallback] - Value returned when the key is not found
 * @returns {string} Resolved property value
 * @throws {PropertyFileUsageException} When the key is missing and no fallback is given
 */
export function getPropertyValue(key: string, fallback?: string): string {
    loadConfig();
    const value =
        CONFIG_MAP.get(key.toLowerCase()) ?? process.env[key] ?? process.env[key.toUpperCase()];
    if (value !== undefined) return value;
    if (fallback !== undefined) return fallback;
    throw new PropertyFileUsageException(
        `Property "${key}" not found in config files or environment`,
    );
}

/**
 * Checks whether a property key exists in config files or `process.env`.
 *
 * @param {string} key - Property key to look up
 * @returns {boolean} `true` if the key is present
 */
export function hasProperty(key: string): boolean {
    loadConfig();
    return (
        CONFIG_MAP.has(key.toLowerCase()) ||
        process.env[key] !== undefined ||
        process.env[key.toUpperCase()] !== undefined
    );
}

/**
 * Returns a read-only view of all loaded properties.
 *
 * @returns {ReadonlyMap<string, string>} All key-value pairs
 */
export function getAllProperties(): ReadonlyMap<string, string> {
    loadConfig();
    return CONFIG_MAP;
}

/**
 * Clears the in-memory cache and re-reads all configuration files.
 */
export function reloadProperties(): void {
    CONFIG_MAP.clear();
    loaded = false;
    loadConfig();
}
