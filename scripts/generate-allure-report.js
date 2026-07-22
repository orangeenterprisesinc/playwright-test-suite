/**
 * Generates the static Allure HTML report from allure-results/ — embeds ONLY
 * screenshots (plus tiny step logs) and drops the heavy video/trace
 * attachments first, so the report stays small. The full video/trace remain
 * in the Playwright HTML report and raw test-results/ artifacts.
 *
 * Keep this filter in sync with src/utils/allureHelper.ts — this plain-JS copy
 * exists for use before/outside the TS build (npm scripts and CI, where
 * ts-node isn't guaranteed to be available). Requires a Java runtime on PATH.
 *
 * Usage: node scripts/generate-allure-report.js [resultsDir] [reportDir]
 */
const allureCommandline = require('allure-commandline');
const { ensureJavaOnPath } = require('./ensure-java');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [resultsDir = 'allure-results', reportDir = 'allure-report'] = process.argv.slice(2);

// Allure names attachment files `<uuid>-attachment.<ext>`; this captures the extension.
const ATTACHMENT_FILE_PATTERN = /-attachment\.([a-z0-9]+)$/i;

// Kept attachment types: screenshots + tiny text/markdown step logs. Video
// (.webm) and Playwright trace (.zip) are dropped — they're the multi-MB
// attachments that bloat the report.
const KEPT_ATTACHMENT_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md']);

function isKeptAttachmentFile(name) {
    const match = name.match(ATTACHMENT_FILE_PATTERN);
    if (!match) return true; // not an attachment file — always kept
    return KEPT_ATTACHMENT_EXTS.has(match[1].toLowerCase());
}

function isKeptAttachment(attachment) {
    if (!attachment || typeof attachment !== 'object') return false;
    const { source, type } = attachment;
    if (type && (type.startsWith('video/') || type.includes('playwright-trace') || type === 'application/zip')) {
        return false;
    }
    if (source) {
        const match = source.match(ATTACHMENT_FILE_PATTERN);
        if (match) return KEPT_ATTACHMENT_EXTS.has(match[1].toLowerCase());
    }
    return true;
}

function filterAttachments(node) {
    if (Array.isArray(node)) {
        node.forEach(filterAttachments);
        return;
    }
    if (node && typeof node === 'object') {
        if (Array.isArray(node.attachments)) node.attachments = node.attachments.filter(isKeptAttachment);
        for (const value of Object.values(node)) filterAttachments(value);
    }
}

// The auth-setup project's results are infra, not real tests — drop them.
function isAuthSetupResult(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.fullName && data.fullName.includes('.setup.ts')) return true;
    return (data.labels || []).some((l) => l.name === 'parentSuite' && l.value === 'auth-setup');
}

function createLeanAllureResults(sourceDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const name of fs.readdirSync(sourceDir)) {
        const srcPath = path.join(sourceDir, name);
        if (fs.statSync(srcPath).isDirectory()) continue;

        if (ATTACHMENT_FILE_PATTERN.test(name)) {
            if (isKeptAttachmentFile(name)) fs.copyFileSync(srcPath, path.join(destDir, name));
            continue;
        }

        if (name.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
            if (name.endsWith('-result.json') && isAuthSetupResult(data)) continue;
            filterAttachments(data);
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

if (!ensureJavaOnPath()) {
    fs.rmSync(leanResultsDir, { recursive: true, force: true });
    console.error('Allure report skipped: no Java runtime found (install a JDK/JRE or set JAVA_HOME) — Allure needs a JVM.');
    process.exit(0);
}
const generation = allureCommandline(['generate', leanResultsDir, '--clean', '-o', reportDir]);
generation.on('exit', (code) => {
    fs.rmSync(leanResultsDir, { recursive: true, force: true });
    process.exit(code === null ? 1 : code);
});
