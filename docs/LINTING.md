# Linting

```sh
npm run lint          # report
npm run lint:fix      # report + auto-fix what is safely fixable
npm run format        # prettier, explicitly, on a path you name
```

`npm run lint` is expected to exit **0**. Warnings are allowed and are listed below;
errors are not.

---

## Why prettier is not an eslint error

The config extends `prettier` (eslint-config-prettier — which only *disables*
stylistic eslint rules that would fight a formatter) and **not**
`plugin:prettier/recommended` (which additionally reports every formatting
deviation as an eslint error).

That distinction was previously the other way round, and it made the linter
unusable: **15,543 errors across 204 of 204 files**, every one of them
`prettier/prettier`. Nobody can act on a signal that fires on every file in the
repo, so nobody ran the linter, so the real defects underneath were never seen.

Adding [`config/lint/.prettierrc.json`](../config/lint/.prettierrc.json) — measured against the actual
codebase rather than guessed (4-space indent on 14,047 lines vs 473 at 2; single
quotes 13,090 vs 1,152 double; p99 line length 110, so `printWidth: 120`) — cut
that to 7,062. Still unusable, and the residue turned out not to be drift at all:

```ts
// what this repo writes, and what tests/README.md documents:
test('[Bonus] Verify that …', {
    tag: ['@wp-ui', '@wp-smoke'],
    annotation: { type: 'testCaseId', description: 'WP-0046' },
}, async ({ pages }) => {

// what prettier insists on instead:
test(
    '[Bonus] Verify that …',
    {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0046' },
    },
    async ({ pages }) => {
```

Prettier explodes every `test(title, options, body)` call and re-indents its
whole body. With ~450 tests that is most of the diff in the repository, and it
would contradict the convention the framework's own documentation teaches.

So: **formatting is a formatter's job, not a gate's.** `config/lint/.prettierrc.json` exists
so editors and `npm run format` agree on 4-space/single-quote/120-col when you
choose to run them; eslint stays out of it and reports things that can actually
be wrong.

Result: **15,543 errors → 0**, and 64 warnings that all point at something real.

## What eslint does check

`eslint-plugin-playwright` was already a devDependency and was **not wired into
the config at all**. It is now enabled for `tests/**` — this is where the value
is. Rules that catch failures which otherwise report green:

| Rule | Catches |
|---|---|
| `missing-playwright-await` | an `expect()` that is never awaited — the assertion silently never runs |
| `no-focused-test` | a stray `test.only`, which quietly shrinks a whole run to one test |
| `valid-expect`, `valid-expect-in-promise` | assertions that cannot fail |
| `no-standalone-expect` | an `expect()` outside a test body |
| `no-unused-locators` | a locator built and then never asserted on |
| `valid-test-tags`, `valid-title` | malformed tags/titles, which break `--grep` selection |

All of the above currently report **zero** across 406 web-pet tests and the
journey suites.

Four rules are switched off deliberately, because this suite's tests legitimately
do the thing they forbid: `no-conditional-in-test`, `no-conditional-expect`,
`no-skipped-test` and `expect-expect`. Several specs branch on server state the
suite cannot set (a licensing module that may be off, a preference that may be
disabled) and skip with a recorded reason — see
`tests/webpet/reconcile-job-cards.spec.ts`.

## The remaining warnings, and why they are warnings

58 of the 64 are confined to `tests/webpet/`, the migrated suite, and every one
is **inherited from the lift** rather than written here:

| Rule | Count | Why not fixed |
|---|---|---|
| `no-useless-not` | 18 | `.not.toHaveText('')` etc. came over verbatim |
| `no-networkidle` | 17 | the source specs wait on `networkidle` deliberately |
| `no-wait-for-timeout` | 16 | fixed sleeps inherited from the source suite |
| `consistent-spacing-between-blocks` | 5 | cosmetic |
| `prefer-locator`, `prefer-web-first-assertions` | 1 each | inherited call shapes |

The migration's governing rule is **relocate locators, never rewrite them** — a
batch is accepted by diffing against a per-test baseline, so a "better" assertion
is indistinguishable from a regression (see
[tests/webpet/README.md](../tests/webpet/README.md)). Rewriting these would move
the baseline before it has even been captured.

`no-networkidle` and `prefer-web-first-assertions` are therefore downgraded to
warnings **inside `tests/webpet/` only**. They stay errors everywhere else, so
new journey specs cannot introduce them. Clean them up in the web-pet tree once
the baseline exists and the change can be shown to be behaviour-preserving.

The 6 `no-empty-pattern` warnings in `src/` are `async ({}) => …` fixtures — a
Playwright idiom, not a defect.

## Scope

`scripts/**/*.js` is not linted: the config sets `parserOptions.project`, and
plain JS files are not in `tsconfig.json`, so the TS parser rejects them before
any rule runs. They are deliberately dependency-free Node scripts.
