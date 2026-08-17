# Suite consolidation — handoff

Written 2026-08-16, updated 2026-08-17 (batches 7 and 8 landed). Everything below is measured, not estimated. If a number here
disagrees with what §9's commands report, trust the commands and update this file.

## 1. Goal and current phase

Fold the `tests/webpet` suite into the user-journey suite, then delete
`tests/webpet` and all its tooling. **One suite: the user journey suite.**

Two phases:

| Phase | What | State |
|---|---|---|
| Phase 0 | Foundation — checker guards, `SCR-###` id space, CI budget, traceability | ✅ complete |
| Phase 1 | Relocation, 12 batches | 🔄 **batches 1–8 done, 9–12 remain** |
| Phase 2 | Retirement, `RET-01`…`RET-06` | ⬜ not started |

This is internal framework debt and is **deliberately not in Jira**. The 14
journey tickets (`J-A1`…`J-F2`) are separate work that starts *after* Phase 2
merges. Do not file consolidation work as tickets.

A later phase — edge, additional and negative cases — starts after this merges,
on its own branch cut from the updated `main`. It is out of scope here.

## 2. Current counts

| | Tests | Files |
|---|---|---|
| Journey (`tests/web` + `tests/api`) | **314** | **37** |
| web-pet (`tests/webpet`) | **108** | **21** |

* Started at journey 14 / web-pet 407.
* **Absorbed: 299 of 407 (73%). Remaining: 108.**
* Journey runner rows: **378 across 8 files** — 313 claimed by specs, 65 reserved
  (`status=draft`, not yet automated; these are the Jira-ticket backlog).
* web-pet rows: **108** (107 live + 1 known-stale).
* Catalog coverage: **13 of 69 workflows** have ≥1 automated row.
* Coverage depth: `{"journey":3,"screens":5,"partial":10,"none":51}`.

Final expected end state: **~420 tests in one suite**, of which ~13 land
`enabled=0`.

## 3. Branch and commit

* Branch: **`feature/suite-consolidation`** (cut from `main`)
* HEAD: **`2b45301`** (`refactor(webpet): relocate the scan mode, device and time-in specs`)
* **16 commits. Working tree clean. Nothing has ever been pushed.**

This file records the SHA *before* its own commit, so §9's `git rev-parse` will
report one commit ahead whenever the handoff itself was the last thing written.

**Never push, open a PR, or comment via `gh` without being asked.** The user
applies changes themselves. Local commits are fine and expected.

## 4. Batches 9–12

108 tests, 21 files. Counts are exact, taken from
`src/data/webpet/webpetRunnerManager.csv`.

Batches 7 (A12 equipment + inventory, 17) and 8 (A7/B3 scan, device and time-in,
53) are done — commits `25826d5` and `2b45301`.

### Batch 9 — E9/E10 export + accounting (28 tests) ⚠️ hardest

| Source | Tests | Disabled rows |
|---|---|---|
| `tests/webpet/export-to-accounting.spec.ts` | 9 | `WP-0188`, `WP-0189`, `WP-0190`, `WP-0191`, `WP-0194`, `WP-0196` |
| `tests/webpet/reconcile-job-cards.spec.ts` | 10 | `WP-0301` |
| `tests/webpet/export-to-accounting-v2.spec.ts` | 2 | — |
| `tests/webpet/export-to-accounting-v2-mobile.spec.ts` | 2 | `WP-0181`, `WP-0182` |
| `tests/webpet/export-to-accounting-v2-exportrun.spec.ts` | 1 | `WP-0180` |
| `tests/webpet/export-to-accounting-v2-recent-exports.spec.ts` | 1 | — |
| `tests/webpet/export-to-accounting-v2-retry.spec.ts` | 1 | — |
| `tests/webpet/export-to-accounting-v2-row-selection.spec.ts` | 1 | `WP-0185` |
| `tests/webpet/equiv/export-pet-setup-equivalence.spec.ts` | 1 | (stale, `testIgnore`) |

