#!/usr/bin/env node
/**
 * Reports every API write a journey run made, and fails on the ones that should have
 * happened on screen.
 *
 * The UI-first rule (.claude/profiles/JOURNEY.md) confines the app's API to four
 * allowances. `src/utils/api/writeGuard.ts` enforces it at run time; this is the
 * post-run read of what it saw. Two sources, because neither alone is complete:
 *
 *   results.json          — `ui-first-violation` annotations, which carry the spec and
 *                           test a violation belongs to
 *   ui-first-w*.jsonl     — the guard's own ledger: every allowed write with its
 *                           reason, plus the violations that happened OUTSIDE a test
 *                           (global setup, teardown, the residue sweep), where there
 *                           is no TestInfo to annotate
 *
 * `--allowed` prints the ledger instead of the failures — that is how a test plan's
 * "API allowances" table gets filled from a real run rather than from memory.
 *
 * Usage: node scripts/runner/ui-first-audit.js [--results <path>] [--ledger-dir <dir>]
 *                                              [--allowed] [--strict]
 * Exit 0 unless violations exist AND (--strict or UI_FIRST_GUARD=enforce) — in warn
 * mode the burn-down is information, not a gate.
 */
const fs = require('fs');
const path = require('path');

const arg = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (flag) => process.argv.includes(flag);

const RESULTS = arg('--results', path.join('artifacts', 'results', 'results.json'));
const LEDGER_DIR = arg('--ledger-dir', path.join('artifacts', 'results'));
const SHOW_ALLOWED = has('--allowed');
const STRICT = has('--strict') || (process.env.UI_FIRST_GUARD || '').toLowerCase() === 'enforce';
const TAG = 'ui-first';

/** Violations found inside a test, via the annotation the guard pushed. */
const inTest = [];
/** Violations with no test around them, from the ledger. */
const outOfTest = [];
/** Declared writes: the (a)/(b)/(c) ledger. */
const allowed = [];

// ── results.json: annotations ────────────────────────────────────────────────
if (fs.existsSync(RESULTS)) {
    const report = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
    const walk = (suite, file) => {
        const f = suite.file || file || '';
        for (const spec of suite.specs || []) {
            for (const t of spec.tests || []) {
                for (const a of t.annotations || []) {
                    if (a.type !== 'ui-first-violation') continue;
                    inTest.push({
                        file: f,
                        title: spec.title || '',
                        project: t.projectName || '',
                        description: a.description || '',
                    });
                }
            }
        }
        for (const child of suite.suites || []) walk(child, f);
    };
    for (const suite of report.suites || []) walk(suite, '');
}

// ── the guard's ledger ───────────────────────────────────────────────────────
if (fs.existsSync(LEDGER_DIR)) {
    for (const name of fs.readdirSync(LEDGER_DIR)) {
        if (!/^ui-first-w.*\.jsonl$/.test(name)) continue;
        const lines = fs.readFileSync(path.join(LEDGER_DIR, name), 'utf8').split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            let entry;
            try {
                entry = JSON.parse(line);
            } catch {
                continue; // a half-written line from a killed worker is not a finding
            }
            if (entry.type === 'allowed') allowed.push(entry);
            else if (!entry.spec) outOfTest.push(entry);
        }
    }
}

// ── report ───────────────────────────────────────────────────────────────────
if (!fs.existsSync(RESULTS) && allowed.length === 0 && outOfTest.length === 0) {
    console.log(`${TAG} audit: no run to read — neither ${RESULTS} nor a guard ledger is present.`);
    process.exit(0);
}

const short = (p) => String(p).replace(/\\/g, '/').replace(/^.*?tests\//, 'tests/');

if (SHOW_ALLOWED) {
    if (allowed.length === 0) {
        console.log(`${TAG} audit: the ledger holds no allowed writes.`);
    } else {
        console.log(`${TAG} allowed writes (${String(allowed.length)}):\n`);
        const byAllowance = {};
        for (const e of allowed) (byAllowance[e.allowance] ||= []).push(e);
        for (const allowance of Object.keys(byAllowance).sort()) {
            console.log(`  ${allowance}`);
            const seen = new Set();
            for (const e of byAllowance[allowance]) {
                // One line per distinct call+reason: a sweep that deletes 40 rows is one
                // allowance, not 40 findings.
                const key = `${e.method} ${e.url} · ${e.reason}`;
                if (seen.has(key)) continue;
                seen.add(key);
                console.log(`    ${e.method.padEnd(6)} ${e.url}  ·  ${e.reason}  [${e.label}]`);
            }
            console.log('');
        }
    }
}

const total = inTest.length + outOfTest.length;

if (total > 0) {
    console.log(`${TAG} violations (${String(total)}):\n`);
    for (const v of inTest) {
        const line = `${short(v.file)} · ${v.title} · ${v.description}`;
        console.log(`  ${line}`);
        console.log(`::${STRICT ? 'error' : 'warning'}::${TAG}: ${line}`);
    }
    for (const v of outOfTest) {
        const line = `<out of test> · ${v.method} ${v.url} · ${v.label} · ${(v.frames || [])[0] || ''}`;
        console.log(`  ${line}`);
        console.log(`::${STRICT ? 'error' : 'warning'}::${TAG}: ${line}`);
    }
    console.log('');
}

const counts = {};
for (const e of allowed) counts[e.allowance] = (counts[e.allowance] || 0) + 1;
const ledger = Object.keys(counts).sort().map((k) => `${k} ${String(counts[k])}`).join(', ') || 'none';
console.log(
    `${TAG} audit: violations ${String(total)} ` +
        `(in-test ${String(inTest.length)}, out-of-test ${String(outOfTest.length)}) · ` +
        `allowed {${ledger}}`,
);

if (total > 0 && STRICT) {
    console.error(`\n${TAG} audit FAILED — ${String(total)} API write(s) belong on screen.`);
    process.exit(1);
}
if (total > 0) {
    console.log(
        `${TAG} audit: warn mode — these are the burn-down, not a gate. ` +
            'Set UI_FIRST_GUARD=enforce or pass --strict to fail on them.',
    );
}
