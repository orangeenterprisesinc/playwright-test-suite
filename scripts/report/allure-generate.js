/**
 * Generates the static Allure HTML report from artifacts/allure/results/.
 *
 * Trace attachments and oversized video are dropped first (see
 * scripts/report/lib/leanResults.js for the rule and why it is a size cap rather
 * than a format ban); the full trace stays in the Playwright HTML report and the
 * raw artifacts/results/ artifacts. Requires a Java runtime on PATH.
 *
 * This is the multi-file report, uploaded whole as a CI artifact — it has no mail
 * gateway to satisfy, so it keeps video up to a generous cap. The single-file
 * variant for email/Slack is built by src/reporting/generate/allure/report.ts.
 *
 * Usage: node scripts/report/allure-generate.js [resultsDir] [reportDir]
 */
const allureCommandline = require('allure-commandline');
const { ensureJavaOnPath } = require('./ensure-java');
const { createLeanAllureResults } = require('./lib/leanResults');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const [resultsDir = path.join('artifacts', 'allure', 'results'), reportDir = path.join('artifacts', 'allure', 'report')] =
    process.argv.slice(2);

const leanResultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-lean-'));
createLeanAllureResults(resultsDir, leanResultsDir, {
    // Nothing emails this one, so the cap only exists to keep a runaway
    // recording from bloating the artifact.
    maxVideoMb: Number(process.env.ALLURE_MAX_VIDEO_MB ?? 64),
});

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
