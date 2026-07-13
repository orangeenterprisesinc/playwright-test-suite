/**
 * Generates the static Allure HTML report from allure-results/ — strips
 * screenshots/videos/traces first, so the report is pass/fail/steps/errors
 * only, no media.
 *
 * Uses the same require('allure-commandline') JS API as
 * src/utils/allureReporting.ts (not compiled here, so this plain-JS copy
 * exists for use before/outside the TS build — e.g. from npm scripts and
 * CI, where ts-node isn't guaranteed to be available). Requires a Java
 * runtime on PATH.
 *
 * Usage: node scripts/generate-allure-report.js [resultsDir] [reportDir]
 */
const allureCommandline = require('allure-commandline');
const { ensureJavaOnPath } = require('./ensure-java');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [resultsDir = 'allure-results', reportDir = 'allure-report'] = process.argv.slice(2);

// Allure names attachment files `<uuid>-attachment.<ext>`; everything else
// (result/container/env JSON) is kept.
const ATTACHMENT_FILE_PATTERN = /-attachment\./;

function stripAttachments(node) {
    if (Array.isArray(node)) {
        node.forEach(stripAttachments);
        return;
    }
    if (node && typeof node === 'object') {
        if (Array.isArray(node.attachments)) node.attachments = [];
        for (const value of Object.values(node)) stripAttachments(value);
    }
}

function createLeanAllureResults(sourceDir, destDir) {
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

const leanResultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-lean-'));
createLeanAllureResults(resultsDir, leanResultsDir);

// Extend trend graphs across runs instead of restarting them on every --clean.
const historySrc = path.join(reportDir, 'history');
if (fs.existsSync(historySrc)) {
    const historyDest = path.join(leanResultsDir, 'history');
    fs.rmSync(historyDest, { recursive: true, force: true });
    fs.cpSync(historySrc, historyDest, { recursive: true });
}

ensureJavaOnPath();
const generation = allureCommandline(['generate', leanResultsDir, '--clean', '-o', reportDir]);
generation.on('exit', (code) => {
    fs.rmSync(leanResultsDir, { recursive: true, force: true });
    process.exit(code === null ? 1 : code);
});
