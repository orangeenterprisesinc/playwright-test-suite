/**
 * Generates the static Allure HTML report from allure-results/.
 *
 * Uses the same require('allure-commandline') JS API as
 * src/utils/allureReportGenerator.ts (not compiled here, so this plain-JS
 * copy exists for use before/outside the TS build — e.g. from npm scripts
 * and CI, where ts-node isn't guaranteed to be available). Requires a Java
 * runtime on PATH.
 *
 * Usage: node scripts/generate-allure-report.js [resultsDir] [reportDir]
 */
const allureCommandline = require('allure-commandline');
const fs = require('node:fs');
const path = require('node:path');

const [resultsDir = 'allure-results', reportDir = 'allure-report'] = process.argv.slice(2);

// Extend trend graphs across runs instead of restarting them on every --clean.
const historySrc = path.join(reportDir, 'history');
if (fs.existsSync(historySrc)) {
    const historyDest = path.join(resultsDir, 'history');
    fs.rmSync(historyDest, { recursive: true, force: true });
    fs.cpSync(historySrc, historyDest, { recursive: true });
}

const generation = allureCommandline(['generate', resultsDir, '--clean', '-o', reportDir]);
generation.on('exit', (code) => process.exit(code === null ? 1 : code));
