#!/usr/bin/env node
/**
 * @fileoverview Proves the web-pet conversion's core invariant: **locators were
 * relocated, never rewritten, and no assertion was lost.**
 *
 * The framework alignment moved 406 tests off inline selectors and onto page
 * objects. Every high-impact way that can go wrong reports **green**: a locator
 * that no longer matches makes a test skip or pass vacuously; a dropped
 * assertion turns a real check into a no-op. Neither shows up in a pass/fail
 * column, and neither is caught by `webpet:ids:check` or `webpet:runner:check` —
 * those verify identity and bookkeeping, not behaviour.
 *
 * This script compares every converted spec against its **pre-conversion form**
 * at the `webpet-lift-v1` tag and reports two things:
 *
 * 1. **Selector preservation** — every selector token the original spec used
 *    must still appear, verbatim or as a template that reconstructs it, in the
 *    converted spec or the framework tree it moved into.
 * 2. **Assertion preservation** — per-file `expect()` counts and matcher
 *    composition must be unchanged. Losing a `toBeDisabled` while gaining a
 *    `toBeVisible` is a weakened assertion even at a constant count.
 *
 * ## What this is and is not
 *
 * It is a **necessary** condition, not a sufficient one. A token can survive and
 * still be wired to the wrong element; only a run against the seeded stack and a
 * per-test baseline diff can prove that (see tests/webpet/README.md). But a
 * vanished token or a missing assertion is always a defect or an explainable
 * deliberate change — never noise to wave through.
 *
 * Findings are reported, not failed on: several legitimate reconstructions
 * (a template hole in the middle of a selector, a `new RegExp()` built from a
 * variable) are beyond static reach. Exit code is 1 only for **assertion**
 * regressions, which have no legitimate cause.
 *
 * ```sh
 * npm run webpet:audit                    # against webpet-lift-v1
 * npm run webpet:audit -- --ref=<gitref>  # against any other baseline
 * npm run webpet:audit -- --verbose       # list clean files too
 * ```
 *
 * @module scripts/webpet-audit-relocation
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const refArg = argv.find((a) => a.startsWith('--ref='));
const BASE_REF = refArg ? refArg.slice('--ref='.length) : 'webpet-lift-v1';

/** Where a relocated selector is allowed to have moved to. */
const HAYSTACK_DIRS = [
    'src/pages/webpet',
    'src/components/webpet',
    'src/data/webpet',
    'src/config',
    'src/fixtures',
];

const MATCHERS = [
    'toBeVisible', 'toBeHidden', 'toBeEnabled', 'toBeDisabled', 'toHaveText',
    'toContainText', 'toHaveValue', 'toHaveCount', 'toHaveAttribute', 'toHaveURL',
    'toHaveClass', 'toBeChecked', 'toBeAttached', 'toBeFocused', 'toBeTruthy',
    'toBeFalsy', 'toBe', 'toEqual', 'toContain', 'toBeGreaterThan', 'toBeLessThan',
    'toBeNull', 'toHaveJSProperty', 'toHaveLength', 'toBeUndefined',
];

// ── helpers ──────────────────────────────────────────────────────────

function walk(dir, out = []) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return out;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = path.posix.join(dir, e.name);
        if (e.isDirectory()) walk(rel, out);
        else if (e.name.endsWith('.ts')) out.push(rel);
    }
    return out;
}

/**
 * Strip comments without eating code.
 *
 * A regex stripper is unsound here: these specs are full of glob patterns like
 * `'**{}/setup/billing-centers/**'`, whose `/**` opens a block comment and whose
 * `**{}/` closes one, so `/\/\*[\s\S]*?\*\//g` silently deletes everything
 * between two unrelated `waitForURL` calls. That is exactly how the first cut of
 * this audit reported three phantom dropped assertions in billing-center.spec.ts.
 * So: one left-to-right pass that knows about string and template literals.
 */
function stripComments(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        const next = src[i + 1];
        if (c === '/' && next === '/') {
            while (i < n && src[i] !== '\n') i++;
            continue;
        }
        if (c === '/' && next === '*') {
            i += 2;
            while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
            i += 2;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            const quote = c;
            out += c;
            i++;
            while (i < n) {
                if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
                out += src[i];
                if (src[i] === quote) { i++; break; }
                i++;
            }
            continue;
        }
        out += c;
        i++;
    }
    return out;
}

