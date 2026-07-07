/**
 * @fileoverview Custom logger with coloured console output and JSON file logging.
 *
 * The {@link Logger} class wraps `console.*` methods with a structured format
 * that includes timestamp, level, and context. All entries are simultaneously
 * written to daily-rotated JSON-lines log files under `logs/`.
 *
 * @module utils/logger
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { Logger } from '@utils/logger';
 *
 * const logger = new Logger('LoginPage');
 * logger.info('Navigating to login page');
 * logger.error('Login failed', new Error('Invalid credentials'));
 * ```
 */
import fs from 'fs';
import path from 'path';
import type {LogEntry, LogLevel} from '../types';

/** @private ANSI colour escape codes */
const Colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

/** @private Mapping from log level to ANSI colour */
const LEVEL_COLORS: Record<LogLevel, string> = {
    trace: Colors.magenta,
    debug: Colors.gray,
    info: Colors.blue,
    warn: Colors.yellow,
    error: Colors.red,
};

/** @private Numeric priority for each log level (higher = more severe) */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    trace: 4,
};

/** @private Directory for log files, configurable via `LOG_DIR` env var */
const LOG_DIR = process.env.LOG_DIR || 'logs';
/** @private Whether to write logs to disk (disable with `FILE_LOG=false`) */
const ENABLE_FILE_LOG = process.env.FILE_LOG !== 'false';

/**
 * Ensures the log directory exists, creating it recursively if necessary.
 * @private
 */
function ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, {recursive: true});
    }
}

/**
 * Returns the log file path for today (format: `app-YYYY-MM-DD.log`).
 * @returns {string} Absolute path to today's log file
 * @private
 */
function getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `app-${date}.log`);
}


/**
 * Structured logger with coloured console output, JSON file logging,
 * and in-memory log storage for post-hoc analysis.
 *
 * @class Logger
 *
 * @example
 * ```typescript
 * const logger = new Logger('AuthService', 'info');
 * logger.info('User logged in', { userId: '123' });
 * logger.error('Token refresh failed', new Error('expired'));
 * const childLogger = logger.child('TokenRefresh');
 * ```
 */
export class Logger {
    /** @private Component or module context label */
    private readonly context: string;
    /** @private Minimum log level to output */
    private readonly minLevel: LogLevel;
    /** @private In-memory log buffer */
    private readonly logs: LogEntry[] = [];

    /**
     * Creates a new Logger instance.
     *
     * @param {string} context - Label identifying the component (e.g., 'LoginPage')
     * @param {LogLevel} [minLevel='debug'] - Minimum severity to log
     */
    constructor(context: string, minLevel: LogLevel = 'debug') {
        this.context = context;
        this.minLevel = minLevel;
    }

    /* ---------- Public Log Methods ---------- */

    /**
     * Logs a debug-level message.
     * @param {string} message - Log message
     * @param {Record<string, unknown>} [data] - Optional structured context
     */
    debug(message: string, data?: Record<string, unknown>): void {
        this.log('debug', message, data);
    }

    /**
     * Logs an info-level message.
     * @param {string} message - Log message
     * @param {Record<string, unknown>} [data] - Optional structured context
     */
    info(message: string, data?: Record<string, unknown>): void {
        this.log('info', message, data);
    }

    /**
     * Logs a warning-level message.
     * @param {string} message - Log message
     * @param {Record<string, unknown>} [data] - Optional structured context
     */
    warn(message: string, data?: Record<string, unknown>): void {
        this.log('warn', message, data);
    }

    /**
     * Logs an error-level message with optional Error object and context data.
     * @param {string} message - Log message
     * @param {Error | unknown} [error] - Error instance for stack trace extraction
     * @param {Record<string, unknown>} [data] - Optional structured context
     */
    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
        const errorData =
            error instanceof Error
                ? {error: error.message, stack: error.stack, ...data}
                : {error, ...data};

