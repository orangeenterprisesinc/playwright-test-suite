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
 */
'use strict';

const {
    runnerFileNames, readCsv, readJson, toJsonText, allRows, loadCatalog, loadScopes, specClaims,
} = require('./lib/runner-data');

const CATEGORIES = ['ui', 'api', 'workflow'];
const STATUSES = ['draft', 'specced', 'ticketed', 'automated'];

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
