# tests/webpet — migrated web-pet e2e suite

The PET Tiger app repo's Playwright suite (`web-pet/apps/web/e2e`) — **406 tests
in 56 spec files** — lifted here and then converted onto this framework's
conventions. It runs under its own opt-in Playwright projects (`webpet-setup` →
`webpet`) and never joins the framework's `auth-setup`/`chromium`/`api` projects;
a bare `npx playwright test` does not even see it.

Every spec imports `@fixtures/webpet.fixture`, carries a `testCaseId` annotation,
and declares no selectors of its own — those live in
[src/pages/webpet/](../../src/pages/webpet/) and
[src/components/webpet/](../../src/components/webpet/).

## Parity pins (why the run settings still differ from the framework's)

The migration's acceptance criterion is reproducing the source repo's localhost
baseline **exactly: 362 passed / 18 skipped / 26 failed (~48 min)**. The 26
failures / 18 skips are the suite's own documented state (seed gaps, deferred
features, opt-in equiv specs — see [seed/TRIAGE-DELLLANO.md](seed/TRIAGE-DELLLANO.md)).
Treat *deltas* from the baseline as regressions, not the raw red count.

To hold that baseline, the `webpet` project pins the SOURCE repo's settings and
deliberately overrides this repo's globals:

| Setting | webpet project | framework global |
|---|---|---|
| test timeout | 30 s | 110 s |
| expect timeout | 5 s | 10 s |
| retries | 0 (even in CI) | CI = 2 |
| video / screenshot | off | on |
| trace | on-first-retry | retain-on-failure |
| storageState | own (`tests/webpet/.auth/`) | `.auth/user.json` |

