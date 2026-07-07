/**
 * @fileoverview Singleton environment manager for runtime environment switching and validation.
 *
 * Provides the {@link EnvironmentManager} singleton that manages environment configurations,
 * supports runtime environment switching with validation, custom config overlays, and
 * change-listener subscriptions.
 *
 * @module config/environmentManager
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { environmentManager } from '../config/environmentManager';
 *
 * // Get current config
 * const config = environmentManager.getConfig();
 * console.log(config.appUrl);
 *
 * // Switch environment at runtime
 * environmentManager.switchEnvironment('stag');
 *
 * // Listen for changes
 * const unsubscribe = environmentManager.onEnvironmentChange((env) => {
 *   console.log(`Switched to ${env}`);
 * });
 * ```
 */
import type {Environment, EnvironmentConfig} from '../types';
import {getEnvironmentConfig} from './environments';

/**
 * Extended environment configuration that allows arbitrary custom key-value pairs
 * alongside the standard {@link EnvironmentConfig} properties.
 *
 * @interface ExtendedEnvironmentConfig
 * @extends {EnvironmentConfig}
 */
export interface ExtendedEnvironmentConfig extends EnvironmentConfig {
    [key: string]: string | number | boolean | undefined;
}

/**
 * Result of environment validation containing validity status and any errors/warnings.
 *
 * @interface ValidationResult
 * @property {boolean} isValid - `true` if the environment passed all validation checks
 * @property {string[]} errors - List of validation error messages (blocks switching)
 * @property {string[]} warnings - List of non-blocking warning messages
 */
export interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Singleton manager for environment configurations, runtime switching, and validation.
 *
 * Initialized with all known environments on first access. Supports:
 * - Getting/switching the active environment
 * - Validating environment configs (URL format, required fields)
 * - Custom config overlays
 * - Change-listener subscriptions
 *
 * @class EnvironmentManager
 * @example
 * ```typescript
 * const manager = EnvironmentManager.getInstance();
 * manager.switchEnvironment('dev');
 * const config = manager.getConfig();
 * ```
 */
export class EnvironmentManager {
    private static instance: EnvironmentManager;
    private currentEnvironment: Environment = 'qe';
    private environmentConfigs: Map<Environment, ExtendedEnvironmentConfig> = new Map();
    private customConfigs: Map<string, unknown> = new Map();
    private listeners: ((env: Environment) => void)[] = [];

    private constructor() {
        this.initializeEnvironments();
    }

    /**
     * Returns the singleton instance of EnvironmentManager.
     * Creates the instance on first call (lazy initialization).
     *
     * @returns {EnvironmentManager} The singleton instance
     */
    static getInstance(): EnvironmentManager {
        if (!EnvironmentManager.instance) {
            EnvironmentManager.instance = new EnvironmentManager();
        }
        return EnvironmentManager.instance;
    }

    /**
     * Returns the currently active environment identifier.
     * @returns {Environment} Current environment (e.g., `'dev'`, `'qe'`, `'stag'`, `'prod'`)
     */
    getCurrentEnvironment(): Environment {
        return this.currentEnvironment;
    }

    /**
     * Returns the configuration for the current environment, merged with any custom overrides.
     *
     * @returns {ExtendedEnvironmentConfig} Merged configuration object
     * @throws {Error} If no configuration is found for the current environment
     */
    getConfig(): ExtendedEnvironmentConfig {
        const config = this.environmentConfigs.get(this.currentEnvironment);
        if (!config) {
            throw new Error(`Configuration not found for environment: ${this.currentEnvironment}`);
        }
        const customEntries = Object.fromEntries(this.customConfigs) as Record<string, string | number | boolean | undefined>;
        return {...config, ...customEntries};
    }

    /**
     * Returns the configuration for a specific environment (without custom overrides).
     *
     * @param {Environment} env - The target environment
     * @returns {ExtendedEnvironmentConfig} A shallow copy of the environment configuration
     * @throws {Error} If no configuration exists for the given environment
     */
    getConfigForEnvironment(env: Environment): ExtendedEnvironmentConfig {
        const config = this.environmentConfigs.get(env);
        if (!config) {
            throw new Error(`Configuration not found for environment: ${env}`);
        }
        return {...config};
    }

    /**
     * Switches the active environment after validation.
     *
     * Updates the internal state, sets `process.env.TEST_ENV`, and notifies all
     * registered change listeners.
     *
     * @param {Environment} env - The environment to switch to
     * @throws {Error} If the environment fails validation
     *
     * @example
     * ```typescript
     * environmentManager.switchEnvironment('stag');
     * ```
     */
    switchEnvironment(env: Environment): void {
        const validation = this.validateEnvironment(env);
        if (!validation.isValid) {
            throw new Error(`Invalid environment: ${validation.errors.join(', ')}`);
        }
        this.currentEnvironment = env;
        process.env.TEST_ENV = env;
        this.notifyListeners(env);
    }