**11 of these 28 rows are `enabled=0` and have never executed.** Treat them as
**unverified code, not coverage being moved** — see §6. Budget repair time.

Two more traps:
* `equiv/export-pet-setup-equivalence.spec.ts` carries the surviving half of the
  `HOST_BOUND` mechanism (`testIgnore` in `playwright.config.ts`). When it
  relocates, delete `hostBoundExclusions.json` and the config import. Its row is
  `stale=true`; it becomes `enabled=0` (its baseline file exists only on the
  `windows-automation` host).
* **Never move `hostBoundExclusions.json` into `src/data/runner/`** —
  `MultiFileDataReader` reads every file there and would ingest it as runner rows.

### Batch 10 — dashboard + report editor (18 tests)

| Source | Tests |
|---|---|
| `tests/webpet/report-editor-wysiwyg.spec.ts` | 13 |
| `tests/webpet/dashboard.spec.ts` | 5 |

`dashboard.spec.ts` is B14 + F1; `report-editor-wysiwyg.spec.ts` is F7. All three
are `partial`.

### Batch 11 — shared screens, non-catalog (36 tests)

| Source | Tests |
|---|---|
| `tests/webpet/parent-picker.spec.ts` | 21 |
| `tests/webpet/form-field-states.spec.ts` | 6 |
| `tests/webpet/select-smoke.spec.ts` | 4 |
| `tests/webpet/localization.spec.ts` | 3 |
| `tests/webpet/mobile-tab-labels.spec.ts` | 1 |
| `tests/webpet/console-diagnostic.spec.ts` | 1 |

All non-catalog → `screens.csv`, `SCR-###`, `test-plans/screens/shared.md`.

**This batch releases the held-back page objects.** `parent-picker.spec.ts` alone
consumes `CrewFormPage`, `CustomerFormPage`, `EmployeeFormPage`, `FieldFormPage`,
`VarietyFormPage`, `EquipmentFormPage`, `JobFormPage` and `UsersFormPage` — every
one currently pinned under `src/pages/webpet/` by the last-consumer rule (§6).

**Trap:** `select-smoke.spec.ts` declares `mode: 'serial'`. Preserve it.

### Batch 12 — profile, timesheet, notifications (26 tests)

| Source | Tests |
|---|---|
| `tests/webpet/notifications.spec.ts` | 11 |
| `tests/webpet/timesheet_validation.spec.ts` | 11 |
| `tests/webpet/profile-change-password.spec.ts` | 3 |
| `tests/webpet/profile-avatar.spec.ts` | 1 |

Deliberately last — the hardest file set.

* `notifications.spec.ts` is the **only** consumer of
  `src/fixtures/webpetAnonymous.fixture.ts`. It needs a clean-context option on
  `base.fixture` (the long-deferred "A2" item).
* **Two `test.fail()` trip-wires must survive the move**, exactly:
  * `tests/webpet/notifications.spec.ts:390` — `test.fail(true, 'app bug: api.ts
    calls handleAuthExpiry() without the response code …')`
  * `tests/webpet/profile-change-password.spec.ts:35` — `test.fail(true, 'app bug:
    api.ts redirects on every non-session/me 401, ignoring meta.suppressStatuses
    …')`

  Both take arguments, so **`grep "test.fail()"` does not find them** — search for
  `test\.fail` instead. Each marks a real, tracked app bug: the test is *expected*
  to fail, and an app fix flips it to an unexpected pass, which is the signal to
  remove the annotation. **Dropping one turns a tracked bug into a silently green
  test.**
* `timesheet_validation.spec.ts` has **16 silent early-return guards** and is
  module-gated on `TimeSheetEntry`. Every one of its 11 tests can currently report
  *passed* having asserted nothing. Converting the guards to
  `test.skip(true, '<reason>')` is what reveals whether the module is licensed.
  It already declares `mode: 'serial'` — preserve it.

## 5. Per-batch procedure

Followed for batches 1–6. Deviating from it is how counts drift.

