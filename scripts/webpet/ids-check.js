/**
 * Static integrity gate for the migrated web-pet suite.
 *
 * Pure source analysis — no app stack, no browser, no Playwright discovery — so
 * it can run on any machine, in any state, in a second. That makes it the
 * backbone of the degraded verification path: when the local stack (Vite :3000,
 * Go API :8080, SQL Server, MinIO, Gotenberg) is not up, this plus `typecheck`
 * plus a collection count is everything that can still be proven.
 *
 * What it proves:
 *   1. every WP id claimed by a spec has a row          (else the gate SKIPS it silently)
 *   2. no WP id is claimed by two tests                 (two tests, one enabled flag)
 *   3. every row whose batch has landed (status=automated) is claimed
 *   4. caseKey ⇄ generated-id-map bijection             (a renamed loop key can't orphan a row)
 *   5. no webpet spec imports base.fixture / pages.fixture
 *      — base.fixture resolves ids against src/data/runner/ only, so importing
 *        it would skip all 406 tests while the run reported green
 *   6. no webpet spec carries a journey tag             (npm run test:smoke must not pick it up)
 *   7. no page object / component is named *.spec.ts    (it would be collected as a test)
 *   8. every tests/webpet/(**)/*.setup.ts is claimed by the webpet-setup project
 *   9. no tag is a prefix of another                    (--grep is a substring regex)
 *
 * What it CANNOT prove, and never claims to: that a relocated locator still
 * matches, that an action order survived, that an assertion still runs, or that
 * a conditional skip still fires. Those need the stack.
 *
 * Usage: node scripts/webpet/ids-check.js      (npm run webpet:ids:check)
 */
const fs = require('node:fs');
const path = require('node:path');
const Papa = require('papaparse');

const REPO_ROOT = path.join(__dirname, '..', '..');
const WEBPET_TESTS = path.join(REPO_ROOT, 'tests', 'webpet');
const DATA_DIR = path.join(REPO_ROOT, 'src', 'data', 'webpet');
const IDS_DIR = path.join(DATA_DIR, 'ids');
const CSV_FILE = path.join(DATA_DIR, 'webpetRunnerManager.csv');
const PAGES_DIR = path.join(REPO_ROOT, 'src', 'pages', 'webpet');
const COMPONENTS_DIR = path.join(REPO_ROOT, 'src', 'components', 'webpet');

/**
 * Journey selection tags. A webpet test carrying one of these would be picked
 * up by `npm run test:smoke` (which greps @Smoke with no --project) — and both
 * webpet workflows export WEBPET=1 job-wide, so the projects are materialised.
 * The webpet vocabulary is @WebPet + @wp-* + @WPBatch## instead.
 */
const JOURNEY_TAGS = [
    '@Smoke',
    '@Regression',
    '@UI',
    '@API',
    '@Workflow',
    '@E2E',
    '@Local',
    '@System',
    '@negative',
];

const problems = [];
const fail = (msg) => problems.push(msg);

/** Recursively lists files under `dir` matching `filter`. Returns [] if absent. */
function walk(dir, filter, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, filter, acc);
        else if (filter(entry.name)) acc.push(full);
    }
    return acc;
}

const rel = (file) => path.relative(REPO_ROOT, file).split(path.sep).join('/');
const relSpec = (file) => path.relative(WEBPET_TESTS, file).split(path.sep).join('/');

// ── Load the authored rows ──────────────────────────────────────────────────

if (!fs.existsSync(CSV_FILE)) {
    console.error(`[webpet-ids-check] ${rel(CSV_FILE)} does not exist — run: npm run webpet:runner:sync`);
    process.exit(1);
}
const parsed = Papa.parse(fs.readFileSync(CSV_FILE, 'utf-8').replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
});
if (parsed.errors.length) {
    const first = parsed.errors[0];
    console.error(`[webpet-ids-check] cannot parse the CSV: ${first.message} (row ${String(first.row)})`);
    process.exit(1);
}
const rows = parsed.data.map((r) => ({
    id: String(r.id ?? '').trim(),
    file: String(r.file ?? '').trim(),
    caseKey: String(r.caseKey ?? '').trim(),
    status: String(r.status ?? '').trim(),
    tags: String(r.tags ?? '').trim(),
    stale: String(r.stale ?? '').trim().toLowerCase() === 'true',
}));
const liveRows = rows.filter((r) => !r.stale);
const rowsById = new Map(liveRows.map((r) => [r.id, r]));

// ── Read the generated id maps ──────────────────────────────────────────────

/** { mapFileName → Map<caseKey, WP id> } */
const idMaps = new Map();
for (const file of walk(IDS_DIR, (n) => n.endsWith('Ids.ts'))) {
    const text = fs.readFileSync(file, 'utf-8');
    const entries = new Map();
    for (const m of text.matchAll(/^\s*'([^']+)':\s*'(WP-\d{4})',$/gm)) {
        entries.set(m[1], m[2]);
    }
    idMaps.set(path.basename(file), entries);
}

// ── Scan the specs ──────────────────────────────────────────────────────────

const specFiles = walk(WEBPET_TESTS, (n) => n.endsWith('.spec.ts'));
/** WP id → list of spec files claiming it. */
const claims = new Map();
const claim = (id, file) => {
    if (!claims.has(id)) claims.set(id, []);
    claims.get(id).push(relSpec(file));
};