    /**
     * Validates the configuration for a given environment.
     *
     * Checks that:
     * - The environment exists
     * - `appUrl` and `apiUrl` are present and valid URLs
     * - `timeout` is positive
     * - `retries` is non-negative
     *
     * @param {Environment} env - The environment to validate
     * @returns {ValidationResult} Validation result with errors and warnings
     *
     * @example
     * ```typescript
     * const result = environmentManager.validateEnvironment('dev');
     * if (!result.isValid) {
     *   console.error('Validation errors:', result.errors);
     * }
     * ```
     */
    validateEnvironment(env: Environment): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const config = this.environmentConfigs.get(env);
            if (!config) {
                errors.push(`Environment '${env}' not found`);
                return {isValid: false, errors, warnings};
            }

            if (!config.appUrl) errors.push('appUrl is required');
            if (!config.apiUrl) errors.push('apiUrl is required');
            if (config.timeout <= 0) errors.push('timeout must be positive');
            if (config.retries < 0) errors.push('retries cannot be negative');

            try {
                new URL(config.appUrl);
            } catch {
                errors.push(`Invalid appUrl: ${config.appUrl}`);
            }

            try {
                new URL(config.apiUrl);
            } catch {
                errors.push(`Invalid apiUrl: ${config.apiUrl}`);
            }
        } catch (error) {
            errors.push(
                `Validation error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Sets a custom configuration value that will be merged into the active config.
     *
     * @param {string} key - Configuration key
     * @param {unknown} value - Configuration value
     */
    setCustomConfig(key: string, value: unknown): void {
        this.customConfigs.set(key, value);
    }

    /**
     * Retrieves a custom configuration value by key.
     *
     * @template T - Expected return type (defaults to `unknown`)
     * @param {string} key - Configuration key to look up
     * @returns {T | undefined} The custom value, or `undefined` if not set
     */
    getCustomConfig<T = unknown>(key: string): T | undefined {
        return this.customConfigs.get(key) as T | undefined;
    }

    /**
     * Returns the current environment config merged with the provided custom overrides.
     *
     * Does **not** persist the overrides — use {@link setCustomConfig} for persistent overrides.
     *
     * @param {Record<string, string | number | boolean | undefined>} customConfig - Overrides to merge
     * @returns {ExtendedEnvironmentConfig} Merged configuration
     *
     * @example
     * ```typescript
     * const merged = environmentManager.mergeConfig({ timeout: 5000 });
     * ```
     */
    mergeConfig(customConfig: Record<string, string | number | boolean | undefined>): ExtendedEnvironmentConfig {
        return {
            ...this.getConfig(),
            ...customConfig,
        };
    }

    /**
     * Registers a listener to be notified when the environment changes.
     *
     * Returns an unsubscribe function that removes the listener when called.
     *
     * @param {(env: Environment) => void} listener - Callback invoked with the new environment
     * @returns {() => void} Unsubscribe function
     *
     * @example
     * ```typescript
     * const unsubscribe = environmentManager.onEnvironmentChange((env) => {
     *   console.log(`Environment switched to: ${env}`);
     * });
     * // Later: unsubscribe();
     * ```
     */
    onEnvironmentChange(listener: (env: Environment) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }

    /**
     * Returns all available environment identifiers.
     * @returns {Environment[]} Array of environment names (e.g., `['dev', 'stag', 'prod', 'qe']`)
     */
    getAvailableEnvironments(): Environment[] {
        return Array.from(this.environmentConfigs.keys());
    }

    /**
     * Resets the manager to its default state (`'qe'` environment, no custom configs).
     */
    reset(): void {
        this.currentEnvironment = 'qe';
        this.customConfigs.clear();
        process.env.TEST_ENV = 'qe';
    }

    /**
     * Initializes all environment configurations from the environments module.
     * @private
     */
    private initializeEnvironments(): void {
        const environments: Environment[] = ['dev', 'stag', 'prod', 'qe'];
        environments.forEach((env) => {
            const config = getEnvironmentConfig(env);
            this.environmentConfigs.set(env, {...config});
        });
        this.currentEnvironment = (process.env.TEST_ENV as Environment) || 'qe';
    }

    /**
     * Notifies all registered change listeners of an environment switch.
     * @param {Environment} env - The new environment
     * @private
     */
    private notifyListeners(env: Environment): void {
        this.listeners.forEach((listener) => listener(env));
    }

}

/**
 * Pre-initialized singleton instance of {@link EnvironmentManager}.
 *
 * @const {EnvironmentManager}
 *
 * @example
 * ```typescript
 * import { environmentManager } from '../config/environmentManager';
 * const config = environmentManager.getConfig();
 * ```
 */
export const environmentManager = EnvironmentManager.getInstance();