/**
 * @fileoverview Runner rows for the developer-contribution lane.
 *
 *   node scripts/contrib/runner-sync.js           # rewrite the CSV + JSON from the specs
 *   node scripts/contrib/runner-sync.js --check    # exit 1 on drift, write nothing
 *
 * ## Why this is static
 *
 * It parses `tests/contrib/*.spec.ts` as text — the same `specTests()` reader
 * the journey checker uses — and never launches a browser or Playwright. PR CI
 * runs `--check` on every contributed PR, so it has to be fast and to work
 * without dev-staging credentials.
 *
 * ## Which columns are whose
 *
 * Script-owned (rewritten from the spec every sync, hand-edits reverted):
 *   id, jira, file, category, testName, testTitle, tags
 * Human-owned (preserved across syncs, keyed by id):
 *   owner, enabled, notes
 *
 * `owner` is the one that matters: it is the GitHub handle QA asks when a
 * contrib spec goes red in the nightly lane, and nothing can derive it.
 *
 * ## What --check enforces beyond drift
 *
 * 1. Filename is `<TICKET-KEY>-<slug>.spec.ts`.
 * 2. Every test carries a `testCaseId`, formatted `<TICKET-KEY>-<nn>`, unique,
 *    and its key matches the filename's.
 * 3. Describe tags are exactly `@Contrib` + `@<TICKET-KEY>`; test tags are
 *    exactly one surface (`@wp-ui`/`@wp-api`) and one tier
 *    (`@wp-smoke`/`@wp-regression`/`@wp-negative`). Journey tags are rejected —
 *    they belong to the catalog vocabulary `scripts/runner/check.js` owns.
 * 4. The spec imports `@fixtures/contrib.fixture`. Importing `base` or `webpet`
 *    instead is the one mistake that fails silently at run time: the wrong gate
 *    finds no row for the id and skips the test green.
 * 5. Rows and specs are a bijection — no orphan rows, no unclaimed tests.
 * 6. The JSON mirror equals the CSV.
 */
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { ROOT, specTests } = require('../runner/lib/runner-data');

const CHECK_MODE = process.argv.includes('--check');

const CONTRIB_TESTS_DIR = path.join(ROOT, 'tests', 'contrib');
const DATA_DIR = path.join(ROOT, 'src', 'data', 'contrib');
const CSV_FILE = path.join(DATA_DIR, 'contribRunnerManager.csv');
const JSON_FILE = path.join(DATA_DIR, 'contribRunnerManager.json');

const COLUMNS = ['id', 'jira', 'file', 'category', 'testName', 'testTitle', 'tags', 'owner', 'enabled', 'notes'];
const SCRIPT_OWNED = ['jira', 'file', 'category', 'testName', 'testTitle', 'tags'];

const FILENAME = /^([A-Z][A-Z0-9_]+-\d+)-[a-z0-9-]+\.spec\.ts$/;
const CASE_ID = /^([A-Z][A-Z0-9_]+-\d+)-(\d{2})$/;
const SURFACE_TAGS = ['@wp-ui', '@wp-api'];
const TIER_TAGS = ['@wp-smoke', '@wp-regression', '@wp-negative'];
const JOURNEY_TAG = /^@(?:Journey[A-F]|[A-F]\d{1,2}|System|Smoke|HighLevel|Regression|Demo)$/;
const REQUIRED_IMPORT = '@fixtures/contrib.fixture';

const problems = [];
const fail = (message) => problems.push(message);

/** The surface tag decides the framework category — `@wp-api` is browserless. */
function categoryFor(tags) {
    return tags.includes('@wp-api') ? 'api' : 'ui';
}

/** camelCase testName from the title, mirroring how the webpet sync derives one. */
function testNameFrom(title) {
    const words = title
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/[^A-Za-z0-9 ]/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return 'contribTest';
    return words
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
        .join('')
        .slice(0, 60);
}

function readCsvRows() {
    if (!fs.existsSync(CSV_FILE)) return [];
    const text = fs.readFileSync(CSV_FILE, 'utf8').trim();
    if (text === '') return [];
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) {
        fail(`contribRunnerManager.csv failed to parse — ${parsed.errors[0].message}`);
        return [];
    }
    return parsed.data;
}

function toCsvText(rows) {
    const body = rows.map((row) => COLUMNS.map((c) => row[c] ?? '').map(csvCell).join(','));
    return `${[COLUMNS.join(','), ...body].join('\n')}\n`;
}