// A string literal in any of the three quote styles. Each branch excludes only
// ITS OWN quote, so `'[data-testid="x"]'` captures the whole selector. An
// earlier cut used `[^'"`]+`, which stopped at the inner double quote and
// captured the useless prefix `[data-testid=` — making every attribute selector
// in the suite trivially "preserved".
const STR = String.raw`(?:'([^']*)'|"([^"]*)"|\`([^\`]*)\`)`;

const SELECTOR_PATTERNS = [
    String.raw`getByTestId\(\s*${STR}`,
    String.raw`\.locator\(\s*${STR}`,
    String.raw`getByLabel\(\s*${STR}`,
    String.raw`getByPlaceholder\(\s*${STR}`,
    String.raw`getByText\(\s*${STR}`,
    String.raw`getByTitle\(\s*${STR}`,
    String.raw`getByAltText\(\s*${STR}`,
    // getByRole('role', { name: 'x' }) → capture the NAME, the discriminating part
    String.raw`getByRole\(\s*['"\`][^'"\`]+['"\`]\s*,\s*\{[^}]*name:\s*${STR}`,
    String.raw`\.goto\(\s*${STR}`,
    String.raw`waitForSelector\(\s*${STR}`,
].map((p) => new RegExp(p, 'g'));

function extractSelectors(src) {
    const tokens = new Set();
    const add = (t) => {
        if (!t) return;
        const s = t.trim();
        if (s.length < 3) return;
        // A bare template hole carries no information about which element was hit.
        if (/^\$\{/.test(s)) return;
        tokens.add(s);
    };
    for (const re of SELECTOR_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) add(m[1] ?? m[2] ?? m[3]);
    }
    // Regex-valued names and labels.
    for (const re of [
        /(?:getByLabel|getByText|getByTestId)\(\s*\/([^/\n]+)\//g,
        /getByRole\(\s*['"`][^'"`]+['"`]\s*,\s*\{[^}]*name:\s*\/([^/\n]+)\//g,
    ]) {
        let m;
        while ((m = re.exec(src)) !== null) add(m[1]);
    }
    return tokens;
}

function makeIsPreserved(haystack) {
    return function isPreserved(token, newSpec) {
        if (newSpec.includes(token)) return true;
        if (haystack.includes(token)) return true;

        const parts = token.split('-');

        // Hole at the END: `bonus-type-card-employee` ← `` `bonus-type-card-${key}` ``.
        //
        // Exactly ONE trailing segment is stripped. An earlier cut walked the
        // stem down to two segments, which made `[data-testid="scan-landing-grid"]`
        // "preserved" by the unrelated template `` `[data-testid="scan-card-${k}"]` ``
        // — they merely share the `[data-testid="scan-` prefix. That false pass
        // was caught only by deliberately corrupting a page object and checking
        // the audit noticed; it would otherwise have hidden a genuinely dropped
        // selector in any of this suite's prefixed testid families.
        if (parts.length >= 2) {
            const stem = parts.slice(0, -1).join('-') + '-';
            if (haystack.includes(stem + '${') || haystack.includes(stem + '$')) return true;
        }

        // Hole at the START: `bonus-daily-by-employee-grid-empty-filter`
        // ← `` `${type.gridPrefix}-empty-filter` ``. Requires the closing `}` so a
        // bare suffix cannot match.
        for (let cut = 1; cut < parts.length; cut++) {
            const tail = '-' + parts.slice(cut).join('-');
            if (tail.length >= 6 && haystack.includes('}' + tail)) return true;
        }

        // URL stems: `/setup/varieties/new` ← a page object holding '/setup/varieties'.
        if (token.startsWith('/')) {
            const segs = token.split('/').filter(Boolean);
            for (let keep = segs.length - 1; keep >= 1; keep--) {
                const stem = '/' + segs.slice(0, keep).join('/');
                if (haystack.includes(`'${stem}'`) || haystack.includes(`"${stem}"`)) return true;
            }
        }
        return false;
    };
}

const countOf = (src, re) => (src.match(re) ?? []).length;

function assertionProfile(src) {
    const code = stripComments(src);
    const matchers = {};
    for (const m of MATCHERS) {
        const n = countOf(code, new RegExp(`\\.${m}\\s*\\(`, 'g'));
        if (n) matchers[m] = n;
    }
    return {
        expects: countOf(code, /\bexpect(?:\.soft|\.poll)?\s*\(/g),
        notModifiers: countOf(code, /\.not\./g),
        matchers,
    };
}

// ── run ──────────────────────────────────────────────────────────────

function main() {
    try {
        execSync(`git rev-parse --verify ${BASE_REF}`, { stdio: 'pipe' });
    } catch {
        console.error(`[webpet-audit] baseline ref '${BASE_REF}' not found.`);
        console.error(`[webpet-audit] It is the frozen pre-conversion tree; without it there is nothing to compare against.`);
        process.exit(2);
    }

    const haystack = HAYSTACK_DIRS.flatMap((d) => walk(d))
        .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
        .join('\n');
    const isPreserved = makeIsPreserved(haystack);

    const specs = execSync(`git ls-tree -r --name-only ${BASE_REF} -- tests/webpet`, { encoding: 'utf8' })
        .split('\n')
        .map((s) => s.trim())
        .filter((f) => f.endsWith('.spec.ts'));

    let tokenTotal = 0;
    let tokenUnaccounted = 0;
    let expectsBefore = 0;
    let expectsAfter = 0;
    const selectorRows = [];
    const assertionRows = [];
    const missingFiles = [];

    for (const file of specs) {
        const abs = path.join(ROOT, file);
        if (!fs.existsSync(abs)) {
            missingFiles.push(file);
            continue;
        }
        const original = execSync(`git show ${BASE_REF}:${file}`, {
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
        });
        const current = fs.readFileSync(abs, 'utf8');

        const tokens = extractSelectors(original);
        const unaccounted = [...tokens].filter((t) => !isPreserved(t, current));
        tokenTotal += tokens.size;
        tokenUnaccounted += unaccounted.length;
        if (unaccounted.length || VERBOSE) {
            selectorRows.push({ file, total: tokens.size, unaccounted });
        }

        const a = assertionProfile(original);
        const b = assertionProfile(current);
        expectsBefore += a.expects;
        expectsAfter += b.expects;

        const keys = new Set([...Object.keys(a.matchers), ...Object.keys(b.matchers)]);
        const deltas = [];
        for (const k of [...keys].sort()) {
            const d = (b.matchers[k] ?? 0) - (a.matchers[k] ?? 0);
            if (d !== 0) deltas.push(`${k} ${d > 0 ? '+' : ''}${d}`);
        }
        if (b.expects !== a.expects || b.notModifiers !== a.notModifiers || deltas.length) {
            assertionRows.push({ file, a, b, deltas });
        }
    }

    // ── report ───────────────────────────────────────────────────────
    console.log(`[webpet-audit] baseline: ${BASE_REF}`);
    console.log(`[webpet-audit] ${specs.length} specs, ${tokenTotal} selector tokens, ${expectsBefore} assertions\n`);

    if (missingFiles.length) {
        console.log(`  DELETED SPECS (${missingFiles.length}) — coverage was removed, not relocated:`);
        for (const f of missingFiles) console.log(`         ${f}`);
        console.log('');
    }

    console.log(`── Selector preservation ── ${tokenUnaccounted} of ${tokenTotal} unaccounted`);
    if (!selectorRows.length) {
        console.log('   every selector token is accounted for.\n');
    } else {
        console.log('   Each needs an explanation: a template that rebuilds it, or a real drop.');
        for (const r of selectorRows) {
            if (!r.unaccounted.length) {
                console.log(`   OK   ${r.file}  (${r.total})`);
                continue;
            }
            console.log(`   ??   ${r.file}  (${r.unaccounted.length}/${r.total})`);
            for (const t of r.unaccounted) console.log(`          ${JSON.stringify(t)}`);
        }
        console.log('');
    }

    const drift = expectsAfter - expectsBefore;
    console.log(`── Assertion preservation ── ${expectsBefore} → ${expectsAfter} (${drift >= 0 ? '+' : ''}${drift})`);
    let regressed = false;
    if (!assertionRows.length) {
        console.log('   no per-file assertion or matcher drift.\n');
    } else {
        for (const r of assertionRows) {
            const dropped = r.b.expects < r.a.expects || r.b.notModifiers < r.a.notModifiers;
            if (dropped) regressed = true;
            console.log(`   ${dropped ? 'DROP' : 'diff'} ${r.file}`);
            console.log(`          expect ${r.a.expects} → ${r.b.expects}   .not ${r.a.notModifiers} → ${r.b.notModifiers}`);
            if (r.deltas.length) console.log(`          matchers: ${r.deltas.join(', ')}`);
        }
        console.log('');
    }

    if (regressed || missingFiles.length) {
        console.error('[webpet-audit] FAIL — assertions or whole specs were lost, not relocated.');
        process.exit(1);
    }
    console.log('[webpet-audit] OK — no assertion lost. Review any unaccounted selectors above.');
}

main();
