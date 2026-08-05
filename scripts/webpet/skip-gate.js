#!/usr/bin/env node
/**
 * Fails the run when a webpet test is skipped without being accounted for.
 *
 * The point is that skips stop hiding. A green run with 37 skips looks healthy and
 * is not: each one is coverage nobody is watching. Playwright has no fail-on-skip,
 * so this is a post-run gate over the JSON reporter's output.
 *
 * A skip is allowed only when `tests/webpet/skip-allowlist.json` carries a matching
 * entry with a reason AND a ticket/work-item. That file is the burn-down list —
 * every entry is a debt someone owns, and an unlisted skip is a build failure.
 *
 * `didNotRun` counts too: a serial file whose earlier test failed silently drops the
 * rest, and that is exactly the kind of invisible coverage loss this exists to catch.
 *
 * Usage: node scripts/webpet/skip-gate.js [--results <path>] [--allowlist <path>]
 * Exit 0 = every skip accounted for. Exit 1 = unlisted skips, or no results file.
 */
const fs = require('fs');
const path = require('path');

const arg = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const RESULTS = arg('--results', 'artifacts/results/results.json');
const ALLOWLIST = arg('--allowlist', 'tests/webpet/skip-allowlist.json');
const TAG = '[webpet-skip-gate]';

if (!fs.existsSync(RESULTS)) {
    console.error(`${TAG} FAIL — no results at ${RESULTS}. Run the suite first.`);
    process.exit(1);
}

/** Allowlist entries: { match, reason, ticket, expires? }. `match` is a substring of the test title or its testCaseId. */
let allow = [];
if (fs.existsSync(ALLOWLIST)) {
    const parsed = JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8'));
    allow = Array.isArray(parsed) ? parsed : parsed.allow || [];
}

const invalid = allow.filter((a) => !a.match || !a.reason || !a.ticket);
if (invalid.length > 0) {
    console.error(`${TAG} FAIL — ${String(invalid.length)} allowlist entr(ies) missing match/reason/ticket:`);
    for (const a of invalid) console.error(`  ${JSON.stringify(a)}`);
    process.exit(1);
}

const report = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
const skipped = [];

const walk = (suite, file) => {
    const f = suite.file || file || '';
    for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
            if (t.projectName !== 'webpet') continue;
            const results = t.results || [];
            const last = results[results.length - 1];
            const status = last ? last.status : 'didNotRun';
            if (status !== 'skipped' && status !== 'didNotRun') continue;
            const idAnn = (t.annotations || []).find((a) => a.type === 'testCaseId');
            skipped.push({
                id: idAnn ? idAnn.description : '',
                title: spec.title || '',
                file: f,
                status,
            });
        }
    }
    for (const child of suite.suites || []) walk(child, f);
};
for (const s of report.suites || []) walk(s, '');

const matches = (entry, s) =>
    (s.id && s.id === entry.match) ||
    (s.title && s.title.includes(entry.match)) ||
    (s.file && s.file.includes(entry.match));

const unlisted = skipped.filter((s) => !allow.some((a) => matches(a, s)));
const used = new Set();
for (const s of skipped) for (const a of allow) if (matches(a, s)) used.add(a.match);
const stale = allow.filter((a) => !used.has(a.match));

console.log(
    `${TAG} ${String(skipped.length)} skipped/didNotRun · ${String(allow.length)} allowlisted · ${String(unlisted.length)} unlisted`,
);

if (stale.length > 0) {
    // Not a failure: a stale entry usually means someone fixed the test, which is the
    // goal. Surfaced so the allowlist gets pruned instead of growing forever.
    console.log(`${TAG} ${String(stale.length)} allowlist entr(ies) matched nothing — prune if the test is fixed:`);
    for (const a of stale) console.log(`  ${a.match} (${a.ticket})`);
}

if (unlisted.length === 0) {
    console.log(`${TAG} OK — every skip is accounted for.`);
    process.exit(0);
}

console.error(`${TAG} FAIL — ${String(unlisted.length)} skip(s) with no allowlist entry:`);
for (const s of unlisted) {
    console.error(`  ${s.status.padEnd(10)} ${(s.id || '(no id)').padEnd(9)} ${path.basename(s.file)} › ${s.title}`);
}
console.error(
    `\n${TAG} Either make the test run (and fix/ticket what it finds), or add an entry to ${ALLOWLIST} with a reason and a ticket.`,
);
process.exit(1);