function csvCell(value) {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Collects every contrib spec's tests and validates the lane's own rules. */
function collect() {
    const files = fs.existsSync(CONTRIB_TESTS_DIR)
        ? fs.readdirSync(CONTRIB_TESTS_DIR).filter((f) => f.endsWith('.spec.ts'))
        : [];

    const rows = [];
    const seenIds = new Set();

    for (const file of files) {
        const match = FILENAME.exec(file);
        if (!match) {
            fail(`${file}: filename must be <TICKET-KEY>-<slug>.spec.ts (e.g. WEBPET-123-employee-badge.spec.ts)`);
            continue;
        }
        const ticketKey = match[1];

        const source = fs.readFileSync(path.join(CONTRIB_TESTS_DIR, file), 'utf8');
        if (!source.includes(REQUIRED_IMPORT)) {
            fail(
                `${file}: must import from '${REQUIRED_IMPORT}'. A base/webpet import resolves ids ` +
                    `against the wrong row source, so every test in this file would SKIP GREEN.`,
            );
        }

        // specTests() walks from a root; give it this directory only.
        const tests = specTests(CONTRIB_TESTS_DIR).filter((t) => t.file.endsWith(`/${file}`));
        if (tests.length === 0) {
            fail(`${file}: no test() with an options object was found — the lane requires tags and a testCaseId`);
            continue;
        }

        for (const test of tests) {
            const suite = [...test.suiteTags].sort();
            const expectedSuite = ['@Contrib', `@${ticketKey}`].sort();
            if (suite.join(',') !== expectedSuite.join(',')) {
                fail(
                    `${file} › "${test.title}": describe tags must be exactly ` +
                        `['@Contrib', '@${ticketKey}'] — found [${test.suiteTags.join(', ') || 'none'}]`,
                );
            }

            const journeyTag = [...test.tags, ...test.suiteTags].find((t) => JOURNEY_TAG.test(t));
            if (journeyTag) {
                fail(
                    `${file} › "${test.title}": '${journeyTag}' belongs to the journey vocabulary — ` +
                        `contrib specs use @wp-* tags`,
                );
            }

            const surfaces = test.tags.filter((t) => SURFACE_TAGS.includes(t));
            const tiers = test.tags.filter((t) => TIER_TAGS.includes(t));
            if (surfaces.length !== 1) {
                fail(`${file} › "${test.title}": exactly one of ${SURFACE_TAGS.join('/')} required`);
            }
            if (tiers.length !== 1) {
                fail(`${file} › "${test.title}": exactly one of ${TIER_TAGS.join('/')} required`);
            }

            const caseId = test.testCaseId;
            if (!caseId) {
                fail(`${file} › "${test.title}": missing a testCaseId annotation`);
                continue;
            }
            const idMatch = CASE_ID.exec(caseId);
            if (!idMatch) {
                fail(`${file} › "${test.title}": testCaseId '${caseId}' must look like ${ticketKey}-01`);
                continue;
            }
            if (idMatch[1] !== ticketKey) {
                fail(
                    `${file} › "${test.title}": testCaseId '${caseId}' does not match the file's ticket ` +
                        `key '${ticketKey}'`,
                );
                continue;
            }
            if (seenIds.has(caseId)) {
                fail(`Duplicate testCaseId '${caseId}'`);
                continue;
            }
            seenIds.add(caseId);

            rows.push({
                id: caseId,
                jira: ticketKey,
                file,
                category: categoryFor(test.tags),
                testName: testNameFrom(test.title),
                testTitle: test.title,
                tags: test.tags.join('|'),
            });
        }
    }

    rows.sort((a, b) => a.id.localeCompare(b.id));
    return rows;
}

/** Merges derived columns over the human-owned ones carried by id. */
function merge(derived, existing) {
    const byId = new Map(existing.map((row) => [row.id, row]));
    return derived.map((row) => {
        const prior = byId.get(row.id);
        return {
            ...row,
            owner: prior?.owner ?? '',
            enabled: prior?.enabled ?? '1',
            notes: prior?.notes ?? '',
        };
    });
}

function main() {
    const derived = collect();
    const existing = readCsvRows();
    const merged = merge(derived, existing);

    const derivedIds = new Set(merged.map((r) => r.id));
    for (const row of existing) {
        if (!derivedIds.has(row.id)) {
            const message = `Row '${row.id}' has no test claiming it — the spec was renamed or deleted`;
            if (CHECK_MODE) fail(message);
            else console.log(`[contrib-runner-sync] dropped orphaned row ${row.id}`);
        }
    }

    // Only a gate, never a blocker on generation: the row has to exist before a
    // human can fill its owner, so `sync` creates it empty and warns, and
    // `--check` is what refuses to let it merge that way.
    for (const row of merged) {
        if (!row.owner) {
            const message = `Row '${row.id}': the 'owner' column is empty — set the contributor's GitHub handle`;
            if (CHECK_MODE) fail(message);
            else console.warn(`[contrib-runner-sync] WARN ${message}`);
        }
    }

    const csvText = toCsvText(merged);
    const payload = {
        metadata: {
            generatedAt: new Date().toISOString(),
            total: merged.length,
            generator: 'scripts/contrib/runner-sync.js',
            authoredFile: 'contribRunnerManager.csv',
        },
        contribRunnerManager: merged.map((row) => ({
            ...row,
            tags: row.tags ? row.tags.split('|') : [],
            enabled: String(row.enabled) === '1',
        })),
    };

    if (CHECK_MODE) {
        const onDiskCsv = fs.existsSync(CSV_FILE) ? fs.readFileSync(CSV_FILE, 'utf8') : '';
        if (onDiskCsv !== csvText) {
            fail('contribRunnerManager.csv is out of date — run `npm run contrib:runner:sync`');
        }
        // Compare everything but the timestamp, which changes on every run.
        const onDiskJson = fs.existsSync(JSON_FILE)
            ? JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))
            : null;
        if (
            JSON.stringify(onDiskJson?.contribRunnerManager ?? null) !==
            JSON.stringify(payload.contribRunnerManager)
        ) {
            fail('contribRunnerManager.json does not mirror the CSV — run `npm run contrib:runner:sync`');
        }

        if (problems.length) {
            for (const problem of problems) console.error(`ERROR ${problem}`);
            console.error(`\ncontrib:runner:check failed with ${problems.length} error(s).`);
            process.exit(1);
        }
        console.log(`[contrib-runner-check] OK — ${merged.length} row(s), CSV and JSON agree.`);
        return;
    }

    if (problems.length) {
        for (const problem of problems) console.error(`ERROR ${problem}`);
        console.error('\nFix the errors above; nothing was written.');
        process.exit(1);
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CSV_FILE, csvText);
    fs.writeFileSync(JSON_FILE, `${JSON.stringify(payload, null, 2)}
`);
    console.log(`[contrib-runner-sync] wrote ${merged.length} row(s) to contribRunnerManager.csv + .json`);
}

main();
