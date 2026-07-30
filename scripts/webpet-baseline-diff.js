/**
 * Compares a web-pet run against a committed baseline manifest, per test.
 *
 * This is the acceptance gate for a conversion batch. It exists because the
 * suite's headline numbers (362 passed / 18 skipped / 26 failed) are TOTALS,
 * and the ways a POM conversion breaks things are invisible in totals:
 *
 *   - a known-red test still red but for a DIFFERENT reason — a relocated
 *     locator that stopped resolving looks identical to the original assertion
 *     failure in a pass/fail column;
 *   - a test that started skipping because its WP id drifted (coverage lost,
 *     suite still "green");
 *   - one test turning green while another turns red — net zero.
 *
 * Keyed on WP id, so a retitle is not a regression but a lost test is.
 *
 * Usage:
 *   node scripts/webpet-baseline-diff.js <baseline.json> <after-report.json>
 *
 * `<after-report.json>` may be either a raw Playwright JSON report or a
 * manifest already produced by scripts/webpet-baseline.js.
 *
 * Exit 0 = zero blocking rows. Exit 1 = at least one. Non-blocking rows are
 * printed and must be explained in the batch PR body, never ignored — an
 * unexplained failed→passed during a behaviour-preserving move almost always
 * means an assertion stopped executing.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BLOCKING = 'BLOCKING';
const EXPLAIN = 'EXPLAIN';
const OK = 'OK';

/**
 * The verdict table. `before` and `after` are per-test statuses; `sameFp` says
 * whether the normalised failure fingerprints match.
 */
function verdict(before, after, sameFp) {
    const failed = (s) => ['failed', 'timedOut', 'interrupted'].includes(s);

    if (before === after && before === 'passed') return [OK, 'passed → passed'];
    if (before === 'passed' && after !== 'passed') {
        return [BLOCKING, `passed → ${after}`];
    }
    if (failed(before) && after === 'passed') {
        // Not celebrated. During a move that is supposed to preserve behaviour,
        // a test going green usually means its assertion stopped running.
        return [EXPLAIN, `${before} → passed — verify the assertion still executes`];
    }
    if (failed(before) && failed(after)) {
        return sameFp
            ? [OK, 'known failure reproduced']
            : [BLOCKING, `${before} → ${after}, DIFFERENT failure mode`];
    }
    if (before === 'skipped' && after === 'skipped') return [OK, 'skipped → skipped'];
    if (before === 'skipped' && after !== 'skipped') {
        return [EXPLAIN, `skipped → ${after} — a conditional skip stopped firing`];
    }
    if (before !== 'skipped' && after === 'skipped') {
        return [BLOCKING, `${before} → skipped — coverage lost (most likely the WP id drifted)`];
    }
    if (before === 'didNotRun' && failed(after)) {
        return [BLOCKING, 'didNotRun → failed — a serial file now fails earlier'];
    }
    if (before === after) return [OK, `${before} → ${after}`];
    return [EXPLAIN, `${before} → ${after}`];
}

