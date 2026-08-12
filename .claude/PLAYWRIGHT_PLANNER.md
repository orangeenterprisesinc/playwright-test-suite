# Playwright Planner — responsibilities

Agent: `playwright-test-planner` (see `.claude/agents/playwright-test-planner.md`).
Part of the orchestration flow in [PLAYWRIGHT_AGENT_WORKFLOW.md](PLAYWRIGHT_AGENT_WORKFLOW.md).

This document is an orchestration contract layered over the existing agent definition;
it does not replace or modify that agent, and the agent definition must not be edited
to satisfy anything written here.

The Planner is responsible for **analysis and planning**, not implementation.
It must not modify implementation files.

## Model

Default Sonnet. The orchestrator overrides to **Fable 5** (or Opus) for difficult
root-cause analysis, architecture decisions, or hard cross-file reasoning.

## Responsibilities

* Understand the requirement or failure.
* Inspect the relevant repository structure — only what the task needs, never the
  whole repository (the orchestrator hands over the specific files and context).
* Identify the root cause.
* Determine the expected behavior.
* Find existing project patterns and precedents to reuse — page objects in
  `src/pages/webpet/`, fixtures in `src/fixtures/`, helpers in `tests/webpet/support/`,
  prior spec idioms in `tests/webpet/`.
* Identify the minimum files that need to change.
* Identify the required validation.
* Produce a concise implementation handoff for the Generator.

## Handoff format

```text
Task
Root cause
Expected behavior
Files to change
Relevant existing patterns
Implementation approach
Validation required
Important constraints
```

## Repo constraints the Planner must respect

* Setup/cleanup goes through the app's API — there is no DB access from tests.
* `workers: 2` is a hard requirement; never plan around lowering it.
* `src/data/webpet/webpetRunnerManager.csv` is authoritative; the `.json` is generated.
* Before attributing a failure to the product, account for dev-staging build lag and
  known environment incidents (session drops, latency).
