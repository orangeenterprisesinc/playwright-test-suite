/**
 * @fileoverview Custom exception hierarchy for the Playwright POM framework.
 *
 * Provides a base {@link FrameworkException} class and domain-specific subclasses
 * for property files, Excel paths, general file paths, databases, JSON parsing,
 * authentication, and configuration errors. All exceptions support an optional
 * `cause` parameter for error chaining.
 *
 * @module exceptions/frameworkExceptions
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { DatabaseException, ConfigurationException } from '../exceptions/frameworkExceptions';
 *
 * try {
 *   await db.query('SELECT ...');
 * } catch (err) {
 *   throw new DatabaseException('Failed to execute query', err as Error);
 * }
 * ```
 */

/**
 * Base exception class for all framework-specific errors.
 *
 * Extends the built-in `Error` class with optional error chaining via the `cause` property.
 * All other framework exception classes extend this base class.
 *
 * @class FrameworkException
 * @extends {Error}
 *
 * @example
 * ```typescript
 * throw new FrameworkException('Something went wrong');
 * throw new FrameworkException('Wrapper error', originalError);
 * ```
 */
export class FrameworkException extends Error {
    /**
     * Creates a new FrameworkException.
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception (for error chaining)
     */
    constructor(message: string, cause?: Error) {
        super(message);
        this.name = 'FrameworkException';
        if (cause) this.cause = cause;
    }
}

/**
 * Thrown when a property or configuration file cannot be read, parsed, or is malformed.
 *
 * @class PropertyFileUsageException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * throw new PropertyFileUsageException('Failed to parse config.properties');
 * ```
 */
export class PropertyFileUsageException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'PropertyFileUsageException';
    }
}

/**
 * Thrown when an Excel file path is invalid, missing, or cannot be accessed.
 *
 * @class InvalidPathForExcelException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * throw new InvalidPathForExcelException(`Excel file not found: ${filePath}`);
 * ```
 */
export class InvalidPathForExcelException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'InvalidPathForExcelException';
    }
}

/**
 * Thrown when a general file path is invalid, missing, or inaccessible.
 *
 * @class InvalidPathForFilesException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * throw new InvalidPathForFilesException(`File not found: ${csvPath}`);
 * ```
 */
export class InvalidPathForFilesException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'InvalidPathForFilesException';
    }
}

/**
 * Thrown when a database operation fails (connection, query, migration, etc.).
 *
 * @class DatabaseException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * try {
 *   await pool.query('INSERT INTO ...');
 * } catch (err) {
 *   throw new DatabaseException('Insert failed', err as Error);
 * }
 * ```
 */
export class DatabaseException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'DatabaseException';
    }
}

/**
 * Thrown when JSON parsing, serialization, or schema validation fails.
 *
 * @class JsonException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * try {
 *   JSON.parse(invalidJson);
 * } catch (err) {
 *   throw new JsonException('Invalid JSON in test data file', err as Error);
 * }
 * ```
 */
export class JsonException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'JsonException';
    }
}

/**
 * Thrown when authentication or authorization fails (OAuth2, API key, basic auth, etc.).
 *
 * @class AuthenticationException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * throw new AuthenticationException('OAuth2 token refresh failed', tokenError);
 * ```
 */
export class AuthenticationException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'AuthenticationException';
    }
}

/**
 * Thrown when a required configuration value is missing, invalid, or malformed.
 *
 * @class ConfigurationException
 * @extends {FrameworkException}
 *
 * @example
 * ```typescript
 * if (!process.env.BASE_URL) {
 *   throw new ConfigurationException('BASE_URL environment variable is required');
 * }
 * ```
 */
export class ConfigurationException extends FrameworkException {
    /**
     * @param {string} message - Descriptive error message
     * @param {Error} [cause] - Original error that caused this exception
     */
    constructor(message: string, cause?: Error) {
        super(message, cause);
        this.name = 'ConfigurationException';
    }
}
