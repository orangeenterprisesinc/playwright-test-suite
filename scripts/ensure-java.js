/**
 * allure-commandline shells out to `java`, which only sees this process's
 * PATH/JAVA_HOME — not whatever a later system-wide install (e.g. via
 * winget) configured, since already-running terminals never pick that up
 * automatically on Windows. Rather than requiring every terminal to be
 * restarted, read the machine-level value straight from the registry and
 * patch this process's own env before invoking allure.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function ensureJavaOnPath() {
    if (process.platform !== 'win32') return;
    if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))) return;

    try {
        const output = execFileSync(
            'reg',
            ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', 'JAVA_HOME'],
            { encoding: 'utf-8' },
        );
        const match = output.match(/JAVA_HOME\s+REG_\w+\s+(.+)/);
        const javaHome = match && match[1] ? match[1].trim() : undefined;
        if (javaHome && fs.existsSync(path.join(javaHome, 'bin', 'java.exe'))) {
            process.env.JAVA_HOME = javaHome;
            process.env.PATH = `${path.join(javaHome, 'bin')};${process.env.PATH}`;
        }
    } catch {
        // Best-effort — if the registry lookup fails, allure generate fails
        // with its usual clear "JAVA_HOME is not set" error, same as before.
    }
}

module.exports = { ensureJavaOnPath };
