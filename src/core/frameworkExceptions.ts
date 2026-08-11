/**
 * @fileoverview Custom exception classes for framework-level failures.
 *
 * Distinguishes framework/infrastructure failures (bad config, missing auth
 * secrets, unreadable data source) from ordinary Playwright assertion
 * failures, so callers and reporters can tell the two apart.
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
