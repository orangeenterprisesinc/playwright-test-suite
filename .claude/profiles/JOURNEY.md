# User Journey domain profile

Read this profile when the task touches `tests/web/`, `src/data/runner/`,
`src/data/catalog/`, or `test-plans/`. Orchestration contract:
[../PLAYWRIGHT_AGENT_WORKFLOW.md](../PLAYWRIGHT_AGENT_WORKFLOW.md).

## Facts

* One suite folder: `tests/web/journey-<x>-<area>/` (`chromium` project) holds
  UI, API-only and device/XML specs side by side, plus `tests/web/system/` for
  cross-journey system specs. There is no separate `tests/api/` (retired
  2026-08-26).
* Source of truth: the PET-Tiger workflow catalog — 6 journeys (A setup, B field
  harvest, C pack-house, D office processing, E payroll close, F analysis),
  69 workflows. `docs/catalog/PET-Tiger-Workflow-Catalog.docx` →
  `npm run catalog:import` → `src/data/catalog/workflow-catalog.json`.
  Journey R (Reports: R1, R2) is not in the docx; its entries carry a `source`
  (the reports pass/fail sheet) and survive a re-import.
  Extract single workflow nodes; never load all of them into context.
* Pipeline — one workflow id joins five artifacts (full contract in
  `test-plans/README.md`): catalog entry → recording (`docs/media/`, untracked)
  → plan (`test-plans/journey-<x>/<wf>-<slug>.md`, copied from
  `test-plans/_template.md`) → spec → runner rows
  (`src/data/runner/journey-<x>.csv`).
* Fixtures: `src/fixtures/base.fixture.ts` (browser + `sessionApi`; the default,
  also for API+UI device workflows like B1/B2) or `src/fixtures/api.fixture.ts`
  (browserless, no office session — relay/transport checks only). Page objects come as named fixtures from the `PageObjects` registry
  (`src/fixtures/pages.fixture.ts`); classes live in `src/pages/<area>/`
  (`admin/`, `connectivity/`, `input/`, `processing/`, `setup/`, `shell/` today;
  `payroll/` and `analysis/` are reserved landing zones). Never import
  `webpet.fixture` or `@pages/webpet/*` here — the registries are not
  interchangeable (a shared `components/webpet/*` component is fine, and lint
  draws exactly that line).
* Tags: `@Journey<X>` + `@<WF>` on describe; `@Smoke`/`@HighLevel`/`@Regression`
  tiers on tests (max one `@Smoke` per file; tier tags must equal the CSV row's
  `tags`). Annotation: `testCaseId` only, and it is the **workflow id** (`C6`,
  never `C6-001`).
* Runner CSVs are **authored by hand** (the opposite of webpet's discovered CSV):
  `npm run runner:sync` regenerates the JSON mirrors, `npm run runner:check`
  fails on drift, `npm run coverage:catalog` reports per-workflow state.
* Data: one JSON scenario file per spec, `src/data/journey-<x>/<spec-basename>.json`, loaded with `loadScenario(schema, testInfo)` (`src/utils/data/scenarioLoader.ts`) and validated by `src/data/schemas/`; shared fixture tables in `src/data/journey-<x>/fixture.json`; generated factories in `src/data/generated/` (flows only — specs may not import them); cleanup declared as `cleanup: CleanupStep[]` in the JSON and run by `runCleanup` — under the cleanup allowance of the UI-first rule below, never the DB. The only inline literals in a spec: `testCaseId`, `tag:`, titles, `expect()` messages.
* Transfer isolation: data and cleanup are per test. Each committing spec owns a (day, crew) pair, recorded in the scenario `_notes` and the schema checks (two specs may share a day on different crews). A commit goes through `openScopedCandidates({ crew })` → `scopeToTimeCardCrew`; the Work Crew grid filter only hides rows, it is not scope. `commitTransfer` rejects an execute whose `crewIds` is `[]`, and a short analyze fails by name (lost job vs time cards not on screen).
* Conventions by path (agents Read on demand, never restated here):
  specs `.claude/skills/pw-spec-author/SKILL.md` · page objects
  `.claude/skills/pw-page-object/SKILL.md` · runner/gate mechanics
  `.claude/skills/data-driven-testing/SKILL.md`.

## UI-first (binding for tests/web/**)

A journey spec does on screen everything the workflow under test does on screen. The
app's HTTP API may be used only for four things ((b)-(d) keep their letters because
code comments cite them):