for (const file of specFiles) {
    const text = fs.readFileSync(file, 'utf-8');
    const specName = relSpec(file);

    // 5 — forbidden fixture imports.
    for (const forbidden of ['@fixtures/base.fixture', '@fixtures/pages.fixture']) {
        if (text.includes(forbidden)) {
            fail(
                `${specName} imports ${forbidden} — webpet specs must use @fixtures/webpet.fixture; ` +
                    `base.fixture resolves ids against src/data/runner/ only and would skip every WP id`,
            );
        }
    }
    if (/from ['"](\.\.\/)*\.\.\/src\/fixtures\/base\.fixture['"]/.test(text)) {
        fail(`${specName} imports base.fixture by relative path — same problem as above`);
    }

    // 6 — journey tag leakage.
    for (const tag of JOURNEY_TAGS) {
        const re = new RegExp(`['"\`]${tag}(?![\\w-])`, 'g');
        if (re.test(text)) {
            fail(
                `${specName} uses the journey tag ${tag} — use the @wp-* vocabulary so ` +
                    `\`npm run test:smoke\` cannot select webpet tests`,
            );
        }
    }

    // 1/2 — literal annotations.
    for (const m of text.matchAll(/description:\s*['"](WP-\d{4})['"]/g)) {
        claim(m[1], file);
    }
    // 1/2 — map-indexed annotations: every id in a map this spec imports.
    for (const m of text.matchAll(/from\s+['"][^'"]*\/ids\/(\w+Ids)['"]/g)) {
        const entries = idMaps.get(`${m[1]}.ts`);
        if (!entries) {
            fail(`${specName} imports the id map '${m[1]}' but src/data/webpet/ids/${m[1]}.ts does not exist`);
            continue;
        }
        for (const id of entries.values()) claim(id, file);
    }
}

// 1 — claimed but no row.
for (const [id, files] of claims) {
    if (!rowsById.has(id)) {
        fail(`${id} is claimed by ${files.join(', ')} but has no live row — the gate would skip it`);
    }
    // 2 — claimed twice. Map-indexed ids legitimately resolve once per spec, so
    // only flag genuinely distinct spec files.
    const distinct = [...new Set(files)];
    if (distinct.length > 1) {
        fail(`${id} is claimed by more than one spec: ${distinct.join(', ')}`);
    }
}

// 3 — a landed batch must be fully annotated.
for (const row of liveRows) {
    if (row.status === 'automated' && !claims.has(row.id)) {
        fail(
            `${row.id} (${row.file}) has status=automated but no spec claims it — ` +
                `its batch is marked done, so the annotation is missing`,
        );
    }
}

// 4 — caseKey ⇄ id-map bijection. Guards the failure mode where someone renames
// a loop's business key: without this the row is orphaned and a fresh WP id is
// allocated, which reads as "still 406 tests, all green".
const mapped = new Map();
for (const [mapFile, entries] of idMaps) {
    for (const [caseKey, id] of entries) {
        const row = rowsById.get(id);
        if (!row) {
            fail(`src/data/webpet/ids/${mapFile}: '${caseKey}' → ${id}, which has no live row`);
            continue;
        }
        if (row.caseKey !== caseKey) {
            fail(
                `src/data/webpet/ids/${mapFile}: '${caseKey}' → ${id}, but that row's caseKey is ` +
                    `'${row.caseKey}' — regenerate with: npm run webpet:runner:ids`,
            );
        }
        if (mapped.has(id)) fail(`${id} appears in two id maps: ${mapped.get(id)} and ${mapFile}`);
        mapped.set(id, mapFile);
    }
}
for (const row of liveRows) {
    if (row.caseKey && !mapped.has(row.id)) {
        fail(
            `${row.id} has caseKey '${row.caseKey}' but appears in no generated id map — ` +
                `run: npm run webpet:runner:ids`,
        );
    }
}

// 9 — prefix collisions between tags.
//
// Playwright's --grep is a plain substring regex over the title path plus tags,
// so a tag that is a prefix of another silently over-selects: `--grep @wp-job`
// once returned job.spec.ts AND job-group.spec.ts, reporting 20 tests for an
// 11-test module. Nothing fails; you just verify the wrong set.
const allTags = new Set();
for (const row of liveRows) {
    for (const tag of String(row.tags ?? '').split('|')) {
        if (tag.trim()) allTags.add(tag.trim());
    }
}
const sortedTags = [...allTags].sort();
for (const tag of sortedTags) {
    for (const other of sortedTags) {
        if (other !== tag && other.startsWith(tag)) {
            fail(
                `tag '${tag}' is a prefix of '${other}' — \`--grep ${tag}\` would select both. ` +
                    `Rename one so neither prefixes the other.`,
            );
        }
    }
}

// 7 — a stray *.spec.ts under the page-object trees would be collected as a test.
for (const dir of [PAGES_DIR, COMPONENTS_DIR]) {
    for (const file of walk(dir, (n) => n.endsWith('.spec.ts'))) {
        fail(`${rel(file)} is named *.spec.ts inside a page-object tree — it would be collected as a test`);
    }
}

// 8 — setup files are exempt from annotation but must be owned by a project.
for (const file of walk(WEBPET_TESTS, (n) => n.endsWith('.setup.ts'))) {
    if (path.basename(file) !== 'webpet.setup.ts') {
        fail(
            `${relSpec(file)} is a setup file the webpet-setup project does not match ` +
                `(testMatch is '**/webpet.setup.ts') — it would never run`,
        );
    }
}

// ── Report ──────────────────────────────────────────────────────────────────

if (problems.length === 0) {
    console.log(
        `[webpet-ids-check] OK — ${String(specFiles.length)} specs, ${String(liveRows.length)} live rows, ` +
            `${String(claims.size)} annotated, ${String(idMaps.size)} id map(s).`,
    );
    process.exit(0);
}
for (const p of problems) console.error(`[webpet-ids-check] ${p}`);
console.error(`[webpet-ids-check] FAILED — ${String(problems.length)} problem(s).`);
process.exit(1);
