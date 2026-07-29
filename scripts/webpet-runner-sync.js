/**
 * Generates / reconciles the per-test run-control data for the migrated
 * web-pet suite (tests/webpet):
 *
 *   src/data/webpet/webpetRunnerManager.csv   — the AUTHORED file: edit
 *       enabled / testCaseId / notes here (Excel-friendly).
 *   src/data/webpet/webpetRunnerManager.json  — the generated RUNTIME mirror
 *       read by tests/webpet/support/webpet-gate.ts. Never hand-edit; if both
 *       files changed, the CSV wins on sync (same authored-CSV → JSON-mirror
 *       model as src/data/runner/).
 *
 * The source specs carry no testCaseId annotations and many tests are
 * generated in loops, so rows are keyed by the stable identity
 * `<file relative to tests/webpet>::<describe titles > test title>` — computed
 * here from `playwright test --list --reporter=json` and reproduced at runtime
 * by the gate. Each test gets a stable WP-#### id. The id/file/title columns
 * are structural (owned by this script); only enabled/testCaseId/notes are
 * human-owned and survive every sync.
 *
 * Usage:
 *   node scripts/webpet-runner-sync.js           # rediscover tests, merge, write CSV+JSON
 *   node scripts/webpet-runner-sync.js --check   # exit 1 on drift, write nothing
 *   node scripts/webpet-runner-sync.js --mirror  # no test discovery: just re-derive
 *                                                #   the JSON mirror from the CSV
 *                                                #   (fast; safe while a run is live)
 *
 * Merge semantics (write mode):
 *   - existing keys keep their id / enabled / testCaseId / notes
 *   - new keys get the next free WP-#### with enabled=true
 *   - keys that no longer exist are kept but flagged stale=true — review and
 *     delete them manually (deliberately non-destructive).
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Papa = require('papaparse');

const REPO_ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data', 'webpet');
const JSON_FILE = path.join(DATA_DIR, 'webpetRunnerManager.json');
const CSV_FILE = path.join(DATA_DIR, 'webpetRunnerManager.csv');
const CHECK_MODE = process.argv.includes('--check');
const MIRROR_MODE = process.argv.includes('--mirror');

const CSV_FIELDS = ['id', 'file', 'title', 'enabled', 'testCaseId', 'notes', 'stale'];

/** Runs `playwright test --list --reporter=json --project=webpet` and returns the parsed report. */
function listWebpetTests() {
    const cli = path.join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
    // Write the JSON report to a temp file so stray stdout (env loader logs,
    // deprecation warnings) can't corrupt the payload.
    const jsonOut = path.join(os.tmpdir(), `webpet-list-${process.pid}.json`);
    const result = spawnSync(
        process.execPath,
        [cli, 'test', '--list', '--reporter=json', '--project=webpet'],
        {
            cwd: REPO_ROOT,
            encoding: 'utf-8',
            env: {
                ...process.env,
                WEBPET: '1',
                TEST_ENV: process.env.TEST_ENV || 'local',
                PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOut,
            },
        },
    );
    if (result.status !== 0) {
        console.error(result.stdout || '');
        console.error(result.stderr || '');
        throw new Error(`playwright --list failed with exit code ${String(result.status)}`);
    }
    try {
        return JSON.parse(fs.readFileSync(jsonOut, 'utf-8'));
    } finally {
        fs.rmSync(jsonOut, { force: true });
    }
}

/**
 * Normalizes a reporter file path to be relative to tests/webpet with posix
 * separators — matching webpetRunnerKey() in tests/webpet/support/webpet-gate.ts.
 * The JSON reporter emits paths relative to the global testDir ('./tests'), so
 * the usual shape is 'webpet/<spec>'; absolute and repo-relative forms are
 * handled too for robustness.
 */
function normalizeFile(file) {
    const posix = String(file).split(path.sep).join('/').replace(/\\/g, '/');
    const anchored = posix.lastIndexOf('tests/webpet/');
    if (anchored >= 0) return posix.slice(anchored + 'tests/webpet/'.length);
    if (posix.startsWith('webpet/')) return posix.slice('webpet/'.length);
    return posix;
}

/**
 * Walks the JSON report into ordered entries { key, file, title, line, column }.
 * Only specs that run under the `webpet` project are included (the dependency
 * project's webpet.setup.ts is excluded — it is infrastructure, not a test).
 */
