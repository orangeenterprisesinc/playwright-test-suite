/**
 * @fileoverview Custom exception classes for framework-level failures.
 *
 * Distinguishes framework/infrastructure failures (bad config, missing auth
 * secrets, unreadable data source) from ordinary Playwright assertion
 * failures, so callers and reporters can tell the two apart.
 *
 * @module core/frameworkExceptions
 */

/** Base class for every framework-level error. */
export class FrameworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

/** Thrown when an authentication strategy fails (missing secrets, token request failure, etc.). */
export class AuthenticationError extends FrameworkError {}

/** Thrown when a data source (JSON/CSV file) is missing, unreadable, or malformed. */
export class DataSourceError extends FrameworkError {}

/** Thrown when required configuration (env vars, config files) is missing or invalid. */
export class ConfigurationError extends FrameworkError {}

/** Thrown when a page/component method can't locate an element it depends on. */
export class ElementNotFoundError extends FrameworkError {}
