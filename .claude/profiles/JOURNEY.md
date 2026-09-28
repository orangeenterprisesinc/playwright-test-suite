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
  Extract single workflow nodes; never load all 69 into context.
* Pipeline — one workflow id joins five artifacts (full contract in
  `test-plans/README.md`): catalog entry → recording (`docs/media/`, untracked)
  → plan (`test-plans/journey-<x>/<wf>-<slug>.md`, copied from
  `test-plans/_template.md`) → spec → runner rows
  (`src/data/runner/journey-<x>.csv`).
* Fixtures: `src/fixtures/base.fixture.ts` (browser + `sessionApi`; the default,
  also for API+UI device workflows like B1/B2) or `src/fixtures/api.fixture.ts`
  (browserless, no office session — relay/transport checks only). Page objects come as named fixtures from the `PageObjects` registry
  (`src/fixtures/pages.fixture.ts`); classes live in `src/pages/<area>/`
  (`admin/`, `shell/` today; `setup/`, `processing/`, `payroll/`, `analysis/`,
  `connectivity/` are reserved landing zones). Never import `webpet.fixture`
  here — the fixtures are not interchangeable.
* Tags: `@Journey<X>` + `@<WF>` on describe; `@Smoke`/`@HighLevel`/`@Regression`
  tiers on tests (max one `@Smoke` per file; tier tags must equal the CSV row's
  `tags`). Annotation: `testCaseId` only, and it is the **workflow id** (`C6`,
  never `C6-001`).
* Runner CSVs are **authored by hand** (the opposite of webpet's discovered CSV):
  `npm run runner:sync` regenerates the JSON mirrors, `npm run runner:check`
  fails on drift, `npm run coverage:catalog` reports per-workflow state.
* Data: one JSON scenario file per spec, `src/data/journey-<x>/<spec-basename>.json`, loaded with `loadScenario(schema, testInfo)` (`src/utils/data/scenarioLoader.ts`) and validated by `src/data/schemas/`; shared fixture tables in `src/data/journey-<x>/fixture.json`; generated factories in `src/data/generated/` (flows only — specs may not import them); cleanup declared as `cleanup: CleanupStep[]` in the JSON and run by `runCleanup` — API only, no DB. The only inline literals in a spec: `testCaseId`, `tag:`, titles, `expect()` messages.
* Conventions by path (agents Read on demand, never restated here):
  specs `.claude/skills/pw-spec-author/SKILL.md` · page objects
  `.claude/skills/pw-page-object/SKILL.md` · runner/gate mechanics
  `.claude/skills/data-driven-testing/SKILL.md`.

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
* Journey capture defaults are rich (trace and video on, plus a screenshot after
  every action from `src/fixtures/instrumentation/actionShots.ts`) — a first
  failure always has a trace under `artifacts/results/`.
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
