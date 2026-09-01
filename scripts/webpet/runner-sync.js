/**
 * Generates / reconciles the per-test run-control data for the migrated
 * web-pet suite (tests/webpet):
 *
 *   src/data/webpet/webpetRunnerManager.csv   — the AUTHORED file: edit
 *       enabled / caseKey / module / testName / testDescription / jira /
 *       status / notes here (Excel-friendly).
 *   src/data/webpet/webpetRunnerManager.json  — the generated RUNTIME mirror.
 *       Never hand-edit; if both files changed, the CSV wins on sync (same
 *       authored-CSV → JSON-mirror model as src/data/runner/). Emitted under a
 *       `runnerManager` key so the framework's JsonDataReader can read it.
 *
 * ## Identity: id first, structural key as the fallback
 *
 * The lifted specs carried no annotations and many tests are generated in
 * loops, so rows were originally keyed on
 * `<file relative to tests/webpet>::<describe titles > test title>`.
 * The framework alignment adds `testCaseId` annotations, and conversion also
 * RETITLES tests — which under a purely structural key would allocate a fresh
 * WP id, orphan the old row as stale, and silently drop the human's enabled /
 * notes state. So the merge now prefers the annotation:
 *
 *     prior = byAnnotationId(entry) ?? byStructuralKey(entry)
 *
 * A commit that retitles AND annotates matches on the id; a commit that only
 * retitles still matches structurally. No enabled flag is lost in either order,
 * and ids never renumber (allocation stays max+1).
 *
 * Column ownership:
 *   script-owned, rewritten every sync — file, titlePath, testTitle, tags
 *   human-owned, preserved forever  — enabled, caseKey, module, category,
 *                                     testName, testDescription, jira, status, notes
 *
 * Usage:
 *   node scripts/webpet/runner-sync.js           # rediscover tests, merge, write CSV+JSON
 *   node scripts/webpet/runner-sync.js --check   # exit 1 on drift, write nothing
 *   node scripts/webpet/runner-sync.js --mirror  # no discovery: re-derive JSON from CSV
 *   node scripts/webpet/runner-sync.js --ids     # regenerate src/data/webpet/ids/*.ts
 *
 * Merge semantics (write mode):
 *   - matched rows keep their id and every human-owned column
 *   - new tests get the next free WP-#### with enabled=1
 *   - tests that no longer exist are kept but flagged stale=true — review and
 *     delete them manually (deliberately non-destructive).
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Papa = require('papaparse');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data', 'webpet');
const IDS_DIR = path.join(DATA_DIR, 'ids');
const JSON_FILE = path.join(DATA_DIR, 'webpetRunnerManager.json');
const CSV_FILE = path.join(DATA_DIR, 'webpetRunnerManager.csv');
const CHECK_MODE = process.argv.includes('--check');
const MIRROR_MODE = process.argv.includes('--mirror');
const IDS_MODE = process.argv.includes('--ids');

/** Column order of the authored CSV. Keep in sync with WebpetTestCaseData. */
const CSV_FIELDS = [
    'id',
    'file',
    'titlePath',
    'caseKey',
    'module',
    'category',
    'testName',
    'testTitle',
    'testDescription',
    'tags',
    'jira',
    'status',
    'enabled',
    'notes',
    'stale',
];

/** Columns this script owns and overwrites on every sync. */
const SCRIPT_OWNED = ['file', 'titlePath', 'testTitle', 'tags'];

