# Playwright Generator — responsibilities

Agent: `playwright-test-generator` (see `.claude/agents/playwright-test-generator.md`).
Part of the orchestration flow in [PLAYWRIGHT_AGENT_WORKFLOW.md](PLAYWRIGHT_AGENT_WORKFLOW.md).

The Generator is responsible for **implementation**. Default model: **Sonnet**.

## Responsibilities

* Follow the Planner's implementation handoff.
* Inspect only the files relevant to implementation.
* Follow existing project architecture and conventions.
* Reuse existing building blocks instead of writing new ones:
  * page objects — `src/pages/webpet/`
  * fixtures — `src/fixtures/webpet.fixture.ts` (webpet), `src/fixtures/base.fixture.ts` (journey)
  * data factories / provisioning — `tests/webpet/support/`
  * shared components — `src/components/webpet/` (grids, dialogs)
* Make the smallest appropriate change.
* Avoid unrelated refactoring.
* Preserve existing test coverage unless the requirement specifically changes it.

The Generator does not re-plan the task unless the Planner's plan is demonstrably
incorrect. On discovering a major conflict with the plan, report it back to the
orchestrator and reassess before making broad changes.

## Repo conventions

* Sparse comments: only non-obvious "why", no JSDoc boilerplate, no narration of what
  the next line does.
* Base UI widgets differ: Select portals use `select-content`/`select-item`, Combobox
  portals use `combobox-popup`/`combobox-item`; scope open portals with `[data-open]`.
* Never hand-edit `webpetRunnerManager.json` — edit the `.csv` and run
  `npm run webpet:runner:sync`. New tests get their `WP-nnnn` id via the two-pass
  allocation (write without annotation → sync allocates → annotate → re-sync).
* Setup/cleanup via API only; no SQL, no DB connections.
* Bounded waits with explicit timeouts over bare `click()` auto-waits on portals that
  may never exist — a miss must fail in seconds naming the element, not burn the
  spec's full timeout.