1. **Scout (orchestrator, before any agent).** For each source spec: exact
   `test()` count, which `pages.*` accessors it uses, and **who else in
   `tests/webpet` still uses each** (`grep -rl "pages\.<acc>\b" tests/webpet`).
   Check the coverage map for workflow mapping and existing requirement ids.
2. **Planner** (`playwright-test-planner`, model `fable`, background). Give it the
   verified facts so it does not re-derive them, the standing rules (§6), and the
   traps. Ask for the §4 handoff block plus explicit decisions on: row destination
   and ids, requirement home (reuse existing ids where they exist), coverage
   depth, and file split.
3. **Generator** (`playwright-test-generator`, model `sonnet`, background). Scope
   it to **the new spec files only**. It must report the complete
   id→requirement mapping with EARS-ready statements — the CSV and plan are
   derived from that.
4. **Infrastructure, in parallel with the Generator** (orchestrator):
   * `git mv` page objects whose **last** web-pet consumer is in this batch, into
     `src/pages/setup/` (or `src/pages/processing/` etc.). Fix their base-class
     imports to `'../webpet/WebpetListPage'` / `'../webpet/WebpetFormPage'`.
     **Grep for two-level relative imports too** (`'../../BasePage'`) — a
     one-level-only check missed `TimeCardFormPage` in batch 6.
   * Repoint both registries' import paths; keep the web-pet registrations until
     the source specs are deleted, then remove them.
   * Register accessors in `src/fixtures/pages.fixture.ts` under the **same
     names** the specs already use.
   * `npm run typecheck` — the tree must compile at every intermediate step.
5. **Derive rows from the written specs — never hand-write them.** Parse each new
   spec for title, `testCaseId`, `requirement` and the `tag` array, then join to
   the web-pet row **on exact `testTitle`** to reuse the authored `testName` and
   `testDescription`. A reworded or dropped test fails that join, which is the
   point. Inherit `modules` from the workflow's existing draft row rather than
   typing it — `runner:check` validates it against `catalog.modules`.
   Working script: `scratchpad/gen-rows-b6.js` (adapt per batch).
6. **Apply**: insert rows into the right block of `src/data/runner/journey-*.csv`
   or `screens.csv`; delete the moved `WP-` rows from
   `src/data/webpet/webpetRunnerManager.csv` (**the `.csv` is authoritative —
   never edit the generated `.json`**); `git rm -f` the source specs.
7. **Plans**: author `test-plans/<area>/<file>.md` from the Generator's EARS.
   Update `src/data/catalog/workflow-coverage-map.json` — `webpetSpecs` must not
   name a deleted path, or `coverage:trace:check` fails.
8. **Gates** (all must pass):
   ```
   npm run typecheck
   npm run lint                     # 0 errors; 59 warnings is the current baseline
   npm run runner:sync && npm run runner:check
   npm run webpet:runner:sync && npm run webpet:runner:check
   npm run coverage:trace && npm run coverage:trace:check
   ```
9. **Counts must move in lockstep** — journey `+N`, web-pet `−N`, same `N`:
   ```
   npx playwright test --list
   WEBPET_ENABLED=1 npx playwright test --project=webpet --list
   ```
10. **Live run on dev staging.** `--list` is not verification.
    ```
    npm run test:dev -- <paths> --project=chromium --reporter=list
    ```
    Specs under `tests/api/` belong to the separate `api` project
    (`playwright.config.ts` `testDir: ./tests/api`). A mixed batch needs
    `--project=chromium --project=api`, or the api specs are silently not run.
    Redirect to a file; do not pipe through `grep` alone — a filter that matches
    nothing has twice hidden a real result.
11. **Failures** → classify first, then `playwright-test-healer`. Never weaken an
    assertion to go green.
12. **Commit** with `git commit -F <file>` (PowerShell here-strings break on
    embedded quotes). Message shape: a `refactor(webpet): …` subject, then what
    moved with counts and the lockstep numbers, then the live-run result, then one
    paragraph per non-obvious decision or defect found — cause first, fix second.
    End with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## 6. Conventions and hard rules

