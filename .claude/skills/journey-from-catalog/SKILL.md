---
name: journey-from-catalog
description: Use when the user asks to automate a PET-Tiger catalog workflow by id (e.g. "automate A2", "cover B3") — extracts the workflow from src/data/catalog/workflow-catalog.json, plans it into a test-plans/ plan with the Playwright planner agent, generates the spec, wires runner rows, runs it, and heals failures.
---

## Catalog workflow → Playwright automation pipeline

Turns one catalog workflow id into a reviewed, passing spec using the Playwright
test agents (planner / generator / healer). The orchestration detail and journey
conventions live in `.claude/profiles/JOURNEY.md` — read it first.

### Prerequisites

- `src/data/catalog/workflow-catalog.json` present (regenerate from the docx with
  `npm run catalog:import` if stale).
- The app under test reachable at `BASE_URL` — the planner/generator drive a real
  browser. Without the app, stop after the plan draft and say so.

### Pipeline

1. **Resolve** — extract the single workflow node (id, title, steps, surface,
   segments, modules) from `workflow-catalog.json`; never load all 69 workflows.
   Check `npm run coverage:catalog` — if the workflow is already automated, stop
   and report.

2. **Plan** — invoke the `playwright-test-planner` agent (Fable 5 for the
   journey's first workflow, Sonnet once a sibling plan exists) with the catalog
   node and paths to `test-plans/_template.md`, the worked example
   `test-plans/journey-a/a01-user-setup.md`, and `.claude/profiles/JOURNEY.md`.
   It explores only the screens the catalog names. Write the resulting plan to
   `test-plans/journey-<x>/<wf>-<slug>.md` (the plan file IS the handoff).

3. **Checkpoint** — if the plan's "Open questions" section is non-empty, stop and
   ask the human before generating.

4. **Rows** — add one runner row per test case to
   `src/data/runner/journey-<x>.csv` with `enabled=0`, then `npm run runner:sync`.

5. **Generate** — invoke the `playwright-test-generator` agent once per plan (not
   per test) with the plan path, the JOURNEY profile, and
   `.claude/skills/pw-spec-author/SKILL.md`. Spec path from the workflow's
   `surface`: `ui` → `tests/web/journey-<x>-<area>/`, `calc` → same but tagged
   `@Workflow`, `device` → same folder, category `api` (or `workflow` when it also verifies in the UI).

6. **Run** — affected tests only: `npx playwright test --grep @<WF>`.

7. **Heal** — on failures, invoke the `playwright-test-healer` agent with the
   artifact paths. Healing must not weaken an assertion tied to an EARS
   requirement — if the app contradicts the requirement, report a potential
   product bug instead of healing around it.

8. **Finalize** — set the rows to `status=automated`, `enabled=1`, re-sync, then
   `npm run runner:check`, `npm run typecheck`, `npm run lint`. Report the
   `coverage:catalog` delta and which requirements are covered vs not (and why).
