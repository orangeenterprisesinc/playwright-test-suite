# Lint configuration — why the overrides exist

`.eslintrc.json` cannot carry comments, so the reasoning for each override lives
here. The baseline is **0 errors and 0 warnings**: a warning nobody will ever
act on is noise that hides the next real one, so a rule we have decided not to
follow is turned off *with a reason* rather than left warning forever.

## `tests/**/*.ts` — the Playwright recommended set, minus four

`no-conditional-in-test`, `no-conditional-expect`, `no-skipped-test`,
`expect-expect` are off suite-wide. The suite gates tests at run time through
runner rows (`testInfo.skip` from a fixture), asserts through page-object
helpers, and branches on environment capability — all of which these rules read
as defects.

## `src/fixtures/**/*.ts` — `no-empty-pattern` off

Playwright computes a fixture's dependency graph by **parsing the destructuring
pattern of its first parameter**. A fixture that depends on no other fixture
must therefore still be written `async ({ }, use, testInfo) => …`; replacing the
empty pattern with `_` makes Playwright throw *"First argument must use the
object destructuring pattern"*. The rule is a false positive against required
framework syntax, so it is off for fixtures only — it stays on everywhere else.

## `tests/webpet/**/*.ts` — five Playwright rules off

The web-pet suite was **lifted, not rewritten** (`docs/adr/0001-webpet-suite-runs-separately.md`).
Every spec was relocated with its locators, action order and assertions
unchanged, which is what makes each conversion batch provably behaviour-
preserving. `npm run webpet:audit` enforces that against the `webpet-lift-v1`
tag on every CI run.

| Rule | Why it is off here |
|---|---|
| `no-useless-not` | **Fixing it fails CI.** `scripts/webpet/audit-relocation.js` counts `.not.` per file and exits 1 on any drop (`notModifiers`), so rewriting `.not.toBeVisible()` as `toBeHidden()` trips the relocation audit. A negative assertion may only be replaced by a *stronger* one, deliberately, per file. |
| `no-wait-for-timeout` | Removing a fixed wait changes timing in a 411-test parity suite. A real fix is a per-spec behavioural change, not a lint sweep. |
| `no-networkidle` | Same; was already downgraded to `warn` for this reason before being turned off. |
| `prefer-web-first-assertions` | Same; also previously `warn`. |
| `prefer-hooks-in-order` | Hook order is as lifted. Reordering hooks changes setup/teardown sequencing for no behavioural gain. |

**Scope matters here.** These are off for `tests/webpet/**` only. The journey
suite (`tests/web/**`) and the developer-contribution lane
(`tests/contrib/**`) get every one of them at full strength — new code has no
parity contract to preserve, and a contributed spec that sleeps on a timeout or
waits for `networkidle` should be caught in review.

If you genuinely want one of these fixed in the lifted suite, do it as its own
change with the audit in front of you, not as a lint pass.
