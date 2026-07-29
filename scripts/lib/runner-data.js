/**
 * Shared loader for the runner data under `src/data/runner/`, used by
 * `runner-sync.js`, `check-runner.js` and `coverage-report.js`.
 *
 * Rows are authored per journey in CSV (Excel-friendly, one file per journey so
 * two people adding specs never conflict). The matching `.json` file is a
 * generated mirror for `TEST_DATA_SOURCE=json` — `npm run runner:sync` writes it
 * and `npm run runner:check` proves the two agree. Tests always read one format
 * directly at runtime; there is no conversion in the test path.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Papa = require('papaparse');

const ROOT = path.join(__dirname, '..', '..');
const RUNNER_DIR = path.join(ROOT, 'src', 'data', 'runner');
const CATALOG = path.join(ROOT, 'src', 'data', 'catalog', 'workflow-catalog.json');
const TESTS_DIR = path.join(ROOT, 'tests');

/** Column order for the CSV files and the generated JSON. */
const COLUMNS = [
    'id', 'workflow', 'journey', 'category', 'testName', 'testTitle', 'testDescription',
    'segments', 'modules', 'tags', 'demo', 'jira', 'status', 'enabled',
];

/** Columns holding pipe-delimited multi-values. */
const ARRAY_COLUMNS = ['segments', 'modules', 'tags'];

/** Columns holding 1/0 booleans. */
const BOOLEAN_COLUMNS = ['demo', 'enabled'];

/** Fields always written to JSON, even when empty. */
const REQUIRED_JSON_FIELDS = new Set(['id', 'category', 'testName', 'testTitle', 'status', 'enabled']);

/** Every `<name>` for which a `<name>.csv` exists in the runner directory. */
function runnerFileNames() {
    return fs
        .readdirSync(RUNNER_DIR)
        .filter((file) => file.endsWith('.csv'))
        .map((file) => path.basename(file, '.csv'))
        .sort();
}

/** Turns a raw CSV cell map into a typed runner row. */
function coerceRow(raw) {
    const row = {};
    for (const column of COLUMNS) {
        const value = (raw[column] ?? '').toString().trim();

        if (ARRAY_COLUMNS.includes(column)) {
            const items = value.split('|').map((v) => v.trim()).filter(Boolean);
            if (items.length) row[column] = items;
        } else if (BOOLEAN_COLUMNS.includes(column)) {
            row[column] = value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
        } else if (value !== '' || REQUIRED_JSON_FIELDS.has(column)) {
            row[column] = value;
        }
    }
    return row;
}

/** Reads one journey's CSV into typed rows. */
function readCsv(name) {
    const file = path.join(RUNNER_DIR, `${name}.csv`);
    const parsed = Papa.parse(fs.readFileSync(file, 'utf8'), {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header) => header.trim(),
    });
    if (parsed.errors.length) {
        const detail = parsed.errors.map((e) => `${e.row}: ${e.message}`).join('; ');
        throw new Error(`${name}.csv failed to parse — ${detail}`);
    }
    return parsed.data.map(coerceRow);
}

/** Reads one journey's generated JSON mirror, or `null` if it does not exist. */
function readJson(name) {
    const file = path.join(RUNNER_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed.runnerManager ?? [];
}

/** Serialises typed rows to the JSON mirror's text, omitting empty optionals. */
function toJsonText(rows) {
    const projected = rows.map((row) => {
        const out = {};
        for (const column of COLUMNS) {
            const value = row[column];
            if (REQUIRED_JSON_FIELDS.has(column)) {
                out[column] = value;
            } else if (Array.isArray(value)) {
                if (value.length) out[column] = value;
            } else if (typeof value === 'boolean') {
                if (value) out[column] = value;
            } else if (value !== undefined && value !== '') {
                out[column] = value;
            }
        }
        return out;
    });
    return `${JSON.stringify({ runnerManager: projected }, null, 4)}\n`;
}

/** All rows across every runner file, tagged with the file they came from. */
function allRows() {
    return runnerFileNames().flatMap((name) =>
        readCsv(name).map((row) => ({ ...row, _file: `${name}.csv` })),
    );
}

/** The parsed workflow catalog. */
function loadCatalog() {
    return JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
}

/** Every committed customer scope in `src/data/scopes/`. */
function loadScopes() {
    const dir = path.join(ROOT, 'src', 'data', 'scopes');
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => ({
            name: path.basename(file, '.json'),
            scope: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')),
        }));
}

/**
 * Test trees this validator does not own.
 *
 * `tests/webpet` is the migrated web-pet suite: it runs under its own opt-in
 * Playwright project and has its own row data and checker (`webpet:runner:check`),
 * so its `testCaseId`s must not be measured against `src/data/runner/`.
 */
const EXCLUDED_TEST_DIRS = new Set(['webpet']);

/**
 * Every `*.spec.ts` under `tests/`, excluding the trees listed in
 * {@link EXCLUDED_TEST_DIRS}. Paths are absolute.
 */
function specFiles(dir = TESTS_DIR) {
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
    return entries.flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (dir === TESTS_DIR && EXCLUDED_TEST_DIRS.has(entry.name)) return [];
            return specFiles(full);
        }
        return entry.name.endsWith('.spec.ts') ? [full] : [];
    });
}

/**
 * Maps every runner id claimed by a spec to the spec that claims it. Recognises
 * both binding styles the suite uses: a per-test
 * `annotation: { type: 'testCaseId', description: 'A1-001' }` and a
 * `test.use({ testCaseId: 'A1-001' })` option.
 */
function specClaims() {
    const claims = new Map();
    for (const file of specFiles()) {
        const source = fs.readFileSync(file, 'utf8');
        const relative = path.relative(ROOT, file).split(path.sep).join('/');
        const patterns = [
            /type:\s*'testCaseId'\s*,\s*description:\s*'([^']+)'/g,
            /testCaseId:\s*'([^']+)'/g,
        ];
        for (const pattern of patterns) {
            for (const match of source.matchAll(pattern)) {
                if (!claims.has(match[1])) claims.set(match[1], []);
                claims.get(match[1]).push(relative);
            }
        }
    }
    return claims;
}

module.exports = {
    ROOT,
    RUNNER_DIR,
    COLUMNS,
    runnerFileNames,
    readCsv,
    readJson,
    toJsonText,
    allRows,
    loadCatalog,
    specFiles,
    specClaims,
    loadScopes,
};
