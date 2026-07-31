/**
 * Converts a Playwright JSON report for the web-pet suite into a per-test
 * baseline manifest.
 *
 * ## Why this exists
 *
 * The suite's acceptance criterion is "reproduce the localhost baseline"
 * (362 passed / 18 skipped / 26 failed). Those are TOTALS, and totals cannot
 * detect the failure modes a lift-and-shift-to-POM actually produces:
 *
 *   - a known-red test that is still red but for a DIFFERENT reason (a locator
 *     that stopped resolving reads exactly like the original assertion failure
 *     in a totals column);
 *   - a test that silently started skipping because its WP id changed;
 *   - one test going green while another goes red.
 *
 * So the manifest records, per test, its status AND a normalised fingerprint of
 * its failure — and it is keyed on the **WP id**, not on `file::title`, because
 * conversion retitles every test. A title-keyed manifest would report all 406
 * as regressions on the first batch.
 *
 * ## Usage
 *
 *   # 1. run the suite, writing a JSON report OUTSIDE artifacts/results/
 *   #    (an explicit --reporter replaces the configured chain, so no email,
 *   #     no Slack, and results.json is left alone)
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=run1.json \
 *     npm run test:webpet -- --reporter=json --workers=1
 *
 *   # 2. convert it to a manifest
 *   node scripts/webpet/baseline.js run1.json src/data/webpet/baselines/localhost.json
 *
 * Capture TWICE and diff the two runs before committing either — whatever
 * differs between two runs of unchanged code is flake, and flake must be known
 * before it can be distinguished from a regression.
 */
const fs = require('node:fs');
const path = require('node:path');
const Papa = require('papaparse');

const REPO_ROOT = path.join(__dirname, '..', '..');
const CSV_FILE = path.join(REPO_ROOT, 'src', 'data', 'webpet', 'webpetRunnerManager.csv');

/**
 * Collapses the volatile parts of a failure message so two runs of the same
 * defect produce the same string, while a genuinely different defect does not.
 *
 * Uses `error.message` only — never the stack or the code snippet. Conversion
 * moves every line number by construction, so a stack-derived fingerprint would
 * report 100% change and be useless.
 */
