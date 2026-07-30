/**
 * Validates the runner data and its bindings to the specs.
 *
 *     npm run runner:check
 *
 * Runs in CI before `npx playwright test`, because every failure it catches is
 * one that otherwise shows up as a silently-skipped test:
 *
 *   - duplicate row id (two rows, one id — the later wins at random)
 *   - a spec claiming a `testCaseId` with no row (base.fixture skips it)
 *   - an ENABLED row no spec claims (it can never run)
 *   - `category` that disagrees with the spec's folder under tests/
 *   - `workflow`/`journey` that disagrees with the row id, or a workflow that is
 *     not in the catalog
 *   - a segment or module name the catalog does not define (never matches a scope)
 *   - the JSON mirror drifting from the authored CSV
 *
 * A row with `enabled: 0` and no spec is a **reservation** — the backlog entry
 * for a workflow not yet recorded — and is reported, not failed.
 *
 * It also owns the **tag and requirement contract**, because the CSV `tags`
 * column and the tags Playwright actually greps are two different systems and
 * had silently drifted apart: nine rows claimed `regression` while `@Regression`
 * appeared in no spec at all, so `--grep=@Regression` selected nothing. The CSV
 * is the source of truth and these rules keep the spec honest to it:
 *
 *   - the only tags a test may carry are the tier chain (`@Smoke`, `@HighLevel`,
 *     `@Regression`) plus `@Demo` — category lives in the folder, environment in
 *     TEST_ENV, and scope in segments/modules, so a tag repeating any of those
 *     is a fourth copy of a fact nothing validates
 *   - the tiers nest: every test is `@Regression`; `@Smoke` implies `@HighLevel`
 *   - a spec's tier tags must equal the ones its CSV row declares
 *   - at most one `@Smoke` per spec file — the happy path, and only it
 *   - a row a spec claims must cite at least one EARS requirement in `req`, that
 *     requirement must exist in a plan under `specs/`, and the spec's
 *     `requirement` annotation must agree with the row
 */
'use strict';

const {
    runnerFileNames, readCsv, readJson, toJsonText, allRows, loadCatalog, loadScopes,
    specClaims, specTests, planRequirements,
} = require('./lib/runner-data');

const CATEGORIES = ['ui', 'api', 'workflow'];
const STATUSES = ['draft', 'specced', 'ticketed', 'automated'];

/** CSV tier value → the tag Playwright greps for it. Widest tier first. */
const TIERS = [
    ['regression', '@Regression'],
    ['high-level', '@HighLevel'],
    ['smoke', '@Smoke'],
];
const TIER_VALUES = TIERS.map(([value]) => value);
const TIER_TAG = new Map(TIERS);

const TIER_TAG_SET = new Set(TIERS.map(([, tag]) => tag));

/** Tags a `test()` may carry beyond the tier chain. */
const EXTRA_TEST_TAGS = new Set(['@Demo']);

/** Tags a `test.describe()` may carry: the journey, the workflow, or @System. */
const SUITE_TAG = /^@(?:Journey[A-F]|[A-F]\d{1,2}|System)$/;

/**
 * The tier tags a row's `tags` column implies, narrowest first — the order the
 * specs write them in (`['@Smoke', '@HighLevel', '@Regression']`). Only used for
 * reporting; the comparison itself is order-insensitive.
 */
function expectedTierTags(row) {
    return [...TIER_VALUES]
        .reverse()
        .filter((tier) => (row.tags ?? []).includes(tier))
        .map((tier) => TIER_TAG.get(tier));
}

const errors = [];
const warnings = [];
const notes = [];

function fail(message) { errors.push(message); }
function warn(message) { warnings.push(message); }