/** Runs `playwright test --list --reporter=json --project=webpet` and returns the parsed report. */
function listWebpetTests() {
    const cli = path.join(REPO_ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
    // Write the JSON report to a temp file so stray stdout (env loader logs,
    // deprecation warnings) can't corrupt the payload. Also keeps the repo's
    // real artifacts/results/results.json — and the reporter chain's side effects —
    // out of the way: `--reporter=json` replaces the configured list entirely.
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
                TEST_ENV: process.env.TEST_ENV || 'dev',
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
 * separators — matching the structural key computed at runtime by the gate.
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

/** Default `module` for a spec file: 'crop.spec.ts' → 'crop', 'equiv/x.spec.ts' → 'equiv'. */
function deriveModule(relFile) {
    const segments = relFile.split('/');
    if (segments.length > 1) return segments[0];
    return segments[0].replace(/\.spec\.ts$/, '');
}

/**
 * Walks the JSON report into ordered entries. Only specs that run under the
 * `webpet` project are included (the dependency project's webpet.setup.ts is
 * excluded — it is infrastructure, not a test, and is deliberately exempt from
 * both annotation and the gate).
 *
 * Harvests the `testCaseId` annotation and the tags alongside the structural
 * key: the JSON reporter emits `spec.tests[].annotations` and `spec.tags`.
 */
function collectEntries(report) {
    const entries = [];

    function walkSuite(suite, describeTitles, fileFromParent) {
        const file = suite.file ?? fileFromParent;
        for (const spec of suite.specs ?? []) {
            const webpetTest = (spec.tests ?? []).find((t) => t.projectName === 'webpet');
            if (!webpetTest) continue;
            const relFile = normalizeFile(spec.file ?? file);
            const titlePath = [...describeTitles, spec.title].join(' > ');
            const annotationId = String(
                (webpetTest.annotations ?? []).find((a) => a.type === 'testCaseId')?.description ?? '',
            ).trim();
            const tags = (spec.tags ?? []).map((t) => (t.startsWith('@') ? t : `@${t}`));
            entries.push({
                key: `${relFile}::${titlePath}`,
                file: relFile,
                titlePath,
                testTitle: spec.title,
                tags: tags.join('|'),
                annotationId,
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

    entries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
    return entries;
}

function rowKey(row) {
    return `${row.file}::${row.titlePath}`;
}

function loadJsonRows() {
    if (!fs.existsSync(JSON_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
    // `runnerManager` is the framework reader's sheet name; `testCases` is the
    // pre-alignment shape, still accepted so an old mirror can be migrated.
    return parsed.runnerManager ?? parsed.testCases ?? [];
}

/**
 * Reads the authored `enabled` cell.
 *
 * Accepts the framework's 1/0 and the pre-alignment true/false. A BLANK cell is
 * an error, not a default: the framework's MultiFileDataReader coerces blank to
 * `false` while this suite's gate has always been fail-open, so a blank would
 * mean "runs" today and "skips" after the reader swap. `--check` rejects blanks.
 */
function coerceEnabled(value) {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === '') return true; // fail-open at read time; --check reports it
    return !['false', 'no', '0'].includes(text);
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
        // `title` is the pre-alignment column name — read it so the first sync
        // after the schema change migrates rather than orphaning every row.
        titlePath: String(row.titlePath ?? row.title ?? ''),
        caseKey: String(row.caseKey ?? '').trim(),
        module: String(row.module ?? '').trim(),
        category: String(row.category ?? '').trim(),
        testName: String(row.testName ?? '').trim(),
        testTitle: String(row.testTitle ?? ''),
        testDescription: String(row.testDescription ?? ''),
        tags: String(row.tags ?? '').trim(),
        jira: String(row.jira ?? '').trim(),
        status: String(row.status ?? '').trim(),
        enabled: coerceEnabled(row.enabled),
        enabledRaw: String(row.enabled ?? '').trim(),
        notes: String(row.notes ?? ''),
        stale: String(row.stale ?? '').trim().toLowerCase() === 'true',
    }));
}

/**
 * The authored (human-owned) rows: the CSV when it exists, else the JSON — the
 * JSON-only path migrates prior state instead of discarding it.
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
                r.titlePath,
                r.caseKey ?? '',
                r.module ?? '',
                r.category ?? '',
                r.testName ?? '',
                r.testTitle ?? '',
                r.testDescription ?? '',
                r.tags ?? '',
                r.jira ?? '',
                r.status ?? '',
                r.enabled === false ? '0' : '1',
                r.notes ?? '',
                r.stale ? 'true' : '',
            ]),
        },
        { newline: '\n' },
    );
    return `${csv}\n`;
}

/** Strips read-time-only helpers so they never reach the mirror. */
function projectRow(row) {
    return {
        id: row.id,
        file: row.file,
        titlePath: row.titlePath,
        caseKey: row.caseKey ?? '',
        module: row.module ?? '',
        category: row.category ?? '',
        testName: row.testName ?? '',
        testTitle: row.testTitle ?? '',
        testDescription: row.testDescription ?? '',
        tags: row.tags ?? '',
        jira: row.jira ?? '',
        status: row.status ?? '',
        enabled: row.enabled !== false,
        notes: row.notes ?? '',
        ...(row.stale ? { stale: true } : {}),
    };
}

function writeBoth(testCases, liveCount) {
    const payload = {
        metadata: {
            generatedAt: new Date().toISOString(),
            total: liveCount,
            generator: 'scripts/webpet-runner-sync.js',
            authoredFile: 'webpetRunnerManager.csv',
        },
        // `runnerManager` is the sheet name the framework's JsonDataReader looks
        // for (DATA_SHEET_NAME default). The pre-alignment mirror used
        // `testCases`, which that reader cannot parse.
        runnerManager: testCases.map(projectRow),
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(JSON_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    fs.writeFileSync(CSV_FILE, toCsvText(testCases));
}

/** Canonical per-row shape for mirror comparison (field order pinned). */
function canonical(row) {
    return JSON.stringify(projectRow(row));
}

/** Order-insensitive CSV ⇄ JSON mirror comparison; returns human-readable problems. */
function mirrorProblems(csvRows, jsonRows) {
    const problems = [];
    const jsonById = new Map(jsonRows.map((r) => [r.id, r]));
    for (const row of csvRows) {
        const twin = jsonById.get(row.id);
        if (!twin) {
            problems.push(`row only in CSV: ${row.id} ${rowKey(row)}`);
        } else if (canonical(twin) !== canonical(row)) {
            problems.push(`row differs between CSV and JSON: ${row.id} ${rowKey(row)}`);
        }
        jsonById.delete(row.id);
    }
    for (const row of jsonById.values()) {
        problems.push(`row only in JSON: ${row.id} ${rowKey(row)}`);
    }
    return problems;
}

// ── Generated id maps ───────────────────────────────────────────────────────

/** 'bonus-flow.spec.ts' → 'bonusFlow'; 'equiv/foo-bar.spec.ts' → 'equivFooBar'. */
function idsModuleName(relFile) {
    const stem = relFile.replace(/\.spec\.ts$/, '');
    return stem
        .split(/[/\-_.]/)
        .filter(Boolean)
        .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('');
}

/**
 * Builds the text of one generated id map. Rows are keyed by their `caseKey`
 * (a business key such as 'step1:employee' or 'ungated:time-in') — never an
 * array index — so a loop's ids survive re-ordering the case table.
 */
function idsFileText(relFile, rows) {
    const name = `${idsModuleName(relFile)}Ids`;
    const entries = rows
        .slice()
        .sort((a, b) => a.caseKey.localeCompare(b.caseKey))
        .map((r) => `    '${r.caseKey.replace(/'/g, "\\'")}': '${r.id}',`)
        .join('\n');
    return `/**
 * @fileoverview GENERATED — do not edit.
 *
 * Runner ids for tests/webpet/${relFile}, keyed by the business key in the
 * \`caseKey\` column of src/data/webpet/webpetRunnerManager.csv.
 *
 * Regenerate with: npm run webpet:runner:ids
 */
export const ${name} = {
${entries}
} as const;

/** Every business key this spec addresses. */
export type ${name.charAt(0).toUpperCase()}${name.slice(1)}Key = keyof typeof ${name};
`;
}

/** Groups rows with a caseKey by spec file and returns { relPath → text }. */
function buildIdsFiles(rows) {
    const byFile = new Map();
    for (const row of rows) {
        if (!row.caseKey || row.stale) continue;
        if (!byFile.has(row.file)) byFile.set(row.file, []);
        byFile.get(row.file).push(row);
    }
    const files = new Map();
    for (const [relFile, fileRows] of byFile) {
        files.set(`${idsModuleName(relFile)}Ids.ts`, idsFileText(relFile, fileRows));
    }
    return files;
}

function runIds() {
    const rows = loadCsvRows();
    if (!rows) throw new Error(`${CSV_FILE} does not exist — run: npm run webpet:runner:sync`);
    const files = buildIdsFiles(rows);

    fs.mkdirSync(IDS_DIR, { recursive: true });
    const existing = fs.existsSync(IDS_DIR)
        ? fs.readdirSync(IDS_DIR).filter((f) => f.endsWith('Ids.ts'))
        : [];
    for (const orphan of existing.filter((f) => !files.has(f))) {
        fs.rmSync(path.join(IDS_DIR, orphan));
        console.log(`[webpet-runner-sync] --ids: removed orphaned ${orphan}`);
    }
    for (const [name, text] of files) {
        fs.writeFileSync(path.join(IDS_DIR, name), text);
    }
    console.log(
        files.size === 0
            ? '[webpet-runner-sync] --ids: no rows carry a caseKey yet — nothing to generate.'
            : `[webpet-runner-sync] --ids: wrote ${String(files.size)} id map(s) → src/data/webpet/ids/`,
    );
}

/**
 * Line-ending-insensitive text comparison.
 *
 * The generated maps are written with `\n`, but this repo has
 * `core.autocrlf=true` and no `.gitattributes`, so any checkout on Windows
 * rewrites them as CRLF. A raw `!==` then reports all four maps "out of date"
 * on a tree that is byte-for-byte correct — and since `webpet:runner:check` is a
 * blocking CI gate, that failed the **self-hosted Windows** job outright: the
 * one workflow that produces the localhost acceptance baseline. It passed
 * locally right up until a `git checkout` converted the files.
 *
 * Worse, the suggested remedy made it look transient: `webpet:runner:sync`
 * rewrites the files with LF, the check goes green, git reports no change
 * (autocrlf normalises on add), and the next checkout breaks it again.
 *
 * What matters is the content, not how the platform spells a newline.
 */
function sameText(a, b) {
    return a.replace(/\r\n/g, '\n') === b.replace(/\r\n/g, '\n');
}

/** Compares the generated id maps on disk against what the CSV implies. */
function idsDriftProblems(rows) {
    const problems = [];
    const expected = buildIdsFiles(rows);
    const present = fs.existsSync(IDS_DIR)
        ? new Set(fs.readdirSync(IDS_DIR).filter((f) => f.endsWith('Ids.ts')))
        : new Set();

    for (const [name, text] of expected) {
        if (!present.has(name)) {
            problems.push(`id map missing: src/data/webpet/ids/${name}`);
        } else if (!sameText(fs.readFileSync(path.join(IDS_DIR, name), 'utf-8'), text)) {
            problems.push(`id map out of date: src/data/webpet/ids/${name}`);
        }
        present.delete(name);
    }
    for (const orphan of present) {
        problems.push(`id map has no rows behind it: src/data/webpet/ids/${orphan}`);
    }
    return problems;
}

// ── Modes ───────────────────────────────────────────────────────────────────

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

    // Row-level integrity, independent of discovery.
    const seenIds = new Set();
    for (const r of csvRows) {
        if (seenIds.has(r.id)) problems.push(`duplicate row id in CSV: ${r.id}`);
        seenIds.add(r.id);
        if (!/^WP-\d{4}$/.test(r.id)) problems.push(`malformed id: '${r.id}' (${rowKey(r)})`);
        if (!['0', '1'].includes(r.enabledRaw)) {
            problems.push(
                `enabled must be 1 or 0, found '${r.enabledRaw}': ${r.id} — a blank cell means ` +
                    `"runs" to the gate but "skips" to the framework reader`,
            );
        }
    }
    problems.push(...idsDriftProblems(csvRows));

    const report = listWebpetTests();
    const entries = collectEntries(report);
    const authoredById = new Map(csvRows.map((r) => [r.id, r]));
    const authoredByKey = new Map(csvRows.map((r) => [rowKey(r), r]));
    const discoveredKeys = new Set(entries.map((e) => e.key));
    const claimedIds = new Map();

    for (const e of entries) {
        if (e.annotationId) {
            // An annotated test MUST resolve to a row: the fixture's gate treats
            // a claimed id with no row as a configuration error and skips it.
            if (!authoredById.has(e.annotationId)) {
                problems.push(`annotation claims a row that does not exist: ${e.annotationId} (${e.key})`);
            }
            const already = claimedIds.get(e.annotationId);
            if (already) {
                problems.push(`id ${e.annotationId} claimed by two tests: '${already}' and '${e.key}'`);
            }
            claimedIds.set(e.annotationId, e.key);

            const row = authoredById.get(e.annotationId);
            if (row && row.tags !== e.tags) {
                problems.push(
                    `tags drift for ${e.annotationId}: row has '${row.tags}', spec has '${e.tags}'`,
                );
            }
        } else {
            const row = authoredByKey.get(e.key);
            if (!row) {
                problems.push(`missing row: ${e.key}`);
            } else if (row.status === 'automated') {
                // The batch owning this row is marked done, so the annotation
                // should be there. Without it the test runs structurally gated.
                problems.push(
                    `row ${row.id} is status=automated but its test carries no testCaseId annotation: ${e.key}`,
                );
            }
        }
    }
    for (const r of csvRows) {
        const claimedByAnnotation = claimedIds.has(r.id);
        if (!claimedByAnnotation && !discoveredKeys.has(rowKey(r)) && r.stale !== true) {
            problems.push(`stale row (test gone/renamed): ${r.id} ${rowKey(r)}`);
        }
    }

    if (problems.length === 0) {
        const staleCount = csvRows.filter((r) => r.stale).length;
        const annotated = claimedIds.size;
        console.log(
            `[webpet-runner-check] OK — ${String(entries.length)} tests all have rows ` +
                `(${String(annotated)} annotated, ${String(entries.length - annotated)} structural), ` +
                `CSV and JSON agree (${String(staleCount)} known-stale).`,
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
    const authoredById = new Map(authored.filter((r) => r.id).map((r) => [r.id, r]));
    const authoredByKey = new Map(authored.map((r) => [rowKey(r), r]));

    // Id first, structural key second — see the header. A conversion commit that
    // retitles AND annotates matches on the id and keeps every human-owned
    // column; one that only retitles still matches structurally.
    const matched = new Set();
    const resolved = entries.map((entry) => {
        const prior =
            (entry.annotationId && authoredById.get(entry.annotationId)) ||
            authoredByKey.get(entry.key) ||
            null;
        if (prior) matched.add(prior);
        return { entry, prior };
    });

    const staleRows = authored.filter((r) => !matched.has(r));
    const nextId = nextIdAllocator(authored);

    const testCases = resolved.map(({ entry, prior }) => ({
        id: prior?.id || entry.annotationId || nextId(),
        // script-owned
        file: entry.file,
        titlePath: entry.titlePath,
        testTitle: entry.testTitle,
        tags: entry.tags,
        // human-owned (defaults only on first sight)
        caseKey: prior?.caseKey ?? '',
        module: prior?.module || deriveModule(entry.file),
        category: prior?.category || 'ui',
        testName: prior?.testName ?? '',
        testDescription: prior?.testDescription ?? '',
        jira: prior?.jira ?? '',
        status: prior?.status || 'lifted',
        enabled: prior ? prior.enabled !== false : true,
        notes: prior?.notes ?? '',
    }));

    // Keep vanished rows (flagged) so a rename never silently drops a human's
    // enabled=0 / notes state — review and delete manually.
    for (const r of staleRows) {
        testCases.push({ ...r, stale: true });
    }

    writeBoth(testCases, entries.length);

    const annotated = entries.filter((e) => e.annotationId).length;
    const newRows = resolved.filter(({ prior }) => !prior).length;
    console.log(
        `[webpet-runner-sync] wrote ${String(testCases.length)} rows ` +
            `(${String(entries.length)} live, ${String(staleRows.length)} stale, ${String(newRows)} new, ` +
            `${String(annotated)} annotated) → webpetRunnerManager.csv + .json`,
    );
    if (fs.existsSync(IDS_DIR) || testCases.some((r) => r.caseKey)) runIds();
}

if (IDS_MODE) {
    runIds();
} else if (MIRROR_MODE) {
    runMirror();
} else if (CHECK_MODE) {
    runCheck();
} else {
    runSync();
}