function fingerprint(message) {
    if (!message) return '';
    return String(message)
        // eslint-disable-next-line no-control-regex
        .replace(/\[[0-9;]*m/g, '') // ANSI colour
        .split('\n')[0]
        .replace(/\b\d+(\.\d+)?m?s\b/g, '<T>') // 30000ms, 1.5s
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<GEN>')
        .replace(/\bWP-\d{4}\b/g, '<GEN>')
        // data-factory names: <Prefix>_<RUN_TOKEN><worker>_<seq>, RUN_TOKEN being
        // Date.now().toString(36).slice(-5) — different on every single run.
        .replace(/\b([A-Za-z]+)_[0-9a-z]{5,7}_\d+\b/g, '$1_<GEN>')
        .replace(/:\d{4,5}\b/g, ':<PORT>')
        .replace(/[A-Za-z]:\\[^\s'"]+|\/(?:home|Users|mnt)\/[^\s'"]+/g, '<PATH>')
        .replace(/:\d+:\d+\b/g, ':<LOC>')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Loads the runner rows so a pre-conversion (unannotated) report can be keyed by WP id. */
function loadRowsByStructuralKey() {
    if (!fs.existsSync(CSV_FILE)) {
        throw new Error(`${CSV_FILE} does not exist — run: npm run webpet:runner:sync`);
    }
    const parsed = Papa.parse(fs.readFileSync(CSV_FILE, 'utf-8').replace(/^﻿/, ''), {
        header: true,
        skipEmptyLines: true,
    });
    const byKey = new Map();
    for (const row of parsed.data) {
        if (String(row.stale ?? '').toLowerCase() === 'true') continue;
        byKey.set(`${String(row.file ?? '').trim()}::${String(row.titlePath ?? '')}`, String(row.id ?? '').trim());
    }
    return byKey;
}

function normalizeFile(file) {
    const posix = String(file).split(path.sep).join('/').replace(/\\/g, '/');
    const anchored = posix.lastIndexOf('tests/webpet/');
    if (anchored >= 0) return posix.slice(anchored + 'tests/webpet/'.length);
    if (posix.startsWith('webpet/')) return posix.slice('webpet/'.length);
    return posix;
}

/**
 * Walks a Playwright JSON report into `{ id → { status, fingerprint, file, title } }`.
 *
 * Resolution order for the key mirrors the runner's own: the `testCaseId`
 * annotation when present (post-conversion), else the structural key looked up
 * against the CSV (pre-conversion). A test that resolves to neither is reported
 * so it can never be silently dropped from the comparison.
 */
function buildManifest(report, rowsByKey) {
    const tests = {};
    const unresolved = [];
    // Every spec file the run COLLECTED, taken from the suite tree rather than
    // from tests that produced results. Load-bearing for the diff: if a file's
    // only test is deleted, that file disappears from the results but not from
    // the collected set — which is how "the batch silently dropped a test" is
    // told apart from "this batch didn't cover that file".
    const files = new Set();

    function walkSuite(suite, describeTitles, fileFromParent) {
        const file = suite.file ?? fileFromParent;
        if (file) {
            const normalized = normalizeFile(file);
            if (normalized.endsWith('.spec.ts')) files.add(normalized);
        }
        for (const spec of suite.specs ?? []) {
            const webpetTest = (spec.tests ?? []).find((t) => t.projectName === 'webpet');
            if (!webpetTest) continue;

            const relFile = normalizeFile(spec.file ?? file);
            const titlePath = [...describeTitles, spec.title].join(' > ');
            const annotated = String(
                (webpetTest.annotations ?? []).find((a) => a.type === 'testCaseId')?.description ?? '',
            ).trim();
            const id = annotated || rowsByKey.get(`${relFile}::${titlePath}`) || '';

            if (!id) {
                unresolved.push(`${relFile}::${titlePath}`);
                continue;
            }

            const results = webpetTest.results ?? [];
            const last = results[results.length - 1];
            // No result entry at all = the test never ran. In a serial file this
            // is the cascade after an earlier failure; Playwright reports 19 of
            // these on dev staging.
            const status = last ? last.status : 'didNotRun';
            const errorMessage = last?.error?.message ?? last?.errors?.[0]?.message ?? '';

            tests[id] = {
                status,
                fingerprint: fingerprint(errorMessage),
                file: relFile,
                title: titlePath,
            };
        }
        for (const child of suite.suites ?? []) {
            walkSuite(child, [...describeTitles, child.title], file);
        }
    }

    for (const fileSuite of report.suites ?? []) {
        walkSuite(fileSuite, [], fileSuite.file);
    }
    return { tests, unresolved, files: [...files].sort() };
}

function summarise(tests) {
    const counts = {};
    for (const t of Object.values(tests)) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
}

// ── Entry point ─────────────────────────────────────────────────────────────

const [reportPath, outPath] = process.argv.slice(2);
if (!reportPath || !outPath) {
    console.error('Usage: node scripts/webpet/baseline.js <playwright-report.json> <out-manifest.json>');
    console.error('');
    console.error('Produce the report with:');
    console.error('  PLAYWRIGHT_JSON_OUTPUT_NAME=run1.json npm run test:webpet -- --reporter=json --workers=1');
    process.exit(2);
}
if (!fs.existsSync(reportPath)) {
    console.error(`[webpet-baseline] report not found: ${reportPath}`);
    process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const { tests, unresolved, files } = buildManifest(report, loadRowsByStructuralKey());

if (unresolved.length) {
    console.error(`[webpet-baseline] ${String(unresolved.length)} test(s) could not be resolved to a WP id:`);
    for (const key of unresolved.slice(0, 20)) console.error(`  ${key}`);
    if (unresolved.length > 20) console.error(`  … and ${String(unresolved.length - 20)} more`);
    console.error('[webpet-baseline] run `npm run webpet:runner:sync` first so every test has a row.');
    process.exit(1);
}

const counts = summarise(tests);
const manifest = {
    metadata: {
        capturedFrom: path.basename(reportPath),
        generator: 'scripts/webpet-baseline.js',
        total: Object.keys(tests).length,
        counts,
        /** Spec files collected by this run — see buildManifest(). */
        files,
    },
    tests,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

const summary = Object.entries(counts)
    .sort()
    .map(([k, v]) => `${String(v)} ${k}`)
    .join(' / ');
console.log(`[webpet-baseline] wrote ${String(Object.keys(tests).length)} tests → ${outPath}`);
console.log(`[webpet-baseline] ${summary}`);
console.log('[webpet-baseline] capture a SECOND run and diff the two before committing — whatever');
console.log('[webpet-baseline] differs between two runs of unchanged code is flake, not signal.');