The pins are behind `WEBPET_PARITY` (default on) and outlived the conversion on
purpose — see [Verification status](#verification-status). `locale`,
`Accept-Language` and the absent `storageState` are **not** pins: the suite
asserts English copy and seeds its own contexts, so those survive the flip.

**`src/fixtures/base.fixture.ts` must never be imported from this tree.** Its
gate resolves ids through `DataProvider`, whose singleton is bound process-wide
to `src/data/runner/`; web-pet rows live in `src/data/webpet/`, so every
`WP-####` would hit the "has no runner row" branch and all 406 tests would skip
while the run reported green.

## Running

Stack required on localhost (Playwright boots nothing): Vite `:3000` proxying
`/api` → Go API `:8080` → SQL Server (DelLlano), MinIO `:9000`, Gotenberg
`:3010`. Apply the seed once per DB refresh (idempotent):

```sh
sqlcmd -S localhost -b -i tests/webpet/seed/delllano-e2e-seed.sql
```

```sh
npm run test:webpet                                  # whole suite, localhost
npm run test:webpet -- tests/webpet/employee.spec.ts # one file (14/14 = reference spec)
npm run test:webpet:list                             # collection check — prints 407 tests / 57 files
npm run test:webpet:dev                              # whole suite, dev staging
npm run test:webpet -- --grep @WPBatch01             # one conversion batch
npm run test:webpet -- --grep @wp-crop               # one module
```

`test:webpet:list` reports **407 / 57**, not 406 / 56: `--project=webpet` pulls
in its `webpet-setup` dependency, whose `webpet.setup.ts` is one more "test" in
one more file. 406 / 56 is the count of real tests. (Earlier revisions of this
file quoted 406 / 56 for this command — that was wrong.)

The `--reporter=list` in that script is **load-bearing, not cosmetic**. `--list`
instantiates the configured reporter chain and fires `onEnd`, so without an
explicit reporter a "collection check" would send the email report, post to
Slack, and overwrite `artifacts/results/results.json` — destroying the baseline it is
meant to be checking. Any webpet command that must not notify has to pass
`--reporter=` explicitly.

Direct CLI use needs the projects materialized: `npx playwright test
--project=webpet` works (the config detects the flag and exports `WEBPET=1` for
its workers); for anything fancier set `WEBPET=1` yourself.

CI: [.github/workflows/webpet-e2e-local.yml](../../.github/workflows/webpet-e2e-local.yml)
(self-hosted, boots the stack, applies the seed, **manual dispatch only** — it has no
`schedule:` block, despite what earlier revisions of this file claimed) and
[webpet-e2e-dev.yml](../../.github/workflows/webpet-e2e-dev.yml) (ubuntu →
app.ptdev.xyz, nightly 4:00 AM IST + manual). Neither runs on push.

### Environment variables

| Var | Purpose | Where set |
|---|---|---|
| `E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD` | admin (`su`) API login in [support/provision.ts](support/provision.ts) + notifications.spec.ts; falls back to `USER_NAME`/`PASSWORD` (see [src/config/webpetEnv.ts](../../src/config/webpetEnv.ts)) so a local `test:webpet:dev` reuses the framework's dev credentials | `.env.local` (committed throwaway) / CI secrets (`LOCAL_PASSWORD`, `DEV_PASSWORD`) / fallback: `.env.dev` + `.env` |
| `WEBPET_API_ORIGIN` | base for DIRECT API request contexts; **unset on local** (calls go through the Vite proxy, byte-identical to the source repo), `https://api.ptdev.xyz` on dev | `.env.dev` only |
| `S3_ENDPOINT` | non-empty ⇒ employee-documents.spec.ts runs (needs MinIO) | `.env.local`; deliberately absent on dev |
| `WEBPET=1` | materializes the webpet projects (auto-set by the npm scripts / `--project=webpet`) | scripts/CI |
| `PET_EXPORT_EQUIV`, `PET_DEVICE_CMD_EQUIV`, `SCAN_TIME_IN_EQUIV` (+ `PET_LEGACY_*`, `SCAN_EMPLOYEE_BARCODE`) | opt-in equiv parity specs — set nowhere, skip by default (needs a Windows host with legacy baselines) | — |

## Per-test run control (the webpet runner)

Every test has a row (`WP-0001`…`WP-0406`). Two files, same authored-CSV →
JSON-mirror model as `src/data/runner/`:

- [src/data/webpet/webpetRunnerManager.csv](../../src/data/webpet/webpetRunnerManager.csv)
  — **edit this one** (Excel-friendly).
- [src/data/webpet/webpetRunnerManager.json](../../src/data/webpet/webpetRunnerManager.json)
  — generated runtime mirror, emitted under a `runnerManager` key so the
  framework's `JsonDataReader` can read it. Never hand-edit; the CSV wins on sync.

| Column | Owner | Notes |
|---|---|---|
| `id` | script | `WP-####`, allocated `max+1`. **Never renumbers.** |
| `file`, `titlePath`, `testTitle`, `tags` | script | rewritten every sync from discovery |
| `enabled` | you | **`1` or `0`, never blank** — see below |
| `caseKey` | you | business key for a loop-generated test; drives `src/data/webpet/ids/` |
| `module`, `category` | you | seeded from the file name on first sight |
| `testName`, `testDescription`, `jira`, `status`, `notes` | you | `status`: `automated` (402) or `deferred` (4 — declared-skip placeholders for surfaces that do not exist yet) |
| `stale` | script | set when a test vanishes; the row is kept, never deleted |

### Identity: id first, structural key as the fallback

Rows were originally keyed purely on `file::titlePath`. Conversion **retitles**
tests, which under that key would allocate a fresh `WP-####`, orphan the old row
as stale, and silently drop your `enabled`/`notes` state — while the run still
reported green. The merge now prefers the `testCaseId` annotation and falls back
to the structural key, so a commit that retitles *and* annotates keeps its id,
and one that only retitles still matches. The runtime gate mirrors this: with an
annotation it applies the framework's strict semantics, without one it falls back
to the structural key, fail-open.

`enabled` must be an explicit `1`/`0`. A blank cell means "runs" to this suite's
fail-open gate but "skips" to the framework's `MultiFileDataReader`, so
`webpet:runner:check` rejects blanks rather than letting the meaning flip
silently when the reader changes.

Flip a CSV row's `enabled` to `0`, run the mirror, and the test skips with a
reason naming its WP id. Semantics stay **fail-open**: missing file / unknown
test ⇒ runs.

```sh
npm run webpet:runner:sync     # rediscover tests + merge + write CSV & JSON
npm run webpet:runner:mirror   # fast: rebuild JSON from an edited CSV only (no discovery)
npm run webpet:runner:ids      # regenerate src/data/webpet/ids/ from the caseKey column
npm run webpet:runner:check    # drift alarm: discovery + CSV⇄JSON + annotation/tag/id integrity
npm run webpet:ids:check       # static gate — no app stack, no discovery, runs in a second
npm run webpet:audit           # relocation gate — diffs every spec against webpet-lift-v1
```

`webpet:runner:check` spawns a `--list` (needs `node_modules`, not the app) and
additionally fails on: an annotation claiming a row that does not exist, one id
claimed by two tests, a blank or non-`1`/`0` `enabled`, a `status=automated` row
whose test carries no annotation, tag drift between spec and row, and an
out-of-date generated id map.

`webpet:ids:check` is pure source analysis, which makes it the backbone of the
degraded verification path. It proves the annotation⇄row bijection, the
`caseKey`⇄id-map bijection, that no spec imports `base.fixture`/`pages.fixture`,
that no journey tag leaked in, and that no page object is named `*.spec.ts`. It
**cannot** prove a relocated locator still matches — that needs the stack.

### `webpet:audit` — the relocation gate

The conversion's core rule is *relocate locators, never rewrite them*, and both
ways of breaking it report green: a locator that no longer matches makes a test
skip or pass vacuously, and a dropped assertion turns a real check into a no-op.
Neither is visible in a pass/fail column, and neither `ids:check` nor
`runner:check` looks for them — those verify identity and bookkeeping.

`webpet:audit` diffs every spec against its **pre-conversion form at the
`webpet-lift-v1` tag** and reports two things:

- **Selector preservation** — every selector token the original used must still
  appear, verbatim or via a template that reconstructs it, in the converted spec
  or the framework tree it moved into.
- **Assertion preservation** — per-file `expect()` counts and matcher
  composition must be unchanged. Losing a `toBeDisabled` while gaining a
  `toBeVisible` is a weakened assertion at a constant count.

It exits non-zero only for **assertion** loss or a **deleted spec**, which have
no legitimate cause. Unaccounted selectors are reported for review, not failed
on: a template hole in the middle of a selector, or a `new RegExp()` built from a
variable, is beyond static reach.

Current result: **726 selector tokens, 0 dropped; 990 assertions, 0 dropped, no
matcher drift.** The 61 unaccounted selectors were each traced to a
reconstructing template by hand.

This is a *necessary* condition, not a sufficient one — a token can survive and
still be wired to the wrong element. Only the baseline diff below proves that.

> Both halves were negative-tested rather than trusted: deleting one assertion,
> deleting one spec, and corrupting one page-object testid each produce the
> expected failure, and the tree returns to clean on restore. The first cut of
> this audit passed on all three — its comment-stripper was eating code between
> two `'**/setup/...'` globs, its extractor truncated every `[data-testid="…"]`
> at the inner quote, and its stem heuristic matched any two testids sharing a
> prefix. A guard that has never been seen to fail is not evidence of anything.

The framework's own `runner:check` deliberately excludes this tree
(`scripts/runner/lib/runner-data.js` → `EXCLUDED_TEST_DIRS`).

## Baselines — the acceptance gate for a conversion batch

> **Not captured yet.** `src/data/webpet/baselines/localhost.json` does not
> exist, and it cannot be reconstructed after the fact — capturing it needs the
> seeded stack. Until it does, every acceptance check below is unavailable and
> the conversion stays unverified. This is the top open item on the migration.

`362 passed / 18 skipped / 26 failed` is a **total**, and totals cannot see the
things a POM conversion actually breaks: a known-red test that is still red for
a *different* reason, a test that started skipping because its id drifted, or
one test greening while another reds. So a batch is accepted by a **per-test**
diff, keyed on WP id and comparing status **plus a normalised failure
fingerprint**.

### Every baseline run is `--workers=1`

This suite is **not parallel-safe**: it mutates shared setup rows (test crews,
employees, jobs), does inline grid edits, and flips user preferences, so
concurrent tests race each other. Both committed baselines were captured
serially, and a run at any other width cannot be compared with them.

That was true and unenforced for a while. `playwright.config.ts` defaults to
`workers: 4`; this file's own header described the local run as "~48 min at
workers:1"; and **neither workflow ever passed the flag**. So every CI run was
really 4-wide while the docs claimed otherwise. The first run after the framework
alignment landed made it obvious — 6 m 11 s against the dev baseline's 56.5 m.

Both webpet workflows now pin `--workers` and expose it as a dispatch input
(default `1`), and warn in the job log when it is raised.

Capture on the seeded stack, twice — whatever differs between two runs of
unchanged code is flake, and flake has to be known before it can be told apart
from a regression:

```sh
# an explicit --reporter replaces the configured chain, so no email, no Slack,
# and artifacts/results/results.json is left intact
PLAYWRIGHT_JSON_OUTPUT_NAME=run1.json npm run test:webpet -- --reporter=json --workers=1
PLAYWRIGHT_JSON_OUTPUT_NAME=run2.json npm run test:webpet -- --reporter=json --workers=1

npm run webpet:baseline -- run1.json src/data/webpet/baselines/localhost.json
npm run webpet:baseline -- run2.json /tmp/run2-manifest.json
npm run webpet:diff    -- src/data/webpet/baselines/localhost.json /tmp/run2-manifest.json
```

That last diff should be CLEAN. Anything it reports is flake — record it in the
row's `notes` before committing the manifest. Repeat with `test:webpet:dev` for
`baselines/dev.json`.

Then, per batch:

```sh
PLAYWRIGHT_JSON_OUTPUT_NAME=after.json \
  npm run test:webpet -- --grep @WPBatch01 --reporter=json --workers=1
npm run webpet:diff -- src/data/webpet/baselines/localhost.json after.json
```

Verdicts. **Blocking:** `passed → anything`; `failed → failed` with a different
fingerprint; `→ skipped`; a test missing from a file the run collected;
`didNotRun → failed`. **Explain in the PR:** `failed → passed` (during a
behaviour-preserving move this usually means the assertion stopped executing)
and `skipped → not-skipped`.

When a known failure changes its fingerprint, do **not** wave it through as
"still red". Classify it: a selector that now resolves differently, a failure
that moved *earlier* (an extra wait/navigate crept in), or one that moved
*later* (an assertion silently stopped running — worse than a new failure,
because it is a coverage hole wearing a green hat).

## Dev staging (report-only)

Dev runs are a triage baseline, not a pass/fail gate — dev's DB is not the
seeded DelLlano, and the suite **mutates dev data** (test crews/employees/jobs,
Ranch/Field inline edits, a `RestrictedTest_*` user, user preferences).
Expected dev-failure classes are listed in the header of
`webpet-e2e-dev.yml`; disable dev-incompatible tests via the runner file after
the first baseline runs.

**First dev baseline (2026-07-29): 319 passed / 47 failed / 22 skipped /
19 did-not-run (56.5 m, workers 1)** — full categorized failure list in
[DEV-BASELINE-2026-07-29.md](DEV-BASELINE-2026-07-29.md).

**First post-alignment dev run (2026-07-30, commit `9a2199a`): 315 / 50 / 42 / 0
in 6 m 11 s — at workers 4, so NOT comparable.** Recorded because the
reconciliation is still informative, not because it verifies anything:

- The skipped swing is an artifact: 22+19 = 41 before, 42+0 = 42 now — the
  serial-file remainders were reported as `skipped` rather than `didNotRun`.
- **18 of 21 files had identical failure counts.** Only three moved:
  `employee.spec.ts` 1→4 (all three new ones `POST /api/employees` **500** — a
  dev API fault, same class as the known `POST /api/users` 500),
  `bonus-shell.spec.ts` 1→2 (`net::ERR_CONNECTION_RESET`), and
  `variety.spec.ts` 1→0.
- The two failures that looked like conversion defects were checked against
  `webpet-lift-v1` and are not: the report-editor strict-mode violation echoes
  a locator byte-identical to the original, and reconcile's
  `derivedPermissions` TypeError has the same shape as the pre-conversion code.

A per-file count match at the wrong worker count is weak evidence — it cannot see
a test that failed for one reason before and a different reason now. Re-run at
`workers=1` before drawing any conclusion.

## Upstream re-sync policy

The tree was byte-identical to `web-pet/apps/web/e2e` for 50 of 56 specs at the
git tag **`webpet-lift-v1`** (commit `19136c8`). The framework alignment rewrites
and retitles all 56, so **upstream changes can no longer be cherry-picked here**.

From now on an upstream `apps/web/e2e` change is a **specification to
re-implement**, not a patch to merge:

1. Diff upstream against what the tag captured — `git show webpet-lift-v1:tests/webpet/<file>`
   is the original form of any spec.
2. Re-implement the behavioural delta in the converted spec + its page object.
3. If it adds or removes tests, run `npm run webpet:runner:sync` — ids never
   renumber, so new tests get fresh `WP-####` rows and removed ones go `stale`.

The section below is the historical record of the lift, kept because it explains
*why* several files differ from upstream. It describes the tree at
`webpet-lift-v1`, not necessarily the tree today.

## Migration notes (every deviation from the source repo, as of `webpet-lift-v1`)

Byte-identical: 50 of 56 specs, `data-factory.ts`, `parent-picker-helpers.ts`,
`fixtures/sample.pdf`, `seed/*`. Everything else, exhaustively:

1. **fixtures.ts** — storage paths anchored to `__dirname` (was `process.cwd()/e2e`);
   `request` overrides use `API_BASE_URL` (identical on local); `_webpetGate`
   auto fixture added to `test` and `testAsRestricted`; `export type { Page }`
   added (reconcile-job-cards imports it; the source repo never typechecked e2e).
2. **global-setup.ts → support/provision.ts + webpet.setup.ts** — same body; runs
   as a dependency project instead of globalSetup (slot taken; failure scopes to
   this suite); request contexts target `API_BASE_URL` with `Origin` = web origin;
   auth dir → `tests/webpet/.auth/`.
3. **NEW support/** — `webpet-env.ts` (URL resolution), `webpet-gate.ts` (runner
   gate), `clean-fixtures.ts` (gated raw-test shim).
4. **data-scoping.spec.ts** — `.auth` paths → `__dirname`; side request context →
   `API_BASE_URL`; dropped the now-unused `baseURL` fixture binding.
5. **employee-documents.spec.ts** — `sample.pdf` path → `__dirname`.
6. **notifications.spec.ts** — raw `@playwright/test` import → `./support/clean-fixtures`.
7. **equiv/variety…** — storage path → `__dirname/..`; cleanup context →
   `API_BASE_URL` (was `PLAYWRIGHT_BASE_URL ?? localhost`).
8. **equiv/biometric…, equiv/export-pet-setup…** — storage path → `__dirname/..`.
9. **billing-center.spec.ts, timesheet_validation.spec.ts** — types only:
   `Parameters<typeof test>[1]['page']` → `Page` (overload resolution differs on
   this repo's @playwright/test 1.58.2 vs the source's 1.59.x).
10. **mobile-tab-labels.spec.ts** — imports only: dropped unused `expect`
    (`noUnusedLocals`).

Not copied: `e2e/ci/*` (container CI — superseded by the workflows here),
`e2e/README.md` (this file adapts it), `tsconfig.json`, `.auth/`, `.screenshots/`.

## Framework alignment (code complete)

All 406 tests are on the framework's conventions — page objects, fixtures,
`testCaseId` annotations, tags, path aliases — while the suite keeps running
**separately**: its own projects, npm scripts, CI workflows and runner file. A
bare `npx playwright test` still does not see it.

> Supersedes this file's earlier "gradual POM conversion" note, which said
> converted specs adopt `base.fixture`. They must not — see the warning above.

- Page objects: 47 across seven areas under `src/pages/webpet/<area>/`, extending
  `WebpetFormPage` / `WebpetListPage` (**not** `SetupScreenPage` — the divergence
  table is in [src/pages/webpet/README.md](../../src/pages/webpet/README.md)),
  plus 9 components under `src/components/webpet/`.
- Fixture: `src/fixtures/webpet.fixture.ts`. The run-control gate is an
  `{ auto: true }` fixture, never a module-level `beforeEach` — a module-scope
  hook in a fixture module attaches only to the spec file loading at import
  time, so it fires for the first spec file each worker loads and no others
  (measured).
- Identity: `WP-0001`…`WP-0406`, annotated on every test, ids never renumber.
  78 of them cannot carry a literal — they are generated from a case table — so
  their id comes from one of four generated maps in `src/data/webpet/ids/`, keyed
  on a business field, never an array index.
- Run settings: still on the parity pins (`WEBPET_PARITY`, default on) — see
  below. Preview the end state with
  `npm run test:webpet -- --framework-settings`.

### Conversion status

| Batch | Scope | Tests |
|---|---|---|
| 0a | identity tooling — id-first sync, `webpet:ids:check`, aligned CSV schema | — |
| 0b | fixture, gate, row source, base classes, components, config, CI | — |
| 01 | `crop` `crew` `department` `job-group` `term` | 44 |
| 02 | `customer` `employee` `variety` | 43 |
| 03 | `ranch` `job` `equipment` `field` | 45 |
| 04 | `billing-center` + `inventory-*` ×6 | 12 |
| 05 | `form-field-states` `setup-batch-b-smoke` `traceability-batch-a-smoke` `select-smoke` | 20 |
| 06 | `onboarding-badges` `dashboard` `localization` `profile-change-password` `profile-avatar` `mobile-tab-labels` `console-diagnostic` | 20 |
| 07 | `parent-picker` | 21 |
| 08 | `notifications` `data-scoping` `employee-documents` | 15 |
| 09 | `timesheet_validation` `time-in` | 12 |
| 10 | `report-editor-wysiwyg` | 13 |
| 11 | `bonus-flow` `bonus-shell` | 77 |
| 12 | `export-to-accounting` ×7 `reconcile-job-cards` | 27 |
| 13 | `scan-mode` `scan-mode-gating` | 47 |
| 14 | `equiv/*` ×7 | 10 |
| 15 | shims deleted, `runner:check` blocking, docs | — |
| | **total** | **406** |

All 406 rows are annotated: 402 `status=automated`, 4 `deferred` (three Scan Mode
placeholders for surfaces that have not shipped, and the Time Card multi-entry
workflow the web app has not replicated).

### Verification status

**Every batch is code complete and none is baseline-verified.** They pass
everything that does not need a running stack — `typecheck`, `lint`,
`webpet:ids:check`, `webpet:runner:check`, `webpet:audit`, a 407/57 collection,
tag counts, journey isolation — and that catches type errors, dropped or
duplicated tests, orphaned ids, a `base.fixture` import, a leaked journey tag,
CSV drift, a dropped selector, a lost assertion, an `expect()` that is never
awaited, and a stray `test.only` (see [docs/LINTING.md](../../docs/LINTING.md)).

What is still unproven is the part only a browser can answer: whether a relocated
locator still *matches the same element*, and whether a conditional skip still
fires. `webpet:audit` proves a selector survived the move, not that it resolves.
That needs
[the per-test baseline diff](#baselines--the-acceptance-gate-for-a-conversion-batch),
and the manifest it needs has never been captured because that requires the
seeded stack.

Two things follow, and they are the open items on this migration:

1. **Run the converted suite on the seeded stack with the parity pins on** and
   compare against 362/18/26. That is the only regression signal available, which
   is why `WEBPET_PARITY` was *not* deleted in Batch 15 as the plan called for:
   flipping the run settings first makes every delta unattributable — conversion
   bug, or a 110s timeout hiding a hang?
2. **Then** capture `src/data/webpet/baselines/localhost.json` (and `dev.json`),
   delete `WEBPET_PARITY` and its conditionals from `playwright.config.ts`, and
   re-capture both manifests under the framework globals.

### No tag may be a prefix of another

`--grep` is a plain substring regex over the title path **and** the tags, so a
tag that prefixes another silently over-selects. `@wp-job` also matched
`@wp-job-group` — 20 tests reported for an 11-test module, with nothing failing.
That is why the Job tag is `@wp-jobs`.

`webpet:ids:check` rejects any prefix collision, and caught four more after that
first one: `@wp-smoke` (a severity tag) would have been over-selected by
`@wp-smoke-batch-a`/`-b`, now `@wp-batcha`/`@wp-batchb`; `@wp-field` by
`@wp-field-state`, now `@wp-formstate`; and `@wp-forms` by `@wp-formstate` — a
collision reasoned away once and then reintroduced two batches later, which is
the argument for the automated check rather than care.

It bites hardest on *short, generic* tags. Pick a distinct word rather than
extending an existing tag with a suffix. (Near-misses are fine and do occur:
`@wp-equiv` and `@wp-equipment` share eight characters and neither prefixes the
other.)

### Reference specs

Copy the closest of these when adding a module: `crop.spec.ts` for a plain form,
`crew.spec.ts` for a combobox-mode ParentPicker, `variety.spec.ts` for a
**sheet**-mode picker plus a two-required-field form, `customer.spec.ts` for a
form with a sub-form component, `term.spec.ts` for a module-gated route that may
legitimately 403, `field.spec.ts` for a pure DataGrid list (inline edit,
multi-edit, Undo, URL state), `ranch.spec.ts` for a grid **plus** a form with
a map/boundary section and API state helpers, `parent-picker.spec.ts` for a
**component** spec that drives one component across eight consumer forms,
`bonus-flow.spec.ts` for tests generated from a case table with compile-checked
ids, `export-to-accounting-v2-exportrun.spec.ts` for a route-mock spec that
asserts on request *ordering*, and `reconcile-job-cards.spec.ts` for a spec whose
skips depend on server state the suite cannot set.

### ParentPicker: the two modes are not interchangeable

Which mode a field uses is not guessable from its name, and picking wrong gives
a locator that silently matches nothing. `FieldFormPage` records the split for
the densest consumer (thirteen pickers). Two consequences worth remembering:

- **Clear-to-none differs.** Combobox mode uses an X button (`comboboxClear`),
  rendered only once a value is selected. Sheet mode uses an `aria-hidden`
  `__none__` sentinel item — which is why option counts must exclude it.
- **"+ Create" is per-picker.** Only pickers registering a `useCreateFromName`
  handler render the footer, so its *absence* is a real assertion too.

Converted specs contain **no selectors** — the only `page.*` calls left in them
are `waitForURL` (a navigation assertion) and `page.on('dialog')` (a per-test
dialog policy), neither of which belongs in a page object.

### Where things live

| | |
|---|---|
| `src/fixtures/webpet.fixture.ts` | the suite's `test`/`expect`; context + page + authed request |
| `src/fixtures/webpetAnonymous.fixture.ts` | unauthenticated variant for notifications' 401 tests |
| `src/fixtures/gate/webpetGate.ts` | run control, wired as an `{ auto: true }` fixture |
| `src/fixtures/gate/executionGate.ts` | the framework's three-layer decision, shared with the journey suites |
| `src/data/webpet/webpetRunnerSource.ts` | row reader — its own `MultiFileDataReader`, **not** `DataProvider` |
| `src/config/webpetEnv.ts`, `webpetPaths.ts` | URL/credential resolution, filesystem anchors |
| `src/pages/webpet/Webpet{Form,List}Page.ts` | the two page-object bases |
| `src/pages/webpet/<area>/` | 47 screens across `setup/ accounting/ settings/ shell/ scan/ input/ bonus/` |
| `src/components/webpet/` | ParentPicker, FormFooter, UnsavedChangesModal, DataGrid, Toast, DateRangeFilter, EntitySheet, CustomerContacts, EmployeeDocuments |
| `src/data/webpet/bonusTypes.ts`, `scanRoutes.ts` | shared `as const` case tables behind the loop-generated tests |
| `src/data/webpet/ids/` | four **generated** id maps — regenerate, never edit |

Everything that used to live in `tests/webpet/` as scaffolding is **gone**, each
deleted the moment its last importer converted rather than left as dead code:
`support/webpet-gate.ts` and `support/clean-fixtures.ts` mid-conversion, then
`fixtures.ts`, `parent-picker-helpers.ts` and `support/webpet-env.ts` in Batch 14.
What remains beside the specs is `support/provision.ts` (the auth bootstrap),
`webpet.setup.ts`, `data-factory.ts`, `seed/` and `fixtures/sample.pdf`. Recover
any deleted file with `git show webpet-lift-v1:<path>`.

### Three matchers for one Save button

Not consolidatable, and the reason is recorded on `FormFooterComponent`:
substring `'Save'` for the common case; `exact: true` where the unsaved-changes
modal may also be mounted (substring would also match its "Don't Save" and trip
strict mode); and `/^Save/` on the ranch form, whose label carries a suffix so an
exact match finds nothing.

`src/data/webpet/webpetRunnerSource.ts` deliberately builds its own reader:
`DataProvider` is a process-wide singleton bound to `src/data/runner/`, so
pointing it here would resolve every *journey* id against the web-pet directory
and skip the entire journey suite in any run that materialises both.

**Acceptance is a per-test diff against a committed baseline**
(`src/data/webpet/baselines/localhost.json`), keyed on WP id and comparing
status plus a normalised error fingerprint — not totals. A known failure that
changes its *failure mode* is a regression a totals diff cannot see. Convert a
module only once it is green/triaged against that baseline.

## Troubleshooting

- **Everything fails at `webpet-setup`** — admin login failed: check
  `E2E_ADMIN_USER`/`E2E_ADMIN_PASSWORD` (must match the API's `PT_SU_PASSWORD`)
  and that the stack is up. `Admin`/`Admin` no longer authenticates.
- **Stale auth state** — delete `tests/webpet/.auth/` and rerun (the setup
  project recreates it).
- **~27 unexpected failures after a DB refresh** — re-apply the seed (above).
- **A test unexpectedly skips with a WP-id reason** — its runner row is
  `enabled:false`; flip it back or run `npm run webpet:runner:sync` to audit.
