/**
 * @fileoverview The contribution boundary — what a dev-authored PR may change.
 *
 *   node scripts/contrib/boundary.js                  # vs origin/main
 *   node scripts/contrib/boundary.js --base <ref>     # vs another base
 *   node scripts/contrib/boundary.js --json           # machine-readable
 *
 * Exit 0 when every changed path is inside the boundary, 1 otherwise, naming
 * the paths that fall outside.
 *
 * ## One allowlist, two callers
 *
 * `/dev-feature-test` runs this before opening a PR and CI runs it on the PR,
 * so a contributor sees the same verdict locally that the PR will show. When
 * CI runs it, it runs **the base branch's copy** of this file — otherwise a PR
 * could widen its own allowlist in the same commit that exploits it.
 *
 * ## Why page objects are add-only
 *
 * A contributor may add a page object for a screen that has none: that is new
 * surface area and reviewing it is cheap. Editing an existing one is a
 * framework change — every other spec that uses it inherits the edit, and the
 * blast radius is the whole suite. Same reasoning for the registry: appending a
 * lazy getter is additive, deleting a line is not, so the registry may be
 * modified but a deletion fails.
 */
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const baseIndex = args.indexOf('--base');
const BASE = baseIndex !== -1 ? args[baseIndex + 1] : 'origin/main';

/** Each rule: which paths it covers, and which change kinds it permits. */
const RULES = [
    {
        match: (p) => p.startsWith('tests/contrib/'),
        allow: () => true,
        label: 'tests/contrib/** — any change',
    },
    {
        match: (p) => /^src\/data\/contrib\/contribRunnerManager\.(csv|json)$/.test(p),
        allow: () => true,
        label: 'the contrib runner rows — any change',
    },
    {
        match: (p) => p.startsWith('src/pages/webpet/') || p.startsWith('src/components/webpet/'),
        allow: (status) => status === 'A',
        label: 'page objects / components — ADDED files only',
        deny: 'editing a shared page object changes behaviour for every spec that uses it — ask QA',
    },
    {
        match: (p) => p === 'src/fixtures/webpetPages.fixture.ts',
        allow: (status, stat) => status === 'M' && stat.deletions === 0,
        label: 'the page-object registry — additive edits only',
        deny: 'registering a new page object only ever adds lines; a deletion here removes someone else\'s page object',
    },
];

function git(...argv) {
    return execFileSync('git', argv, { encoding: 'utf8' }).trim();
}

function changedFiles() {
    // `...` compares against the merge base, so commits that landed on the base
    // after the branch started are not reported as the contributor's changes.
    const range = `${BASE}...HEAD`;
    const names = git('diff', '--name-status', range)
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [status, ...rest] = line.split('\t');
            // Renames arrive as `R100\told\tnew` — judge the destination.
            return { status: status[0], path: rest[rest.length - 1] };
        });

    const stats = new Map();
    for (const line of git('diff', '--numstat', range).split('\n').filter(Boolean)) {
        const [added, deleted, ...rest] = line.split('\t');
        stats.set(rest[rest.length - 1], {
            additions: Number(added) || 0,
            deletions: Number(deleted) || 0,
        });
    }

    return names.map((entry) => ({
        ...entry,
        stat: stats.get(entry.path) ?? { additions: 0, deletions: 0 },
    }));
}

function main() {
    let files;
    try {
        files = changedFiles();
    } catch (error) {
        console.error(`Could not diff against '${BASE}': ${String(error.message ?? error)}`);
        console.error('Fetch it first, e.g. `git fetch origin main`.');
        process.exit(1);
    }

    const violations = [];
    for (const file of files) {
        const rule = RULES.find((r) => r.match(file.path));
        if (!rule) {
            violations.push({ ...file, reason: 'outside the contribution boundary' });
        } else if (!rule.allow(file.status, file.stat)) {
            violations.push({ ...file, reason: rule.deny ?? `not permitted by: ${rule.label}` });
        }
    }

    if (JSON_MODE) {
        console.log(JSON.stringify({ base: BASE, changed: files, violations }, null, 2));
        process.exit(violations.length ? 1 : 0);
    }

    if (violations.length === 0) {
        console.log(`[contrib-boundary] OK — ${files.length} changed path(s), all inside the boundary.`);
        return;
    }

    console.error('[contrib-boundary] These paths are outside the contribution boundary:\n');
    for (const v of violations) {
        console.error(`  ${v.status}  ${v.path}\n      ${v.reason}`);
    }
    console.error('\nA contributed PR may change:');
    for (const rule of RULES) console.error(`  - ${rule.label}`);
    console.error(
        '\nIf the work genuinely needs a framework change, stop and raise it with QA ' +
            '— do not work around the boundary (docs/DEV-E2E-CONTRIBUTION.md).',
    );
    process.exit(1);
}

main();
