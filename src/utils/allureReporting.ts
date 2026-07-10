/**
 * @fileoverview Allure report generation.
 *
 * Invokes `allure-commandline`'s JS API directly rather than shelling out to
 * `npx allure` / the node_modules/.bin wrapper — those are .cmd shims on
 * Windows, and cmd.exe treats `&` as a command separator, which breaks when
 * the repo lives in a path containing one (see scripts/run-playwright.js).
 *
 * Two entry points:
 * - {@link generateAllureReport} — the normal multi-file report for CI
 *   artifacts / `npm run report:allure`, with every screenshot/video/trace
 *   and cross-run trend history. Writes to the repo (`allure-report/`).
 * - {@link prepareLeanEmailReport} — a single self-contained `index.html`
 *   with screenshots/videos/traces stripped out, for attaching to email
 *   (no zip — many mail gateways strip those). Written entirely under the
 *   OS temp dir so it never shows up as a folder in the repo tree; call the
 *   returned `cleanup()` once the email is sent.
 *
 * @module utils/allureReporting
 */
import allureCommandline from 'allure-commandline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Runs `allure <args>` and resolves once the process exits successfully. */
function runAllure(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = allureCommandline(args);
        proc.on('error', reject);
        proc.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`allure ${args[0]} exited with code ${code}`));
        });
    });
}

/**
 * Copies the previous run's `<reportDir>/history/` into `<resultsDir>/history/`
 * so `allure generate` extends the trend graphs instead of restarting them —
 * otherwise every `--clean` wipes history and Trend/Graphs stay empty. Locally
 * this just reuses the report dir left on disk; in CI it relies on a cache
 * step restoring that same folder before this runs.
 */
function preserveAllureHistory(resultsDir: string, reportDir: string): void {
    const historySrc = path.join(reportDir, 'history');
    if (!fs.existsSync(historySrc)) return;

    const historyDest = path.join(resultsDir, 'history');
    fs.rmSync(historyDest, { recursive: true, force: true });
    fs.cpSync(historySrc, historyDest, { recursive: true });
}

/** Generates the static multi-file Allure report. Requires a Java runtime on PATH. */
export function generateAllureReport(resultsDir = 'allure-results', reportDir = 'allure-report'): Promise<void> {
    preserveAllureHistory(resultsDir, reportDir);
    return runAllure(['generate', resultsDir, '--clean', '-o', reportDir]);
}

/** Serves the generated Allure report locally (blocks until Ctrl+C). */
export function openAllureReport(reportDir = 'allure-report'): Promise<void> {
    return runAllure(['open', reportDir]);
}

/** Allure names attachment files `<uuid>-attachment.<ext>`; everything else (result/container/env JSON) is kept. */
const ATTACHMENT_FILE_PATTERN = /-attachment\./;

/** Recursively clears every `attachments` array so the report doesn't reference files we didn't copy. */
function stripAttachments(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(stripAttachments);
        return;
    }
    if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (Array.isArray(obj.attachments)) obj.attachments = [];
        for (const value of Object.values(obj)) stripAttachments(value);
    }
}

/** Writes a media-free copy of `sourceDir`'s allure-results into `destDir`. */
function createLeanAllureResults(sourceDir: string, destDir: string): void {
    fs.mkdirSync(destDir, { recursive: true });

    for (const name of fs.readdirSync(sourceDir)) {
        if (ATTACHMENT_FILE_PATTERN.test(name)) continue;

        const srcPath = path.join(sourceDir, name);
        if (fs.statSync(srcPath).isDirectory()) continue;

        if (name.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
            stripAttachments(data);
            fs.writeFileSync(path.join(destDir, name), JSON.stringify(data));
        } else {
            fs.copyFileSync(srcPath, path.join(destDir, name));
        }
    }
}

/**
 * Builds a lean, single-file Allure report (no screenshots/videos/traces) for
 * emailing. Everything is written under the OS temp dir — call the returned
 * `cleanup()` once you're done reading `htmlPath` (e.g. after `sendMail`).
 */
export async function prepareLeanEmailReport(resultsDir = 'allure-results'): Promise<{ htmlPath: string; cleanup: () => void }> {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-email-'));
    const leanResultsDir = path.join(tmpRoot, 'results');
    const reportDir = path.join(tmpRoot, 'report');

    createLeanAllureResults(resultsDir, leanResultsDir);
    await runAllure(['generate', leanResultsDir, '--single-file', '--clean', '-o', reportDir]);

    return {
        htmlPath: path.join(reportDir, 'index.html'),
        cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
    };
}