**Standing user rules.**
1. **Reuse, do not rewrite.** Move assertions verbatim — same order, same page
   objects. Change only the fixture, ids and tags.
2. **Assertions must be real.** A failing assertion is meant to become a bug
   report; one that cannot fail is worse than no test. Never weaken, reorder or
   drop one. Repair what makes an assertion vacuous instead.
3. **Dev staging is the target.** Always `npm run test:dev`. A bare
   `npx playwright test` targets `localhost:3000`, dies at `auth-setup` with
   `ERR_CONNECTION_REFUSED`, and reports every test as "did not run".
4. **No direct GitHub writes.** No push, PR, or comment without being asked.

**Framework rules.**

* **The traceability staleness guard requires `enabled=1`.**
  `scripts/catalog/traceability.js` counts a row as automated only when
  `status === 'automated' && String(r.enabled) === '1'`. A quarantined row is
  still `status=automated`; counting it made the guard demand a coverage depth for
  a workflow whose only automation never runs. `D3-002` exposed this.
* **Never `test.skip('title', …)`.** The checker parses specs with regular
  expressions, so that form hides the title and exempts the test from every tag
  and requirement rule. Use a plain `test('title', …)` with
  `test.skip(true, '<reason>')` as the **first statement in the body**.
* **Quarantined tests must show their reason in the run report.** `enabled=0`
  gives a gate skip; a body `test.skip(true, reason)` names the cause. Both are
  used together only when an accidental run would be destructive (`D3-002` writes
  uncleanable rows). A silent `return` guard is never acceptable — it reports
  *passed* having asserted nothing.
* **Titles and annotation descriptions must be single-quoted literals.** The
  checker is regex-based, not AST-based, because it runs in CI before any build.
  Loop-generated tests must be expanded into literal `test()` calls.
* **The visibility guard** in `runner:check` fails a spec that declares more
  `test()` calls than the parser can see. `specTestCallCounts()` strips comments
  with a **string-aware scanner** — a regex strip breaks on URL globs, because
  `'**/x/**'` contains both comment delimiters.