* **arrange** — reference data the workflow itself never creates (ranch, field, job,
  crew, employee, question, crew table), created only when missing or restored from the
  recycle bin.
  Never a preference, never a punch, time card or job card, never a record the workflow
  creates or edits. (History: the old configuration allowance (a) was withdrawn
  2026-10-15 — a preference is set on its screen through a page object, or gated:
  `environment-gate: <key>`, fail by name, never write it);
* **(b) cleanup** — the before-phase sweep of a previous run's residue and the
  after-test teardown (`runCleanup`, `cleanupScope`, residue sweep, fixture reconcile);
* **(c) device simulation** — building PET Pocket XML envelopes and pushing/pulling
  them through the Post Office relay (`src/utils/relay/*`). The office's import click
  (Connectivity ▸ Import ▸ Internet) and Push to Device are user actions, not the
  device: they stay on screen, and so does the Single Folder upload
  (Connectivity ▸ Import ▸ Single Folder, `IMPORT_TRANSPORT=single-folder`).
  `substituteTransport` (`OFFICE_TRANSPORT_SUBSTITUTE=1`) stays a violation by design;
* **(d) plumbing reads** — GETs (plus the non-committing `transfer-to-job-cards/analyze`
  and `job-cards-preview` POSTs) only for ids a cleanup needs (recorded from a scoped GET
  *before* asserting, the D6 pattern), polling until a save lands, and the `session/me` /
  `preferences` / module gates that fail a scenario loudly by key. **A read is never the
  proof of a workflow outcome — the screen proves it.** A value no screen shows is
  asserted from the API only with `testInfo.annotations.push({ type: 'api-only-evidence',
  description })` and a row in the plan's allowances table;
* **Navigation** — menu, then list filter, then row click; `page.goto` only in `openApp`
  and login. The `page.reload` in `LeftNavigationPage.openScreen`,
  `SetupScreenPage.gotoEditById` and `ScanDevicePage.gotoEdit` is the user's F5. A screen
  with no menu entry keeps its `goto` with a `deep-link` annotation and a comment;
* **Teardown restore** — an API PUT/DELETE that puts back what the test changed on screen
  is `cleanup` (it survives a test timeout; an on-screen restore does not).

Everything else — every record the workflow creates or edits on a screen — is driven on
screen through a page object. The fixed fixture rows (ranch, field, crew, employee, job,
crew table, question, user, scan device) are created on screen
(`src/utils/fixtureRows/ensureOnScreen.ts`) or through the API when missing (`arrange`);
either is acceptable, the workflow's own records are always on screen. Time cards and
job cards have no name and are never swept by prefix: they are deleted by id, from ids
recorded under (d).

Enforced twice. ESLint bans `@utils/api/*`, `@utils/relay/*`, `@utils/cleanup/*` and
`sessionApi.get|head|post|put|patch|delete` from specs, and `page.goto` from specs and
flows — specs reach the API only through
`@utils/journeys/*`. At run time `src/utils/api/writeGuard.ts` rejects any
POST/PUT/PATCH/DELETE made outside `allowApiWrites('arrange'|'cleanup'|'device', reason, fn)`;
`UI_FIRST_GUARD=warn` annotates the test (`ui-first-violation`), `enforce` throws
`UiFirstViolation`. `npm run ui-first:audit` lists a run's violations; reads are
visible with `UI_FIRST_READS=ledger` and `npm run ui-first:audit -- --reads`. **CI runs
`warn`** until the planned flip to `enforce` (PR 2); a new spec is still verified
locally with `UI_FIRST_GUARD=enforce` before it is pushed. `arrange` is declared only
inside `setupEntitiesApi.ts`, `questionsApi.ts` and `ensureOnScreen.ts` — never in a
journey flow or spec. The web-pet suite (`tests/webpet/`) is out of scope: its `data-factory.ts`
API seeding is part of its frozen baseline.

