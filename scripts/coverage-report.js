/**
 * Automation coverage across the 69 catalog workflows.
 *
 *     npm run coverage:catalog                 # table for every workflow
 *     npm run coverage:catalog -- --journey D  # one journey
 *     npm run coverage:catalog -- --todo       # only what is not automated yet
 *     npm run coverage:catalog -- --scope anthony-vineyards
 *
 * Joins three sources so the backlog is visible in one place:
 *   - the catalog (`src/data/catalog/workflow-catalog.json`) — what exists to cover
 *   - the runner rows (`src/data/runner/*.csv`) — what is planned or automated
 *   - the last run (`test-results/results.json`) — what actually passed
 *
 * Per-workflow state:
 *   not-started  no plan, no spec — a reserved row only
 *   planned      a plan exists under specs/
 *   automated    a spec claims at least one of its rows
 *   passing      every claimed row that ran, passed
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, allRows, loadCatalog, loadScopes, specClaims } = require('./lib/runner-data');

const RESULTS = path.join(ROOT, 'test-results', 'results.json');
const SPECS_DIR = path.join(ROOT, 'specs');

/** Parses `--journey D`, `--scope name`, `--todo`. */
function parseArgs(argv) {
    const args = { journey: null, scope: null, todo: false };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--journey') args.journey = (argv[++i] || '').toUpperCase();
        else if (argv[i] === '--scope') args.scope = argv[++i];
        else if (argv[i] === '--todo') args.todo = true;
    }
    return args;
}

/** Workflow ids that have a plan file under specs/ (matched on the `<wf>-` prefix). */
function plannedWorkflows() {
    const planned = new Set();
    if (!fs.existsSync(SPECS_DIR)) return planned;

    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!entry.name.endsWith('.md') || entry.name.startsWith('_')) continue;
            const match = /^([a-f])(\d{1,2})-/i.exec(entry.name);
            if (match) planned.add(`${match[1].toUpperCase()}${Number(match[2])}`);
        }
    };
    walk(SPECS_DIR);
    return planned;
}

/** Test outcomes from the last run, keyed by the `testCaseId` annotation. */
function lastRunOutcomes() {
    if (!fs.existsSync(RESULTS)) return new Map();

    const outcomes = new Map();
    let report;
    try {
        report = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
    } catch {
        return outcomes;
    }

    const visit = (suite) => {
        for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
                const id = (test.annotations ?? []).find((a) => a.type === 'testCaseId')?.description;
                if (!id) continue;
                const status = test.results?.[test.results.length - 1]?.status ?? 'unknown';
                outcomes.set(id, status);
            }
        }
        for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites ?? []) visit(suite);
    return outcomes;
}

/** Whether a workflow is inside a named scope, mirroring `src/config/scope.ts`. */
function inScope(workflow, scope) {
    if (!scope) return true;

    const expandSegments = (list) => (list.includes('all') ? [...CATALOG_SEGMENTS] : list);
    const expandModules = (list) =>
        list.flatMap((m) => (m === 'core' ? ['Windows', 'Network', 'Real Time'] : [m]));

    const segments = expandSegments(workflow.segments);
    if (segments.length && !segments.some((s) => scope.segments.includes(s))) return false;

    const enabled = new Set(expandModules(scope.modules));
    return expandModules(workflow.modules).every((m) => enabled.has(m));
}

let CATALOG_SEGMENTS = [];

function main() {
    const args = parseArgs(process.argv.slice(2));
    const catalog = loadCatalog();
    CATALOG_SEGMENTS = catalog.segments;

    const rows = allRows();
    const claims = specClaims();
    const planned = plannedWorkflows();
    const outcomes = lastRunOutcomes();

    let scope = null;
    if (args.scope) {
        const found = loadScopes().find((s) => s.name === args.scope);
        if (!found) {
            console.error(`Unknown scope '${args.scope}'. Available: ${loadScopes().map((s) => s.name).join(', ')}`);
            process.exit(1);
        }
        scope = found.scope;
    }

    const report = catalog.workflows
        .filter((w) => !args.journey || w.journey === args.journey)
        .filter((w) => inScope(w, scope))
        .map((workflow) => {
            const workflowRows = rows.filter((r) => r.workflow === workflow.id);
            const claimed = workflowRows.filter((r) => claims.has(r.id));
            const enabled = claimed.filter((r) => r.enabled);
            const ran = claimed.map((r) => outcomes.get(r.id)).filter(Boolean);
            const allPassed = ran.length > 0 && ran.every((s) => s === 'passed' || s === 'expected');

            let state = 'not-started';
            if (claimed.length) state = allPassed ? 'passing' : 'automated';
            else if (planned.has(workflow.id)) state = 'planned';

            return {
                id: workflow.id,
                journey: workflow.journey,
                surface: workflow.surface,
                title: workflow.title,
                rows: workflowRows.length,
                claimed: claimed.length,
                enabled: enabled.length,
                state,
            };
        });

    const shown = args.todo ? report.filter((r) => r.state !== 'passing' && r.state !== 'automated') : report;

    // ── Table ───────────────────────────────────────────────────────────
    const header = ['WF', 'J', 'Surface', 'Rows', 'Spec', 'On', 'State', 'Title'];
    const table = shown.map((r) => [
        r.id, r.journey, r.surface, String(r.rows), String(r.claimed), String(r.enabled), r.state, r.title,
    ]);
    const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
    const line = (cells) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ');

    console.log(line(header));
    console.log(widths.map((w) => '─'.repeat(w)).join('  '));
    for (const row of table) console.log(line(row));

    // ── Summary ─────────────────────────────────────────────────────────
    const count = (state) => report.filter((r) => r.state === state).length;
    console.log('');
    if (scope) console.log(`Scope: ${scope.name} (${report.length}/${catalog.workflows.length} workflows in scope)`);
    if (args.journey) console.log(`Journey: ${args.journey}`);
    console.log(
        `${report.length} workflows — ` +
        `passing ${count('passing')}, automated ${count('automated')}, ` +
        `planned ${count('planned')}, not-started ${count('not-started')}`,
    );
    const covered = count('passing') + count('automated');
    console.log(`Automation coverage: ${covered}/${report.length} (${Math.round((covered / report.length) * 100)}%)`);
    if (!outcomes.size) {
        console.log("No test-results/results.json — run the suite for 'passing' state.");
    }
}

main();
