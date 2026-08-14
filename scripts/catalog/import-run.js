/**
 * Freezes one Playwright run into a normalized snapshot the traceability sheet
 * can join against.
 *
 *     gh run view --job 94423104695 --log | \
 *       node scripts/catalog/import-run.js --suite webpet --run 31692620907 \
 *         --job 94423104695 --sha 4f52e32 --event schedule --created 2026-08-13T10:46:58Z
 *
 *     node scripts/catalog/import-run.js --suite journey --run local \
 *       --results artifacts/results/results.json
 *
 * Writes docs/catalog/runs/<run>-<suite>.json.
 *
 * Two inputs because CI keeps no machine-readable per-test result: the uploaded
 * artifacts are an HTML and an Allure report, and results.json only exists inside
 * the runner. The `list` reporter's console lines are the one per-test record the
 * log preserves, so a CI baseline is imported from the log and a local run from
 * the JSON reporter.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(ROOT, 'docs', 'catalog', 'runs');

/** `--flag value` pairs; every field of the snapshot header is supplied by hand. */
function parseArgs(argv) {
    const args = { suite: null, run: null, job: null, sha: null, event: null, created: null, results: null };
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i].replace(/^--/, '');
        if (key in args) args[key] = argv[++i] ?? null;
    }
    if (!args.suite || !args.run) {
        console.error('Usage: import-run.js --suite <webpet|journey> --run <id> [--job <id>] [--sha <sha>] [--event <e>] [--created <iso>] [--results <file>]');
        process.exit(1);
    }
    return args;
}

const ANSI = /\x1B\[[0-9;]*m/g;
// `  ✓  99 [webpet] › tests/webpet/crop.spec.ts:76:9 › New crop form › [Crop] … (1.1s)`
const LINE = /\s([✓✘×-])\s+(\d+)\s+\[([^\]]+)\]\s+›\s+([^:]+):(\d+):\d+\s+›\s+(.+)$/;
const STATUS = { '✓': 'passed', '-': 'skipped', '✘': 'failed', '×': 'failed' };
// A line ends `… @tags (retry #1) (6.8s)`. Both trailers have to come off before
// the title is an identity, or every retry reads as a separate test.
const TRAILER = /\s+\((?:\d[\d.]*\s*m?s|retry #\d+)\)$/;

/** Per-test rows out of a `list` reporter log. */
function fromLog(text) {
    const tests = new Map();
    for (const raw of text.split(/\r?\n/)) {
        const match = LINE.exec(raw.replace(ANSI, '').replace(/\r/g, ''));
        if (!match) continue;

        const [, mark, , project, file, line, rest] = match;
        let tail = rest;
        while (TRAILER.test(tail)) tail = tail.replace(TRAILER, '');

        // One line per attempt, and a retry is printed under a NEW ordinal, so the
        // identity has to be the test itself; the last attempt in log order wins.
        tests.set(`${project}#${file}:${line}#${tail}`, {
            file: file.replace(/\\/g, '/'),
            line: Number(line),
            project,
            // Trailing ` @WebPet @wp-setup …` is the tag echo, not part of the title.
            title: tail.replace(/(\s+@[\w-]+)+$/, '').trim(),
            tags: (tail.match(/\s@[\w-]+/g) ?? []).map((t) => t.trim()).join(' '),
            status: STATUS[mark],
        });
    }
    return [...tests.values()];
}

/**
 * The reporter's own closing tally (`  365 passed (5.0m)`), which is the
 * authoritative run outcome — a `test.fail()` trip-wire prints ✘ per test but is
 * an EXPECTED failure and never reaches this line.
 */
function reportedTotals(text) {
    const reported = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(ANSI, '');
        const match = /^\s*(\d+)\s+(passed|failed|skipped|flaky|did not run)\b/.exec(line.replace(/^.*?\dZ\s+/, ''));
        if (match) reported[match[2].replace(/\s/g, '')] = Number(match[1]);
    }
    return reported;
}

/** Per-test rows out of the Playwright JSON reporter. */
function fromResults(file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    const tests = [];

    const visit = (suite, fileName) => {
        const owner = suite.file ?? fileName;
        for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
                const last = test.results?.[test.results.length - 1];
                tests.push({
                    file: (owner ?? '').replace(/\\/g, '/'),
                    line: spec.line ?? 0,
                    project: test.projectName ?? '',
                    title: spec.title,
                    tags: (spec.tags ?? []).join(' '),
                    // `expected`/`unexpected` are outcome words; status is the raw one.
                    status: last?.status === 'passed' ? 'passed' : (last?.status ?? 'unknown'),
                    caseId: (test.annotations ?? []).find((a) => a.type === 'testCaseId')?.description ?? '',
                });
            }
        }
        for (const child of suite.suites ?? []) visit(child, owner);
    };
    for (const suite of report.suites ?? []) visit(suite, suite.file);
    return tests;
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    const log = args.results ? '' : fs.readFileSync(0, 'utf8');
    const tests = args.results ? fromResults(path.resolve(ROOT, args.results)) : fromLog(log);

    if (!tests.length) {
        console.error('No test lines found — check the input is a `list` reporter log or a JSON report.');
        process.exit(1);
    }

    const reported = args.results ? {} : reportedTotals(log);
    // Reporter says nothing failed but ✘ lines exist ⇒ every one is a `test.fail()`
    // trip-wire. Relabel them so a known-bug marker is never read as a regression.
    if (reported.failed === undefined && tests.some((t) => t.status === 'failed')) {
        for (const test of tests) if (test.status === 'failed') test.status = 'expected-failure';
    }

    const totals = { collected: tests.length, passed: 0, skipped: 0, failed: 0, expectedFailure: 0 };
    for (const test of tests) {
        if (test.status === 'passed') totals.passed++;
        else if (test.status === 'skipped') totals.skipped++;
        else if (test.status === 'expected-failure') totals.expectedFailure++;
        else totals.failed++;
    }

    const snapshot = {
        runId: args.run,
        jobId: args.job ?? '',
        suite: args.suite,
        sha: args.sha ?? '',
        event: args.event ?? '',
        createdAt: args.created ?? '',
        source: args.results ? 'playwright-json' : 'ci-log',
        totals,
        reported,
        tests: tests.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const out = path.join(OUT_DIR, `${args.run}-${args.suite}.json`);
    fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`);

    console.log(
        `${path.relative(ROOT, out)} — ${totals.collected} collected · ${totals.passed} passed · ` +
        `${totals.skipped} skipped · ${totals.failed} failed · ${totals.expectedFailure} expected-failure` +
        (Object.keys(reported).length ? `  [reporter: ${JSON.stringify(reported)}]` : ''),
    );
}

main();