* **Page-object rule:** an object moves to its journey home only in the batch that
  relocates its **last** remaining `tests/webpet` consumer. Until then
  `pages.fixture.ts` imports it across the tree. The alternative ("move with the
  first consumer") does not scale — `parent-picker.spec.ts` alone would collapse
  most remaining batches into one.
* **`mode: 'serial'` is load-bearing.** `fullyParallel: true` at `workers: 2`
  splits a file's tests across workers, so a test reading back a record an earlier
  test created **races it and skips** rather than failing. Preserve every source
  declaration exactly; do not add new ones where records are provisioned in
  `beforeAll`. Exactly three remaining web-pet specs declare it —
  `tests/webpet/select-smoke.spec.ts` (batch 11),
  `tests/webpet/time-in.spec.ts` (batch 8) and
  `tests/webpet/timesheet_validation.spec.ts` (batch 12):
  `grep -rln "describe.configure" tests/webpet --include=*.spec.ts`.
* **Workers stay at 2.** Fix contention with retries, never by lowering width.
* **`base.fixture` does not pin `pt.locale`** (the web-pet fixture did). Positive
  English-text assertions fail loudly and are acceptable; a bare **absence**
  assertion on English copy passes vacuously and needs a positive anchor first, or
  a locale-neutral locator.
* **`base.fixture` does not swallow `route.fetch: …has been closed`.**
  `webpet.fixture` does. Any relocated spec using `page.route` with a real round
  trip needs that `try/catch` itself, or it fails on a teardown race.
* **Playwright's default `actionTimeout` is 0.** One unmatched locator is bounded
  only by the test timeout and consumes the whole budget. A generic "test timeout
  exceeded" does **not** prove the flow was merely slow — raising the timeout just
  makes the hang longer.
* **A guard that reads the filesystem may be a stale proxy.** `existsSync` on an
  auth storage state meant "provisioned and live" only while a `setup` project
  dependency refreshed it. Relocation drops that dependency, so the same guard
  silently flips from *skip* to *run against a dead session*. Check what refreshes
  any file a relocated guard tests for. `A7-051` is the worked example.
* **Sync test bodies are invisible to `runner:check`.** A placeholder written
  `}, () => {` parses as 0 tests; the F1 guard catches it as a declared-vs-parsed
  mismatch. Use `async` bodies everywhere, including body-skipped placeholders.
* **`playwright/no-networkidle` is `warn` only under `tests/webpet/**`**
  (`config/lint/.eslintrc.json`). Any relocated spec carrying a `networkidle` wait
  turns it into a lint **error** on arrival. Decide deliberately: suppress with
  reasoning, or rewrite and prove the rewrite with a run. Do not rewrite a wait
  blind in a relocation batch.
* **A test that was `skipped` or `enabled=0` in web-pet is unverified code**, and
  the page object under it has usually rotted. See §7.
* **Setup and cleanup go through the app's API.** There is no DB access; the SQL
  layer was deleted 2026-08-04. Stale comments prescribing SQL cleanup are wrong
  and have caused real leaks.
* **`WEBPET-1798`:** Employee and Validation have no purge endpoint, so a
  soft-deleted name is owned forever. Always use run-unique names for those.
* **Running the Generator agent rewrites `tests/seed.spec.ts`** (an MCP scaffold
  side effect) and breaks typecheck. `git checkout -- tests/seed.spec.ts` after.

## 7. Open defects

### `A5-018` — `EmployeeDocumentsComponent`, one locator defect outstanding

Row `A5-018` in `src/data/runner/journey-a.csv` is **`enabled=0`**. Spec:
`tests/web/journey-a-setup/a05-employee-documents.spec.ts`. Component:
`src/components/webpet/EmployeeDocumentsComponent.ts`.

`A5-R19`, `A5-R20` and `A5-R21` are **unproven** — the Documents tab has no
working automated coverage.

The component was written for a standalone Documents panel; the panel actually
renders **inside the employee form**, surrounded by that form's controls. The test
was `skipped` in web-pet (see `docs/catalog/runs/31692620907-webpet.json`) and had
never executed, so nothing arbitrated between its doc comments and its selectors.

| # | Locator | Defect | Status |
|---|---|---|---|
| 1 | `getByRole('tab', { name: 'Documents' })` | the control is a `button` | fixed |
| 2 | `input[type="file"]` | matched 2 elements, strict-mode violation | fixed (`:visible`) |
| 3 | `[data-slot="select-trigger"].first()` | grabbed the form's `EIC Type`, leaving Upload disabled | fixed (filter on `'Select type'`) |
| 4 | `button:has-text("Upload")` | correct, unreachable behind #3 | verified |
| 5 | `[data-slot="select-item"], [role="option"]` | **the opened type-select's options still match nothing** | **outstanding** |

Each defect surfaced only after the previous was fixed. Resolving #5 needs the
real DOM of the opened select. Note the agents' Playwright MCP tools default to
`TEST_ENV=local` and cannot reach dev staging — a browser check must come from a
session that can drive dev, or from a failure snapshot under
`artifacts/results/*/error-context.md`.

Full diagnosis: `test-plans/journey-a/a05-employee-setup.md`.

### Other `enabled=0` rows (deliberate, not defects to fix now)

| Row | File | Reason |
|---|---|---|
| `A3-012` | `journey-a.csv` | `ensureJob` cannot build a savable paymentType 8/15 job; `POST /api/jobs` rejects `lookBackPeriod` with `400 invalid_body`. **A data-factory task, not a spec edit.** `A3-R16`/`A3-R17` unproven. |
| `D3-002` | `journey-d.csv` | No multi-entry time-card surface exists, and the test writes TimeCard rows dated 2099 with **no cleanup path**. Double-guarded. Re-enabling needs the capability **and** a TimeCard delete route. |
| `A6-004` | `journey-a.csv` | Host-bound; its baseline file exists only on the `windows-automation` host. |
| `A7-051` | `journey-a.csv` | PET-441 restricted-user leakage. Its `existsSync(WEBPET_RESTRICTED_STORAGE)` skip guard was only valid inside the web-pet project, whose `webpet-setup` dependency refreshed that storage stateevery run. The journey `api` project has none, so the stale session-cookie file 401s. **Needs journey-side provisioning (RET-03), not a spec edit.** `A7-R16` unproven. |

## 8. Phase 2 — retirement checklist

Run only after batch 12, when `tests/webpet` holds no spec files and
`src/data/webpet/webpetRunnerManager.csv` holds no rows.

* **RET-01 — CI.** Remove the `webpet` matrix leg from
  `.github/workflows/e2e.yml`; delete `.github/workflows/webpet-e2e-local.yml`.
  The journey leg's `timeout-minutes` is already 90 (raised in Phase 0).
* **RET-02 — scripts.** Remove the ~15 `webpet:*` npm scripts from
  `package.json`, delete `scripts/webpet/`, drop the web-pet ESLint override, and
  update the Slack reporter's branch handling.
* **RET-03 — fixtures and config.** Delete `src/fixtures/webpet.fixture.ts`,
  `src/fixtures/webpetPages.fixture.ts`, `src/fixtures/webpetAnonymous.fixture.ts`,
  `src/fixtures/gate/webpetGate.ts`, `src/config/webpetEnv.ts`,
  `src/config/webpetPaths.ts`, and the `webpet-setup`/`webpet` projects in
  `playwright.config.ts`. Move whatever still lives under `src/pages/webpet/` and
  `src/components/webpet/` to its journey home and collapse the directories.
  Remove `EXCLUDED_TEST_DIRS`'s `webpet` entry in
  `scripts/runner/lib/runner-data.js`.
* **RET-04 — docs.** Supersede `ADR-0001`, collapse `webpetSpecs` out of
  `src/data/catalog/workflow-coverage-map.json`, and update `README`/`test-plans`
  references.
* **RET-05 — agent config.** Update `.claude/profiles/` and `.claude/skills/`;
  tag the pre-retirement state as `webpet-lift-v1` first.
* **RET-06 — delete and verify.** `git rm -r tests/webpet src/data/webpet`, then a
  full green suite run plus every gate in §5 step 8. Confirm **zero** references
  to `tests/webpet` repo-wide.

## 9. Verify state at session start

```bash
cd d:/RnD/playwrightNewFrameworkBuild/playwright-test-suite

git branch --show-current          # feature/suite-consolidation
git rev-parse HEAD                 # 2b45301 (or one ahead, if this file was recommitted)
git status --porcelain             # empty

npx playwright test --list | grep '^Total:'
#   Total: 314 tests in 37 files
WEBPET_ENABLED=1 npx playwright test --project=webpet --list | grep '^Total:'
#   Total: 108 tests in 21 files

npm run runner:check
#   378 rows across 8 files; 313 claimed by specs; 65 reserved
#   Catalog coverage: 13/69 workflows have at least one automated row
#   passes with 1 warning (scopes/anthony-vineyards.json confirmed=false — pre-existing)

npm run webpet:runner:check
#   OK — 107 tests all have rows (107 annotated, 0 structural), 1 known-stale

npm run coverage:trace:check
#   depth: {"journey":3,"screens":5,"partial":10,"none":51}

npm run typecheck                  # 0 errors
npm run lint                       # 0 errors, 59 warnings (baseline)
```

Sanity check that dev staging is reachable before starting a batch:

```bash
npm run test:dev -- tests/web/journey-a-setup/a04-crew-form.spec.ts \
  --project=chromium --reporter=list
#   12 passed (11 tests + auth-setup)
```

If `auth-setup` fails with `ERR_CONNECTION_REFUSED` at `localhost:3000`, the
command lost its `test:dev` env — re-run it exactly as written.
