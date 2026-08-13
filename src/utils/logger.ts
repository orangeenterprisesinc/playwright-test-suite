/**
 * @fileoverview Custom logger with coloured console output and JSON file logging.
 *
 * The {@link Logger} class wraps `console.*` methods with a structured format
 * that includes timestamp, level, and context. All entries are simultaneously
 * written to daily-rotated JSON-lines log files under `logs/`.
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
const LOG_DIR = process.env.LOG_DIR || path.join('artifacts', 'logs');
/** @private Whether to write logs to disk (disable with `FILE_LOG=false`) */
const ENABLE_FILE_LOG = process.env.FILE_LOG !== 'false';

/** Ensures the log directory exists, creating it recursively if necessary. */
function ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, {recursive: true});
    }
}

/** Returns the log file path for today (format: `app-YYYY-MM-DD.log`). */
function getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return path.join(LOG_DIR, `app-${date}.log`);
}


/**
 * Structured logger with coloured console output and JSON file logging.
 */
export class Logger {
    /** @private Component or module context label */
    private readonly context: string;
    /** @private Minimum log level to output */
    private readonly minLevel: LogLevel;

    /** Creates a new Logger instance. */
    constructor(context: string, minLevel: LogLevel = 'debug') {
        this.context = context;
        this.minLevel = minLevel;
    }

    /* ---------- Public Log Methods ---------- */

    /** Logs a debug-level message. */
    debug(message: string, data?: Record<string, unknown>): void {
        this.log('debug', message, data);
    }

    /** Logs an info-level message. */
    info(message: string, data?: Record<string, unknown>): void {
        this.log('info', message, data);
    }

    /** Logs a warning-level message. */
    warn(message: string, data?: Record<string, unknown>): void {
        this.log('warn', message, data);
    }

    /** Logs an error-level message with optional Error object and context data. */
    error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
        const errorData =
            error instanceof Error
                ? {error: error.message, stack: error.stack, ...data}
                : {error, ...data};

        this.log('error', message, errorData);
    }

    /* ---------- Test Helpers ---------- */

    /** Logs a numbered test step. */
    step(stepNumber: number, description: string): void {
        this.info(`Step ${stepNumber}: ${description}`);
    }

    /** Log HTTP response */
    logResponse(status: number, duration: number, size?: number): void {
        this.info(`Response: ${status}`, {duration: `${duration}ms`, size});
    }

    /* ---------- Core Logger ---------- */

    /** Core log method that stores, writes to file, and prints to console. */
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

    /** Write log entry to file */
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