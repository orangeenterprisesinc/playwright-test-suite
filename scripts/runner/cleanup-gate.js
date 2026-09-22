/**
 * Fails the build when a run's cleanup demonstrably did not work.
 *
 *     npm run cleanup:gate
 *
 * Run 35589360814 reported `candidates 3 / deleted 0` in both sweep phases and the
 * job went green on that part — nothing read the numbers. This reads them.
 *
 * A separate CI step rather than a test, on purpose: a red cleanup gate is a hygiene
 * failure, and mixing it into the suite would have people triaging it as a product bug.
 *
 * It fails only on evidence that cleanup is BROKEN, never on residue that cannot be
 * removed. 409s are expected here — soft-delete and FK rules make some rows permanent
 * — so they warn. A gate that cries wolf on those gets switched off within a fortnight.
 */
const fs = require('node:fs');
const path = require('node:path');

const RESULTS_DIR = path.join('artifacts', 'results');
const DEBT_THRESHOLD = Number(process.env.CLEANUP_DEBT_THRESHOLD ?? 10);

const failures = [];
const warnings = [];
const notes = [];

function read(name) {
    const file = path.join(RESULTS_DIR, name);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (error) {
        warnings.push(`${name} is not readable JSON: ${error.message}`);
        return null;
    }
}

function checkSweep(phase) {
    const s = read(`residue-sweep-${phase}.json`);
    // Absent is not a failure: a suite that creates nothing never writes one, and the
    // standalone tool project skips both phases.
    if (!s) return;
    const t = s.totals ?? {};
    notes.push(
        `residue sweep [${phase}] auth=${s.auth} candidates=${t.candidates ?? 0} deleted=${t.deleted ?? 0} ` +
            `409=${t.conflict ?? 0} stranded=${t.stranded ?? 0} carried-over=${t.carriedOver ?? 0}`,
    );

    if (s.auth !== 'ok' && s.auth !== 'skipped') {
        failures.push(`residue sweep [${phase}]: auth=${s.auth} — it swept nothing, so this run's leftovers are all still there.`);
    }
    // The signature of total failure: it found work and did none of it. `stranded` is
    // excluded because nothing in this repo can clear those rows.
    const clearable = (t.candidates ?? 0) - (t.stranded ?? 0);
    if (clearable > 0 && (t.deleted ?? 0) === 0) {
        failures.push(
            `residue sweep [${phase}]: ${clearable} clearable candidate(s) and 0 deleted. ` +
                `Every delete was refused — see conflictSamples in residue-sweep-${phase}.json.`,
        );
    }
    if ((t.carriedOver ?? 0) > DEBT_THRESHOLD) {
        warnings.push(`residue sweep [${phase}]: ${t.carriedOver} row(s) carried over to the next run (threshold ${DEBT_THRESHOLD}).`);
    }
    if ((t.conflict ?? 0) > 0) {
        warnings.push(`residue sweep [${phase}]: ${t.conflict} unexplained 409(s) — clearable in principle, refused in practice.`);
    }
    if (s.budgetExhausted) warnings.push(`residue sweep [${phase}]: budget exhausted; it did not finish.`);
}

function checkReconcile(phase) {
    const r = read(`fixture-reconcile-${phase}.json`);
    if (!r) return;
    const s = r.sweep ?? {};
    notes.push(
        `fixture reconcile [${phase}] listed=${s.listed ?? 0} matched=${s.matched ?? 0} deleted=${s.deleted ?? 0} ` +
            `employees=${s.employeesResolved ?? '?'}`,
    );

    // Truncated pages read exactly like complete ones, so matching nothing while a page
    // sits on the cap is not "nothing to do" — it is "we could not see it".
    if ((s.matched ?? 0) === 0 && s.capSuspected) {
        failures.push(
            `fixture reconcile [${phase}]: matched 0 while a day hit the page cap — the card list is being truncated, ` +
                'so leftovers are invisible rather than absent.',
        );
    }
    if (s.error) warnings.push(`fixture reconcile [${phase}]: ${s.error}`);
    if (s.budgetExhausted) warnings.push(`fixture reconcile [${phase}]: budget exhausted; the window was not fully swept.`);
}

for (const phase of ['start', 'end']) {
    checkSweep(phase);
    checkReconcile(phase);
}

if (!notes.length) {
    console.log('cleanup gate: no sweep summaries found — nothing to check.');
    process.exit(0);
}

for (const note of notes) console.log(`  ${note}`);
for (const warning of warnings) console.log(`::warning::cleanup gate: ${warning}`);
for (const failure of failures) console.log(`::error::cleanup gate: ${failure}`);

if (failures.length) {
    console.error(`\ncleanup gate FAILED with ${failures.length} problem(s).`);
    process.exit(1);
}
console.log(`\ncleanup gate passed${warnings.length ? ` with ${warnings.length} warning(s)` : ''}.`);