function main() {
    const catalog = loadCatalog();
    const rows = allRows();
    const claims = specClaims();

    const knownWorkflows = new Map(catalog.workflows.map((w) => [w.id, w]));
    const knownModules = new Set([...catalog.modules, 'core']);
    const knownSegments = new Set([...catalog.segments, 'all']);

    // ── Row-level checks ────────────────────────────────────────────────
    const seen = new Map();
    for (const row of rows) {
        const where = `${row._file} [${row.id || '(no id)'}]`;

        if (!row.id) { fail(`${where}: row has no id`); continue; }
        if (seen.has(row.id)) {
            fail(`Duplicate id '${row.id}' in ${row._file} and ${seen.get(row.id)}`);
        } else {
            seen.set(row.id, row._file);
        }

        if (!CATEGORIES.includes(row.category)) {
            fail(`${where}: category '${row.category}' must be one of ${CATEGORIES.join(', ')}`);
        }
        if (!row.testName) fail(`${where}: testName is empty`);
        if (!row.testTitle) fail(`${where}: testTitle is empty`);
        if (row.status && !STATUSES.includes(row.status)) {
            fail(`${where}: status '${row.status}' must be one of ${STATUSES.join(', ')}`);
        }

        // Catalog rows: id prefix, journey letter and workflow must agree.
        if (row.workflow) {
            const prefix = /^([A-F]\d{1,2})-\d{3}$/.exec(row.id);
            if (!prefix) {
                fail(`${where}: id must look like '<workflow>-001' for a catalog row`);
            } else if (prefix[1] !== row.workflow) {
                fail(`${where}: id prefix '${prefix[1]}' does not match workflow '${row.workflow}'`);
            }
            if (!knownWorkflows.has(row.workflow)) {
                fail(`${where}: workflow '${row.workflow}' is not in the catalog`);
            } else {
                const expectedJourney = knownWorkflows.get(row.workflow).journey;
                if (row.journey !== expectedJourney) {
                    fail(`${where}: journey '${row.journey}' should be '${expectedJourney}' for ${row.workflow}`);
                }
            }
        } else if (row.journey) {
            fail(`${where}: has a journey but no workflow`);
        }

        for (const segment of row.segments ?? []) {
            if (!knownSegments.has(segment)) fail(`${where}: unknown segment '${segment}'`);
        }
        for (const module of row.modules ?? []) {
            if (!knownModules.has(module)) fail(`${where}: unknown module '${module}'`);
        }

        // Tiers: only the three known values, and they nest.
        const tiers = row.tags ?? [];
        for (const tag of tiers) {
            if (!TIER_VALUES.includes(tag)) {
                fail(`${where}: unknown tag '${tag}' — the tags column holds tiers only (${TIER_VALUES.join(', ')})`);
            }
        }
        if (!tiers.includes('regression')) {
            fail(`${where}: every row runs in regression — 'regression' is missing from tags`);
        }
        if (tiers.includes('smoke') && !tiers.includes('high-level')) {
            fail(`${where}: 'smoke' implies 'high-level' — the tiers nest`);
        }

        for (const id of row.req ?? []) {
            if (!/^(?:[A-F]\d{1,2}|UI)-R\d+$/.test(id)) {
                fail(`${where}: req '${id}' must look like 'A1-R4' or 'UI-R2'`);
            }
        }
    }

    // ── Row ⇄ spec binding ──────────────────────────────────────────────
    const reservations = [];
    for (const row of rows) {
        const claimedBy = claims.get(row.id);

        if (!claimedBy) {
            if (row.enabled) {
                fail(`${row._file} [${row.id}]: enabled but no spec claims it — it can never run`);
            } else {
                reservations.push(row);
            }
            continue;
        }

        if (claimedBy.length > 1) {
            warn(`[${row.id}] is claimed by ${claimedBy.length} specs: ${claimedBy.join(', ')}`);
        }

        // The spec's folder under tests/ must match the row's category.
        for (const spec of claimedBy) {
            const folder = spec.split('/')[1];
            if (folder !== row.category) {
                fail(`[${row.id}]: category '${row.category}' but the spec lives in tests/${folder}/ (${spec})`);
            }
        }

        if (row.status !== 'automated') {
            warn(`[${row.id}] is claimed by a spec but status is '${row.status}' — set it to 'automated'`);
        }
    }

    for (const [id, specs] of claims) {
        if (!seen.has(id)) {
            fail(`No runner row for testCaseId '${id}' claimed by ${specs.join(', ')} — add a row or drop the annotation`);
        }
    }

    // ── Tags, tiers and requirements ────────────────────────────────────
    // The CSV is the source of truth; the spec must agree with it. Without this
    // the two tag systems drift and a `--grep` silently selects nothing.
    const requirements = planRequirements();
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const smokeByFile = new Map();
    const suiteTagsChecked = new Set();

    for (const specTest of specTests()) {
        const where = `${specTest.file} [${specTest.testCaseId ?? specTest.title}]`;

        if (!suiteTagsChecked.has(specTest.file)) {
            suiteTagsChecked.add(specTest.file);
            for (const tag of specTest.suiteTags) {
                if (!SUITE_TAG.test(tag)) {
                    fail(`${specTest.file}: describe tag '${tag}' — a describe carries @Journey<X>, @<WF> or @System`);
                }
            }
        }

        for (const tag of specTest.tags) {
            if (!TIER_TAG_SET.has(tag) && !EXTRA_TEST_TAGS.has(tag)) {
                fail(
                    `${where}: tag '${tag}' is not selectable — a test carries the tier chain ` +
                    `(${[...TIER_TAG_SET].join(', ')}) and optionally @Demo. Category is the folder, ` +
                    `environment is TEST_ENV, scope is segments/modules.`,
                );
            }
        }

        if (specTest.tags.includes('@Smoke')) {
            smokeByFile.set(specTest.file, [...(smokeByFile.get(specTest.file) ?? []), specTest.testCaseId]);
        }

        if (!specTest.testCaseId) {
            fail(`${where}: test has no testCaseId annotation — every test binds to a runner row`);
            continue;
        }

        const row = rowsById.get(specTest.testCaseId);
        if (!row) continue; // already reported by the claims check above

        const sorted = (list) => [...list].sort().join('|');

        const expected = expectedTierTags(row);
        const actual = specTest.tags.filter((tag) => TIER_TAG_SET.has(tag));
        if (sorted(expected) !== sorted(actual)) {
            fail(
                `[${row.id}]: tags '${(row.tags ?? []).join('|') || '(none)'}' expect ` +
                `${expected.join(' ') || '(none)'} but the spec has ${actual.join(' ') || '(none)'} (${specTest.file})`,
            );
        }

        if (row.demo && !specTest.tags.includes('@Demo')) {
            fail(`[${row.id}]: row is demo=1, so the test must carry @Demo (${specTest.file})`);
        }

        const rowReqs = row.req ?? [];
        if (!rowReqs.length) {
            fail(`[${row.id}]: claimed by a spec but cites no requirement — fill the 'req' column`);
        }
        for (const id of rowReqs) {
            if (!requirements.has(id)) {
                fail(`[${row.id}]: requirement '${id}' is declared in no plan under specs/`);
            }
        }
        if (sorted(rowReqs) !== sorted(specTest.requirements)) {
            fail(
                `[${row.id}]: requirement annotation '${specTest.requirements.join('|') || '(none)'}' ` +
                `disagrees with the row's req '${rowReqs.join('|') || '(none)'}' (${specTest.file})`,
            );
        }
    }

    for (const [file, ids] of smokeByFile) {
        if (ids.length > 1) {
            fail(`${file}: ${ids.length} tests carry @Smoke (${ids.join(', ')}) — one per file, and it is the happy path`);
        }
    }

    // ── Scope definitions ───────────────────────────────────────────────
    // A scope naming a segment or module the catalog does not define silently
    // matches nothing, which reads as "that workflow is out of scope" forever.
    for (const { name, scope } of loadScopes()) {
        if (!Array.isArray(scope.segments) || !scope.segments.length) {
            fail(`scopes/${name}.json: segments must be a non-empty array`);
        }
        if (!Array.isArray(scope.modules) || !scope.modules.length) {
            fail(`scopes/${name}.json: modules must be a non-empty array`);
        }
        for (const segment of scope.segments ?? []) {
            if (!catalog.segments.includes(segment)) {
                fail(`scopes/${name}.json: unknown segment '${segment}'`);
            }
        }
        for (const module of scope.modules ?? []) {
            if (!knownModules.has(module)) {
                fail(`scopes/${name}.json: unknown module '${module}'`);
            }
        }
        if (scope.confirmed === false) {
            warn(`scopes/${name}.json: confirmed=false — the module list is inferred, not signed off by the account`);
        }
    }

    // ── CSV ⇄ JSON mirror ───────────────────────────────────────────────
    for (const name of runnerFileNames()) {
        const expected = toJsonText(readCsv(name));
        const actual = readJson(name);
        if (actual === null) {
            fail(`${name}.json is missing — run 'npm run runner:sync'`);
        } else if (JSON.stringify({ runnerManager: actual }, null, 4) + '\n' !== expected) {
            fail(`${name}.json has drifted from ${name}.csv — run 'npm run runner:sync'`);
        }
    }

    // ── Coverage note ───────────────────────────────────────────────────
    const catalogRows = rows.filter((r) => r.workflow);
    const coveredWorkflows = new Set(catalogRows.filter((r) => claims.has(r.id)).map((r) => r.workflow));
    notes.push(
        `${rows.length} rows across ${runnerFileNames().length} files; ` +
        `${claims.size} claimed by specs; ${reservations.length} reserved (not yet automated).`,
    );
    notes.push(
        `Catalog coverage: ${coveredWorkflows.size}/${catalog.workflows.length} workflows have at least one automated row.`,
    );

    // ── Report ──────────────────────────────────────────────────────────
    for (const note of notes) console.log(note);
    for (const message of warnings) console.warn(`WARN  ${message}`);
    for (const message of errors) console.error(`ERROR ${message}`);

    if (errors.length) {
        console.error(`\nrunner:check failed with ${errors.length} error(s).`);
        process.exit(1);
    }
    console.log(`\nrunner:check passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
}

main();