Why the rule exists: D6 was the first journey driven entirely on screen, and doing
that exposed a fixture that had been invalid for weeks while the API-driven version
stayed green — inactive employees with no home crew, an inactive job, a time-in with
no Phase. **The API accepts what the product rejects, so an API-driven journey does
not prove the workflow works.**

## Creating automation from the catalog

Entry point: `.claude/skills/journey-from-catalog/SKILL.md` ("automate A2").
The **test-plan file is the Planner → Generator handoff** — path-based and
human-reviewable.

1. **Resolve** — orchestrator extracts the workflow node from
   `workflow-catalog.json` and checks `npm run coverage:catalog` for current
   state; stop if already automated.
2. **Plan** — Planner (Fable 5 for the journey's first workflow, Sonnet once a
   sibling plan exists) receives: the workflow id, the catalog node (~20 lines
   inline), and paths to `test-plans/_template.md`, the worked example
   `test-plans/journey-a/a01-user-setup.md`, and this profile. It explores only
   the screens the catalog names; recordings are referenced by path for the human
   reviewer; ambiguity goes to the plan's "Open questions". The orchestrator
   writes the plan to `test-plans/journey-<x>/<wf>-<slug>.md`.
3. **Checkpoint** — non-empty "Open questions" → pause for the human before
   generating.
4. **Row** — orchestrator adds **one** runner row `enabled=0` to
   `src/data/runner/journey-<x>.csv`, id = the workflow id, then
   `npm run runner:sync`.
5. **Generate** — Generator (one invocation per plan, not per test) receives the
   plan path, this profile, `pw-spec-author`, and the target spec path.
   Always `tests/web/journey-<x>-<area>/`; the `surface` sets the runner
   category (`ui` → ui, `calc` → workflow tagged `@Workflow`, `device` → api
   or workflow when the spec also verifies in the UI).
6. **Run** — affected specs only (`--grep @<WF>`); failures → Healer with the
   artifact paths.
7. **Finalize** — rows to `status=automated`, `enabled=1`, re-sync,
   `npm run runner:check`; report the `coverage:catalog` delta.

## Healer notes

* Gate-skips masquerade as green — run the gate-skip check in
  `.claude/skills/pw-failure-triage/SKILL.md` (Step 1) before any triage.
* Journey capture is `retain-on-failure` for trace and 720p video, screenshot on
  failure — a red test always has a trace under `artifacts/results/`; a green one
  leaves nothing (trace-on cost 96–183 s per test at context close, 2026-10-29).
* Never weaken an assertion tied to an expected outcome in the plan; if the app
  contradicts the plan, report a potential product bug instead of healing around it.

## The one rule that shapes every journey

**One ticket, one spec file, one happy-path test, one runner row — and the id is
the workflow id.** No negative, edge, boundary, additional-positive or
setup-only cases; no EARS acceptance criteria and no `<WF>-R<n>` requirement ids.
A plan's "Expected outcomes" are plain sentences, and anything automation will
not assert is listed there with its reason (`not automatable`, `deferred`,
`(POM)`) so a gap never reads as silence.

This overrides the generic "cover edge cases / include negative testing"
guidance in the planner agent's own definition: that agent is shared, this
profile is the journey contract. Say so explicitly in every Planner invocation.

## Validation

* `npm run runner:check`, `npm run typecheck`, `npm run lint`
* Affected specs only: `npm run test:dev -- <file>` (chromium project);
  full-suite runs only for suite-wide fixture/config changes.