        this.log('error', message, errorData);
    }

    /* ---------- Test Helpers ---------- */

    /**
     * Logs a numbered test step.
     * @param {number} stepNumber - Step number
     * @param {string} description - Step description
     */
    step(stepNumber: number, description: string): void {
        this.info(`Step ${stepNumber}: ${description}`);
    }

    /**
     * Logs the start of a test with a visual separator.
     * @param {string} testName - Name of the test
     */
    testStart(testName: string): void {
        this.info('='.repeat(60));
        this.info(`Starting Test: ${testName}`);
        this.info('='.repeat(60));
    }

    /**
     * Logs the end of a test with colour-coded status.
     * @param {string} testName - Name of the test
     * @param {'passed'|'failed'|'skipped'} status - Test outcome
     */
    testEnd(testName: string, status: 'passed' | 'failed' | 'skipped'): void {
        const color =
            status === 'passed' ? Colors.green : status === 'failed' ? Colors.red : Colors.yellow;

        this.info(`${color}Test ${status.toUpperCase()}: ${testName}${Colors.reset}`);
    }

    /* ---------- Enhanced Logging Methods ---------- */

    /**
     * Log HTTP request
     */
    logRequest(method: string, url: string, body?: any): void {
        this.info(`[${method}] ${url}`, {body});
    }

    /**
     * Log HTTP response
     */
    logResponse(status: number, duration: number, size?: number): void {
        this.info(`Response: ${status}`, {duration: `${duration}ms`, size});
    }

    /**
     * Log error with context
     */
    logError(error: Error, context?: Record<string, any>): void {
        this.error(error.message, error, context);
    }

    /**
     * Log test start with icon
     */
    logTestStart(testName: string): void {
        this.info(`▶ Starting: ${testName}`);
    }

    /**
     * Log test end with status icon
     */
    logTestEnd(testName: string, status: 'PASS' | 'FAIL' | 'SKIP'): void {
        const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⊘';
        this.info(`${icon} ${status}: ${testName}`);
    }

    /**
     * Log performance metric
     */
    logPerformance(operationName: string, durationMs: number, threshold?: number): void {
        const status = threshold && durationMs > threshold ? '⚠' : '✓';
        this.info(`${status} Performance: ${operationName} took ${durationMs.toFixed(2)}ms`, {
            threshold,
        });
    }

    /**
     * Log assertion
     */
    logAssertion(description: string, passed: boolean): void {
        const icon = passed ? '✓' : '✗';
        const level = passed ? 'info' : 'warn';
        this.log(level as LogLevel, `${icon} Assertion: ${description}`);
    }

    /**
     * Log data validation
     */
    logValidation(fieldName: string, isValid: boolean, errors?: string[]): void {
        if (isValid) {
            this.info(`✓ Validation passed: ${fieldName}`);
        } else {
            this.warn(`✗ Validation failed: ${fieldName}`, {errors});
        }
    }

    /* ---------- Log Storage ---------- */

    /**
     * Returns a copy of all in-memory log entries.
     * @returns {LogEntry[]} Array of log entries
     */
    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    /**
     * Filters in-memory logs by a specific level.
     * @param {LogLevel} level - The level to filter on
     * @returns {LogEntry[]} Matching log entries
     */
    getLogsByLevel(level: LogLevel): LogEntry[] {
        return this.logs.filter((log) => log.level === level);
    }

    /**
     * Clears all in-memory log entries.
     * @returns {void}
     */
    clearLogs(): void {
        this.logs.length = 0;
    }

    /**
     * Creates a child logger with a combined context string.
     *
     * @param {string} childContext - Additional context label
     * @returns {Logger} A new Logger with context `"parent:child"`
     *
     * @example
     * ```typescript
     * const child = logger.child('TokenRefresh');
     * // context → 'AuthService:TokenRefresh'
     * ```
     */
    child(childContext: string): Logger {
        return new Logger(`${this.context}:${childContext}`, this.minLevel);
    }

    /* ---------- Core Logger ---------- */

    /**
     * Core log method that stores, writes to file, and prints to console.
     *
     * @param {LogLevel} level - Severity level
     * @param {string} message - Log message
     * @param {Record<string, unknown>} [data] - Structured context
     * @private
     */
    private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
        if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minLevel]) {
            return;
        }

        const entry: LogEntry = {
            timestamp: new Date(),
            level,
            message,
            context: data,
        };

        // Store in memory
        this.logs.push(entry);

        // Write to file
        this.writeToFile(entry);

        // Console output
        if (process.env.JSON_LOGS === 'true') {
            const jsonOutput = JSON.stringify({
                timestamp: entry.timestamp.toISOString(),
                level: entry.level,
                logger: this.context,
                message: entry.message,
                ...data,
            });
            console.log(jsonOutput);
        } else {
            const timestamp = entry.timestamp.toISOString();
            const levelStr = level.toUpperCase().padEnd(5);
            const color = LEVEL_COLORS[level];

            let output =
                `${Colors.gray}[${timestamp}]${Colors.reset} ` +
                `${color}${levelStr}${Colors.reset} ` +
                `${Colors.cyan}[${this.context}]${Colors.reset} ` +
                `${message}`;

            if (data && Object.keys(data).length > 0) {
                output += ` ${Colors.gray}${JSON.stringify(data)}${Colors.reset}`;
            }

            switch (level) {
                case 'error':
                    console.error(output);
                    break;
                case 'warn':
                    console.warn(output);
                    break;
                default:
                    console.log(output);
            }
        }
    }

    /**
     * Write log entry to file
     */
    private writeToFile(entry: LogEntry): void {
        if (!ENABLE_FILE_LOG) return;

        ensureLogDir();
        const filePath = getLogFilePath();

        const logLine =
            JSON.stringify({
                timestamp: entry.timestamp.toISOString(),
                level: entry.level,
                logger: this.context,
                message: entry.message,
                data: entry.context ?? {},
            }) + '\n';

        fs.appendFileSync(filePath, logLine, {encoding: 'utf8'});
    }
}

export default Logger;