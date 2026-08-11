/**
 * @fileoverview Allure report generation.
 *
 * Invokes `allure-commandline`'s JS API directly rather than shelling out to
 * `npx allure` / the node_modules/.bin wrapper — those are .cmd shims on
 * Windows, and cmd.exe treats `&` as a command separator, which breaks when
 * the repo lives in a path containing one (see scripts/run-playwright.js).
 *
 * {@link acquireLeanReport} trims the results first — traces out, video only
 * under a size cap — so the single-file report never hits the "file too large"
 * failure when emailed or uploaded to Slack. The trace and any oversized video
 * remain available in the Playwright HTML report and raw artifacts/results/.
 * It is written entirely under the OS temp dir (no zip — many mail gateways
 * strip those), so it never shows up as a folder in the repo tree.
 *
 * The trimming rule itself lives in scripts/report/lib/leanResults.js, shared
 * with the CI generator; it used to be copied into both with a "keep in sync"
 * comment, and the copies had drifted.
 *
 * The static multi-file report for CI artifacts / `npm run report:allure` is
 * generated separately by `scripts/report/allure-generate.js` (plain JS, so it
 * runs from npm/CI without a TypeScript runtime).
 */
import allureCommandline from 'allure-commandline';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Plain JS, shared with scripts/report/allure-generate.js — see that module for
// why the dependency points this way and not the reverse.
import { createLeanAllureResults } from '../../../../scripts/report/lib/leanResults.js';
// Same story: the Windows JAVA_HOME/registry bootstrap lives in plain JS because
// allure-generate.js needs it without a TypeScript runtime.
import { ensureJavaOnPath } from '../../../../scripts/report/ensure-java.js';

/** Runs `allure <args>` and resolves once the process exits successfully. */
function runAllure(args: string[]): Promise<void> {
    if (!ensureJavaOnPath()) {
        return Promise.reject(
            new Error('no Java runtime found (install a JDK/JRE or set JAVA_HOME) — Allure needs a JVM'),
        );
    }
    return new Promise((resolve, reject) => {
        const proc = allureCommandline(args);
        proc.on('error', reject);
        proc.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`allure ${args[0]} exited with code ${code}`));
        });
    });
}

/** One in-flight/finished build per results dir — see {@link acquireLeanReport}. */
const leanReports = new Map<string, Promise<{ htmlPath: string }>>();

async function buildLeanReport(resultsDir: string): Promise<{ htmlPath: string }> {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-lean-'));
    const leanResultsDir = path.join(tmpRoot, 'results');
    const reportDir = path.join(tmpRoot, 'report');

    // Registered before the (slow, killable) generate so a half-built report is
    // still cleaned up on exit.
    process.once('exit', () => fs.rmSync(tmpRoot, { recursive: true, force: true }));

    // This one gets emailed and uploaded to Slack, so the video cap is tight —
    // a device journey clears it comfortably, a long browser recording will not.
    createLeanAllureResults(resultsDir, leanResultsDir, {
        maxVideoMb: Number(process.env.ALLURE_MAX_VIDEO_MB ?? 8),
    });
    await runAllure(['generate', leanResultsDir, '--single-file', '--clean', '-o', reportDir]);

    return { htmlPath: path.join(reportDir, 'index.html') };
}

/**
 * Builds (once per process) a lean, single-file Allure report — screenshots, step
 * logs and video under the size cap, no trace — and returns its `index.html`.
 *
 * Memoised because the email and Slack reporters both attach it and each build
 * spawns a JVM; the file lives under the OS temp dir and is removed on process
 * exit, so neither caller owns its lifetime.
 */
export function acquireLeanReport(resultsDir = path.join('artifacts', 'allure', 'results')): Promise<{ htmlPath: string }> {
    const key = path.resolve(resultsDir);
    let report = leanReports.get(key);
    if (!report) {
        report = buildLeanReport(resultsDir);
        // A failed build is remembered too (no point re-spawning a JVM that has
        // already failed), so pre-empt an unhandled rejection if only one of the
        // reporters ever awaits it.
        report.catch(() => {});
        leanReports.set(key, report);
    }
    return report;
}
