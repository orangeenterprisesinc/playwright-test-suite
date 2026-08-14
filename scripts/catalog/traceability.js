/**
 * Traceability sheet: every PET-Tiger catalog workflow against the automation
 * that covers it and the run that proves it.
 *
 *     npm run coverage:trace           # regenerate docs/catalog/PET-Tiger-Traceability.{csv,md}
 *     npm run coverage:trace:check     # CI gate — fails on drift or a dead spec path
 *
 * Five sources, joined on the workflow id:
 *
 *   catalog        src/data/catalog/workflow-catalog.json      the 69 rows
 *   judgement      src/data/catalog/workflow-coverage-map.json webpet spec ↔ workflow + depth
 *   journey rows   src/data/runner/*.csv                       already carry a `workflow` column
 *   webpet rows    src/data/webpet/webpetRunnerManager.json     tests per spec file
 *   run evidence   docs/catalog/runs/*.json                     per-test pass/skip/fail
 *
 * `coverage:catalog` answers "what is on the journey backlog"; this answers "what
 * does the catalog actually have behind it, across both suites, and did it run".
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Papa = require('papaparse');

const { ROOT, allRows, loadCatalog, specClaims } = require('../runner/lib/runner-data');

const MAP_FILE = path.join(ROOT, 'src', 'data', 'catalog', 'workflow-coverage-map.json');
const WEBPET_ROWS = path.join(ROOT, 'src', 'data', 'webpet', 'webpetRunnerManager.json');
const RUNS_DIR = path.join(ROOT, 'docs', 'catalog', 'runs');
const OUT_DIR = path.join(ROOT, 'docs', 'catalog');
const CSV_OUT = path.join(OUT_DIR, 'PET-Tiger-Traceability.csv');
const MD_OUT = path.join(OUT_DIR, 'PET-Tiger-Traceability.md');

const DEPTH_RANK = { none: 0, partial: 1, screens: 2, journey: 3 };
const REACHABLE = { ui: 'browser', device: 'device', calc: 'calculation' };

const COLUMNS = [
    'workflow_id', 'journey', 'journey_title', 'title', 'surface', 'reachable', 'modules',
    'catalog_steps', 'coverage_depth', 'suites', 'evidence_specs', 'journey_rows',
    'journey_rows_automated', 'webpet_tests', 'tests_collected', 'passed', 'skipped', 'failed',
    'expected_failure', 'run_state', 'baseline_run', 'note', 'gap', 'next_action',
];

/** Run snapshots written by scripts/catalog/import-run.js, newest name last. */
function loadRuns() {
    if (!fs.existsSync(RUNS_DIR)) return [];
    return fs.readdirSync(RUNS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8')));
}

/**
 * Spec file → workflow ids, for the journey suite. The runner rows own the
 * mapping (`workflow` column) and the specs bind to rows by testCaseId, so the
 * join is rows ▸ claims ▸ file — no second lookup table to keep in step.
 */
function journeyFileWorkflows(rows, claims) {
    const byFile = new Map();
    for (const row of rows) {
        if (!row.workflow) continue;
        for (const file of claims.get(row.id) ?? []) {
            if (!byFile.has(file)) byFile.set(file, new Set());
            byFile.get(file).add(row.workflow);
        }
    }
    return byFile;
}

/** Tallies one workflow's tests out of every run snapshot. */
function tallyFor(files, runs) {
    const tally = { collected: 0, passed: 0, skipped: 0, failed: 0, expectedFailure: 0, runs: new Set() };
    for (const run of runs) {
        for (const test of run.tests) {
            if (!files.has(test.file)) continue;
            tally.collected++;
            tally.runs.add(`${run.runId}/${run.suite}`);
            if (test.status === 'passed') tally.passed++;
            else if (test.status === 'skipped') tally.skipped++;
            else if (test.status === 'expected-failure') tally.expectedFailure++;
            else tally.failed++;
        }
    }
    return tally;
}

/** What the run proves, which is a different question from what is mapped. */
function runState(tally, hasSpecs) {
    if (!hasSpecs) return 'none';
    if (!tally.collected) return 'not-run';
    if (tally.failed) return 'failing';
    if (!tally.passed && !tally.expectedFailure) return 'skipped-only';
    // Worth its own state: "mixed" reads as healthy, and a workflow whose evidence
    // skipped more often than it ran is not evidence of anything much.
    if (tally.skipped >= tally.passed) return 'mostly-skipped';
    if (tally.skipped) return 'mixed';
    return 'passing';
}

function build() {
    const catalog = loadCatalog();
    const map = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')).workflows;
    const rows = allRows();
    const claims = specClaims();
    const runs = loadRuns();
    const webpetRows = JSON.parse(fs.readFileSync(WEBPET_ROWS, 'utf8')).runnerManager;

    const journeyFiles = journeyFileWorkflows(rows, claims);
    const webpetTestsPerFile = new Map();
    for (const row of webpetRows) {
        webpetTestsPerFile.set(row.file, (webpetTestsPerFile.get(row.file) ?? 0) + 1);
    }

    const mappedWebpetFiles = new Set();

    const sheet = catalog.workflows.map((workflow) => {
        const entry = map[workflow.id] ?? { depth: 'none', webpetSpecs: [], note: '', gap: '', next: '' };
        const webpetSpecs = entry.webpetSpecs ?? [];
        webpetSpecs.forEach((spec) => mappedWebpetFiles.add(spec));

        const workflowRows = rows.filter((r) => r.workflow === workflow.id);
        const journeySpecs = [...journeyFiles.entries()]
            .filter(([, ids]) => ids.has(workflow.id))
            .map(([file]) => file);

        const files = new Set([
            ...webpetSpecs.map((spec) => `tests/webpet/${spec}`),
            ...journeySpecs,
        ]);
        const tally = tallyFor(files, runs);

        const automated = workflowRows.filter((r) => r.status === 'automated');

        // Depth is whatever the map says — it is the judgement layer, and this is
        // the only column a human authors.
        //
        // This used to promote to 'journey' automatically whenever automated
        // journey rows existed, on the reasoning that a journey spec is the
        // catalog's own end-to-end shape. That held only while every journey spec
        // was written from the catalog. It stopped being true the moment webpet
        // specs began relocating into the journey suite: they arrive with journey
        // rows but the same screen- or contract-level coverage they always had, so
        // the promotion silently upgraded a workflow to "end-to-end automated" on
        // the strength of a file move. A6 caught it — three device-command
        // contract tests promoted "Biometric enrollment" to journey depth.
        //
        // The staleness this guarded against is caught below instead, by naming
        // the workflow rather than by guessing on its behalf.
        const depth = entry.depth;

        const suites = [journeySpecs.length ? 'journey' : null, webpetSpecs.length ? 'webpet' : null]
            .filter(Boolean).join('+') || '—';

        return {
            workflow_id: workflow.id,
            journey: workflow.journey,
            journey_title: workflow.journeyTitle,
            title: workflow.title,
            surface: workflow.surface,
            reachable: REACHABLE[workflow.surface] ?? workflow.surface,
            modules: (workflow.modules ?? []).join('|'),
            catalog_steps: (workflow.steps ?? []).length,
            coverage_depth: depth,
            suites,
            evidence_specs: [...journeySpecs, ...webpetSpecs.map((s) => `webpet/${s}`)].join(' '),
            journey_rows: workflowRows.length,
            journey_rows_automated: automated.length,
            webpet_tests: webpetSpecs.reduce((sum, spec) => sum + (webpetTestsPerFile.get(spec) ?? 0), 0),
            tests_collected: tally.collected,
            passed: tally.passed,
            skipped: tally.skipped,
            failed: tally.failed,
            expected_failure: tally.expectedFailure,
            run_state: runState(tally, files.size > 0),
            baseline_run: [...tally.runs].join(' '),
            note: entry.note ?? '',
            gap: entry.gap ?? '',
            next_action: entry.next ?? '',
        };
    });

    const unmappedWebpet = [...webpetTestsPerFile.keys()]
        .filter((file) => !mappedWebpetFiles.has(file))
        .sort();

    return { catalog, sheet, runs, unmappedWebpet, webpetTestsPerFile, map };
}

function summarize(sheet) {
    const by = (key) => sheet.reduce((acc, row) => {
        acc[row[key]] = (acc[row[key]] ?? 0) + 1;
        return acc;
    }, {});
    return { depth: by('coverage_depth'), state: by('run_state'), reachable: by('reachable') };
}

function toMarkdown({ catalog, sheet, runs, unmappedWebpet, webpetTestsPerFile }) {
    const summary = summarize(sheet);
    const browser = sheet.filter((r) => r.reachable === 'browser');
    const covered = (list) => list.filter((r) => r.coverage_depth !== 'none').length;
    const proven = sheet.filter((r) => r.run_state === 'passing' || r.run_state === 'mixed').length;
    const thin = (summary.state['mostly-skipped'] ?? 0) + (summary.state['skipped-only'] ?? 0) + (summary.state['not-run'] ?? 0);

    const runLine = (run) => `| ${run.suite} | [${run.runId}](https://github.com/orangeenterprisesinc/playwright-test-suite/actions/runs/${run.runId}) | \`${run.sha.slice(0, 7)}\` | ${run.event} | ${run.createdAt} | ${run.totals.collected} collected · ${run.totals.passed} passed · ${run.totals.skipped} skipped · ${run.totals.failed} failed${run.totals.expectedFailure ? ` · ${run.totals.expectedFailure} expected-failure` : ''} |`;

    const cell = (value) => String(value).replace(/\|/g, '\\|');
    const tableRow = (row) => `| ${COLUMNS.map((c) => cell(row[c])).join(' | ')} |`;

    const totalWebpetTests = [...webpetTestsPerFile.values()].reduce((a, b) => a + b, 0);
    const unmappedTests = unmappedWebpet.reduce((sum, f) => sum + webpetTestsPerFile.get(f), 0);

    return `# PET-Tiger workflow traceability — baseline

Generated by \`npm run coverage:trace\` from
[\`docs/catalog/PET-Tiger-Workflow-Catalog.docx\`](PET-Tiger-Workflow-Catalog.docx)
(via \`src/data/catalog/workflow-catalog.json\`), the runner rows of both suites, and
the pinned run evidence below. Do not edit by hand — edit
\`src/data/catalog/workflow-coverage-map.json\` and regenerate.

## Runs this baseline is pinned to

| Suite | Run | SHA | Trigger | Started | Result |
|---|---|---|---|---|---|
${runs.map(runLine).join('\n')}

Two runs: the scheduled run is the only recent one where the webpet suite executed,
and it predates the journey-B specs reaching \`main\`; the push run is current \`main\`.

## Where the catalog stands

| | Count |
|---|---|
| Catalog workflows | ${sheet.length} |
| Covered to some depth | ${covered(sheet)} (journey ${summary.depth.journey ?? 0}, screens ${summary.depth.screens ?? 0}, partial ${summary.depth.partial ?? 0}) |
| No automation | ${summary.depth.none ?? 0} |
| **Proven by a run** (passing or mixed) | **${proven}** |
| Evidence too thin to count (mostly-skipped / skipped-only / not-run) | ${thin} |
| Failing | ${summary.state.failing ?? 0} |

Reachability splits the backlog — a browser suite cannot reach a kiosk punch or a
payroll calculation:

| Surface | Workflows | Covered |
|---|---|---|
| browser (\`ui\`) | ${browser.length} | ${covered(browser)} |
| device | ${summary.reachable.device ?? 0} | ${covered(sheet.filter((r) => r.reachable === 'device'))} |
| calculation | ${summary.reachable.calculation ?? 0} | ${covered(sheet.filter((r) => r.reachable === 'calculation'))} |

\`coverage_depth\` is what the specs *aim* at; \`run_state\` is what the run *proved*.
They disagree on purpose — a workflow can be mapped to a spec file that skipped
end-to-end on dev staging, and that is the distinction this sheet exists to make.

Test counts are per workflow, and one spec can be evidence for more than one
(\`dashboard.spec.ts\` serves B14 and F1; \`setup-batch-b-smoke.spec.ts\` serves A2, A4
and A5), so the \`tests_collected\` column deliberately does not sum to the run
totals above.

## The sheet

| ${COLUMNS.join(' | ')} |
|${COLUMNS.map(() => '---').join('|')}|
${sheet.map(tableRow).join('\n')}

## webpet tests outside the catalog

${unmappedWebpet.length} of ${webpetTestsPerFile.size} webpet spec files (${unmappedTests} of ${totalWebpetTests} runner rows) map to no catalog workflow. This is
cloud-rebuild surface the PET-Tiger catalog does not describe — inventory,
customer/department/billing, and the shared UI primitives — not wasted coverage.
As each area relocates to \`tests/web/screens/\` it leaves this list; bonus was
the first to go.

${unmappedWebpet.map((f) => `- \`${f}\` (${webpetTestsPerFile.get(f)})`).join('\n')}

