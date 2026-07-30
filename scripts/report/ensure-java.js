/**
 * allure-commandline shells out to `java`, which only sees this process's
 * PATH/JAVA_HOME — not whatever a later install (e.g. via winget /
 * setup-java) configured, since already-running terminals never pick that up
 * automatically on Windows. Rather than requiring every terminal to be
 * restarted, read the persisted value straight from the registry (machine
 * hive first, then the user hive — winget without elevation lands JAVA_HOME
 * under HKCU) and patch this process's own env before invoking allure.
 *
 * Returns true if a usable Java runtime is on PATH/JAVA_HOME afterwards, so
 * callers can skip Allure cleanly with one clear message instead of letting
 * allure.bat spew its confusing JVM-lookup errors.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** Whether `dir` looks like a valid JDK/JRE home (contains bin/java.exe). */
function isValidJavaHome(dir) {
    return !!dir && fs.existsSync(path.join(dir, 'bin', 'java.exe'));
}

/** Reads a persisted JAVA_HOME from one registry hive, or undefined. Never throws. */
function readJavaHomeFromRegistry(hiveKey) {
    try {
        const output = execFileSync('reg', ['query', hiveKey, '/v', 'JAVA_HOME'], {
            encoding: 'utf-8',
            // Swallow reg's "unable to find the specified registry key or value"
            // stderr — a missing value is an expected, handled outcome here.
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const match = output.match(/JAVA_HOME\s+REG_\w+\s+(.+)/);
        return match && match[1] ? match[1].trim() : undefined;
    } catch {
        return undefined;
    }
}

function ensureJavaOnPath() {
    if (process.platform !== 'win32') return true;

    // An empty / whitespace-only JAVA_HOME is worse than an unset one: allure.bat
    // treats it as "defined" and mis-parses it into garbled `"= 1>&2` output.
    // Delete it so the batch takes its clean "JAVA_HOME is not set" path.
    if (process.env.JAVA_HOME !== undefined && process.env.JAVA_HOME.trim() === '') {
        delete process.env.JAVA_HOME;
    }

    if (isValidJavaHome(process.env.JAVA_HOME)) return true;

    const hives = [
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
        'HKCU\\Environment',
    ];
    for (const hive of hives) {
        const javaHome = readJavaHomeFromRegistry(hive);
        if (isValidJavaHome(javaHome)) {
            process.env.JAVA_HOME = javaHome;
            process.env.PATH = `${path.join(javaHome, 'bin')};${process.env.PATH}`;
            return true;
        }
    }

    // Last resort: a `java` already on PATH is enough for allure.bat.
    try {
        execFileSync('java', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

module.exports = { ensureJavaOnPath, isValidJavaHome };