function collectEntries(report) {
    const entries = [];

    function walkSuite(suite, describeTitles, fileFromParent) {
        const file = suite.file ?? fileFromParent;
        for (const spec of suite.specs ?? []) {
            const runsInWebpet = (spec.tests ?? []).some((t) => t.projectName === 'webpet');
            if (!runsInWebpet) continue;
            const relFile = normalizeFile(spec.file ?? file);
            const title = [...describeTitles, spec.title].join(' > ');
            entries.push({
                key: `${relFile}::${title}`,
                file: relFile,
                title,
                line: spec.line ?? 0,
                column: spec.column ?? 0,
            });
        }
        for (const child of suite.suites ?? []) {
            walkSuite(child, [...describeTitles, child.title], file);
        }
    }

    for (const fileSuite of report.suites ?? []) {
        // The top-level suite's title is the spec file path — not a describe.
        walkSuite(fileSuite, [], fileSuite.file);
    }

    entries.sort(
        (a, b) =>
            a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
    );
    return entries;
}

function rowKey(row) {
    return `${row.file}::${row.title}`;
}

function loadJsonRows() {
    if (!fs.existsSync(JSON_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
    return parsed.testCases ?? [];
}

/** 'false' / 'no' / '0' (any case) disable a row; everything else runs (fail-open). */
function coerceEnabled(value) {
    return !['false', 'no', '0'].includes(String(value ?? 'true').trim().toLowerCase());
}

function loadCsvRows() {
    if (!fs.existsSync(CSV_FILE)) return null;
    const text = fs.readFileSync(CSV_FILE, 'utf-8').replace(/^﻿/, '');
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
        const first = parsed.errors[0];
        throw new Error(
            `Cannot parse ${CSV_FILE}: ${first.message} (row ${String(first.row)}) — fix the CSV and retry`,
        );
    }
    return parsed.data.map((row) => ({
        id: String(row.id ?? '').trim(),
        file: String(row.file ?? '').trim(),
        title: String(row.title ?? ''),
        enabled: coerceEnabled(row.enabled),
        testCaseId: String(row.testCaseId ?? '').trim(),
        notes: String(row.notes ?? ''),
        stale: String(row.stale ?? '').trim().toLowerCase() === 'true',
    }));
}

/**
 * The authored (human-owned) rows: the CSV when it exists, else the JSON —
 * the JSON-only path exists so the very first sync after this script gains
 * CSV support migrates prior JSON state instead of discarding it.
 */
function loadAuthoredRows() {
    return loadCsvRows() ?? loadJsonRows() ?? [];
}

function nextIdAllocator(rows) {
    let max = 0;
    for (const row of rows) {
        const m = /^WP-(\d+)$/.exec(row.id ?? '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return () => `WP-${String(++max).padStart(4, '0')}`;
}

function toCsvText(testCases) {
    const csv = Papa.unparse(
        {
            fields: CSV_FIELDS,
            data: testCases.map((r) => [
                r.id,
                r.file,
                r.title,
                r.enabled === false ? 'false' : 'true',
                r.testCaseId ?? '',
                r.notes ?? '',
                r.stale ? 'true' : '',
            ]),
        },
        { newline: '\n' },
    );
    return `${csv}\n`;
}

function writeBoth(testCases, liveCount) {
    const payload = {
        metadata: {
            generatedAt: new Date().toISOString(),
            total: liveCount,
            generator: 'scripts/webpet-runner-sync.js',
            authoredFile: 'webpetRunnerManager.csv',
        },
        testCases,
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(JSON_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    fs.writeFileSync(CSV_FILE, toCsvText(testCases));
}

/** Canonical per-row shape for mirror comparison (field order pinned). */
function canonical(row) {
    return JSON.stringify({
        id: row.id ?? '',
        file: row.file ?? '',
        title: row.title ?? '',
        enabled: row.enabled !== false,
        testCaseId: row.testCaseId ?? '',
        notes: row.notes ?? '',
        stale: row.stale === true,
    });
}

/** Order-insensitive CSV ⇄ JSON mirror comparison; returns human-readable problems. */
function mirrorProblems(csvRows, jsonRows) {
    const problems = [];
    const jsonByKey = new Map(jsonRows.map((r) => [rowKey(r), r]));
    for (const row of csvRows) {
        const twin = jsonByKey.get(rowKey(row));
        if (!twin) {
            problems.push(`row only in CSV: ${row.id} ${rowKey(row)}`);
        } else if (canonical(twin) !== canonical(row)) {
            problems.push(`row differs between CSV and JSON: ${row.id} ${rowKey(row)}`);
        }
        jsonByKey.delete(rowKey(row));
    }
    for (const row of jsonByKey.values()) {
        problems.push(`row only in JSON: ${row.id} ${rowKey(row)}`);
    }
    return problems;
}

function runMirror() {
    const csvRows = loadCsvRows();
    if (!csvRows) {
        throw new Error(`${CSV_FILE} does not exist — run: npm run webpet:runner:sync`);
    }
    writeBoth(csvRows, csvRows.filter((r) => !r.stale).length);
    console.log(
        `[webpet-runner-sync] --mirror: rebuilt JSON from CSV (${String(csvRows.length)} rows) — no test discovery performed.`,
    );
}

function runCheck() {
    const jsonRows = loadJsonRows();
    const csvRows = loadCsvRows();
    if (!jsonRows || !csvRows) {
        console.error(
            `[webpet-runner-check] ${!csvRows ? CSV_FILE : JSON_FILE} does not exist — run: npm run webpet:runner:sync`,
        );
        process.exit(1);
    }

    const problems = mirrorProblems(csvRows, jsonRows);

    const report = listWebpetTests();
    const entries = collectEntries(report);
    const authoredByKey = new Map(csvRows.map((r) => [rowKey(r), r]));
    const discoveredKeys = new Set(entries.map((e) => e.key));

    for (const e of entries) {
        if (!authoredByKey.has(e.key)) problems.push(`missing row: ${e.key}`);
    }
    for (const r of csvRows) {
        if (!discoveredKeys.has(rowKey(r)) && r.stale !== true) {
            problems.push(`stale row (test gone/renamed): ${r.id} ${rowKey(r)}`);
        }
    }

    if (problems.length === 0) {
        const staleCount = csvRows.filter((r) => r.stale).length;
        console.log(
            `[webpet-runner-check] OK — ${String(entries.length)} tests all have rows, CSV and JSON agree (${String(staleCount)} known-stale).`,
        );
        return;
    }
    for (const p of problems) console.error(`[webpet-runner-check] ${p}`);
    console.error(
        `[webpet-runner-check] DRIFT — ${String(problems.length)} problem(s). Run: npm run webpet:runner:sync`,
    );
    process.exit(1);
}

function runSync() {
    const report = listWebpetTests();
    const entries = collectEntries(report);
    if (entries.length === 0) {
        throw new Error('No webpet tests discovered — is the webpet project configured?');
    }

    const authored = loadAuthoredRows();
    const authoredByKey = new Map(authored.map((r) => [rowKey(r), r]));
    const discoveredKeys = new Set(entries.map((e) => e.key));

    const newEntries = entries.filter((e) => !authoredByKey.has(e.key));
    const staleRows = authored.filter((r) => !discoveredKeys.has(rowKey(r)));

    const nextId = nextIdAllocator(authored);
    const testCases = entries.map((e) => {
        const prior = authoredByKey.get(e.key);
        return {
            id: prior?.id || nextId(),
            file: e.file,
            title: e.title,
            enabled: prior ? prior.enabled !== false : true,
            testCaseId: prior?.testCaseId ?? '',
            notes: prior?.notes ?? '',
        };
    });
    // Keep vanished rows (flagged) so a rename never silently drops a human's
    // enabled=false / notes state — review and delete manually.
    for (const r of staleRows) {
        testCases.push({ ...r, stale: true });
    }

    writeBoth(testCases, entries.length);
    console.log(
        `[webpet-runner-sync] wrote ${String(testCases.length)} rows ` +
            `(${String(entries.length)} live, ${String(staleRows.length)} stale, ${String(newEntries.length)} new) ` +
            `→ webpetRunnerManager.csv + .json`,
    );
}

if (MIRROR_MODE) {
    runMirror();
} else if (CHECK_MODE) {
    runCheck();
} else {
    runSync();
}