---

Journeys: ${catalog.journeys.map((j) => `**${j.id}** ${j.name}`).join(' · ')}
`;
}

function main() {
    const check = process.argv.includes('--check');
    const built = build();
    const problems = [];

    for (const workflow of built.catalog.workflows) {
        if (!built.map[workflow.id]) problems.push(`workflow ${workflow.id} is missing from workflow-coverage-map.json`);
    }
    for (const [id, entry] of Object.entries(built.map)) {
        if (!built.catalog.workflows.some((w) => w.id === id)) problems.push(`map entry ${id} is not a catalog workflow`);
        for (const spec of entry.webpetSpecs ?? []) {
            if (!fs.existsSync(path.join(ROOT, 'tests', 'webpet', spec))) {
                problems.push(`${id}: mapped spec tests/webpet/${spec} does not exist`);
            }
        }
    }

    // Depth is no longer inferred from the presence of automated rows (see build()),
    // so a workflow can now be automated while the map still says nothing covers it.
    // That reads as a coverage gap in every report. Name it instead of guessing.
    for (const row of built.sheet) {
        if (row.journey_rows_automated > 0 && row.coverage_depth === 'none') {
            problems.push(
                `${row.workflow_id}: has ${row.journey_rows_automated} automated journey row(s) but ` +
                `workflow-coverage-map.json still records depth 'none' — set the depth this ` +
                `automation actually reaches (journey / screens / partial).`,
            );
        }
    }

    const csv = Papa.unparse({ fields: COLUMNS, data: built.sheet.map((row) => COLUMNS.map((c) => row[c])) });
    const markdown = toMarkdown(built);

    if (check) {
        for (const [file, next] of [[CSV_OUT, `${csv}\n`], [MD_OUT, markdown]]) {
            const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
            if (current !== next) problems.push(`${path.relative(ROOT, file)} is out of date — run npm run coverage:trace`);
        }
    } else {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(CSV_OUT, `${csv}\n`);
        fs.writeFileSync(MD_OUT, markdown);
    }

    const summary = summarize(built.sheet);
    console.log(`${built.sheet.length} workflows — depth: ${JSON.stringify(summary.depth)}`);
    console.log(`run state: ${JSON.stringify(summary.state)}`);
    if (!check) console.log(`wrote ${path.relative(ROOT, CSV_OUT)} and ${path.relative(ROOT, MD_OUT)}`);

    if (problems.length) {
        console.error(`\n[traceability] ${problems.length} problem(s):`);
        for (const problem of problems) console.error(`  - ${problem}`);
        process.exit(1);
    }
}

main();