/** Accepts either a manifest or a raw Playwright report; returns the manifest form. */
function loadManifest(file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (parsed.tests && !parsed.suites) return parsed;

    // Raw report — convert it through the capture script so both sides use
    // exactly one implementation of the keying and fingerprint rules.
    const tmp = path.join(os.tmpdir(), `webpet-manifest-${process.pid}.json`);
    execFileSync(process.execPath, [path.join(__dirname, 'webpet-baseline.js'), file, tmp], {
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    try {
        return JSON.parse(fs.readFileSync(tmp, 'utf-8'));
    } finally {
        fs.rmSync(tmp, { force: true });
    }
}

const args = process.argv.slice(2);
const filesFlag = args.find((a) => a.startsWith('--files='));
const [baselinePath, afterPath] = args.filter((a) => !a.startsWith('--'));
if (!baselinePath || !afterPath) {
    console.error('Usage: node scripts/webpet-baseline-diff.js <baseline.json> <after-report.json> [--files=a.spec.ts,b.spec.ts]');
    console.error('');
    console.error('  --files  spec files this run was meant to cover, relative to tests/webpet.');
    console.error('           Defaults to the collected-file set recorded in the run manifest.');
    process.exit(2);
}
for (const f of [baselinePath, afterPath]) {
    if (!fs.existsSync(f)) {
        console.error(`[webpet-diff] not found: ${f}`);
        process.exit(1);
    }
}

const beforeManifest = loadManifest(baselinePath);
const afterManifest = loadManifest(afterPath);
const before = beforeManifest.tests;
const after = afterManifest.tests;

/**
 * The files this run was meant to cover. Taken from the run's COLLECTED file
 * set, not from the files its results happen to mention — otherwise deleting a
 * file's last test makes the file look "not in this batch" and the drop goes
 * unreported, which is precisely the regression the diff exists to catch.
 */
const expectedFiles = new Set(
    filesFlag
        ? filesFlag
              .slice('--files='.length)
              .split(',')
              .map((f) => f.trim())
              .filter(Boolean)
        : (afterManifest.metadata?.files ?? Object.values(after).map((t) => t.file)),
);

const rows = [];
for (const [id, b] of Object.entries(before)) {
    const a = after[id];
    if (!a) {
        // Only meaningful when the run covered that test's file at all — a
        // single-batch run legitimately omits the other 44 files.
        rows.push({ id, level: 'ABSENT', note: 'not present in the run', b, a: null });
        continue;
    }
    const [level, note] = verdict(b.status, a.status, b.fingerprint === a.fingerprint);
    if (level !== OK) rows.push({ id, level, note, b, a });
}
for (const [id, a] of Object.entries(after)) {
    if (!before[id]) {
        rows.push({ id, level: EXPLAIN, note: 'new test — needs a baseline entry', b: null, a });
    }
}

// A batch run only touches some files, so "absent" is normal — unless the file
// WAS collected, in which case the test was dropped or renamed.
const absent = rows.filter((r) => r.level === 'ABSENT');
const blocking = rows.filter((r) => r.level === BLOCKING);
const explain = rows.filter((r) => r.level === EXPLAIN);

const droppedFromCoveredFiles = absent.filter((r) => expectedFiles.has(r.b.file));

console.log(
    `[webpet-diff] baseline ${String(Object.keys(before).length)} tests · run ${String(Object.keys(after).length)} tests · ` +
        `${String(expectedFiles.size)} file(s) collected`,
);

for (const r of droppedFromCoveredFiles) {
    console.error(
        `[webpet-diff] BLOCKING ${r.id} — present in the baseline but missing from the run, ` +
            `and its file (${r.b.file}) WAS covered: the test was dropped or renamed without a row update`,
    );
}
for (const r of blocking) {
    console.error(`[webpet-diff] BLOCKING ${r.id} ${r.b.file} — ${r.note}`);
    if (r.b.fingerprint !== r.a.fingerprint) {
        console.error(`               before: ${r.b.fingerprint || '(none)'}`);
        console.error(`               after:  ${r.a.fingerprint || '(none)'}`);
    }
}
for (const r of explain) {
    console.warn(`[webpet-diff] EXPLAIN  ${r.id} ${(r.b ?? r.a).file} — ${r.note}`);
}

const blockingTotal = blocking.length + droppedFromCoveredFiles.length;
if (blockingTotal === 0 && explain.length === 0) {
    console.log('[webpet-diff] CLEAN — every covered test matches the baseline, status and failure mode.');
    process.exit(0);
}
console.log(
    `[webpet-diff] ${String(blockingTotal)} blocking · ${String(explain.length)} to explain · ` +
        `${String(absent.length - droppedFromCoveredFiles.length)} not covered by this run`,
);
if (blockingTotal > 0) {
    console.error('[webpet-diff] FAILED — the batch is not acceptable until every blocking row is resolved.');
    process.exit(1);
}
console.log('[webpet-diff] No blocking rows. Explain each EXPLAIN row in the batch PR body.');
process.exit(0);
