# Playwright AI Agent Orchestration Workflow

This repository uses a multi-agent Playwright workflow.

For every Playwright-related task — bug, test failure, test-generation request, framework
change, or automation maintenance — follow this workflow unless the task explicitly
requires otherwise. (Non-Playwright work — docs, CI YAML, report analysis — is exempt.)

The agents are defined in `.claude/agents/`:

| Stage | Agent | Responsibilities doc |
|---|---|---|
| Plan | `playwright-test-planner` | [PLAYWRIGHT_PLANNER.md](PLAYWRIGHT_PLANNER.md) |
| Implement | `playwright-test-generator` | [PLAYWRIGHT_GENERATOR.md](PLAYWRIGHT_GENERATOR.md) |
| Heal | `playwright-test-healer` | [PLAYWRIGHT_HEALER.md](PLAYWRIGHT_HEALER.md) |
| Git / PR / CI | (orchestrator) | [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md) |

When invoking an agent, tell it to Read its responsibilities doc first.

## Critical rule — existing agents are preserved

The three agent definitions in `.claude/agents/` (`playwright-test-planner.md`,
`playwright-test-generator.md`, `playwright-test-healer.md`) are the configured agents.

**Never delete, recreate, rename, replace, or rewrite them. Never modify their prompts,
tools, responsibilities, or configuration unless the human explicitly asks.**

This workflow and the per-stage docs are an **orchestration layer only** — they govern
how the existing agents are invoked and coordinated; they do not replace or amend the
agents themselves.

Model preferences (§6) are applied only through the Agent tool's per-invocation `model`
parameter, which the current setup supports. Do not edit agent frontmatter to force a
model. Before any configuration change, inspect the existing agent configuration and
confirm the change is orchestration-only.

## 1. Main Claude = Orchestrator

The main Claude session is the **orchestrator**.

It coordinates the workflow and must not perform the Planner, Generator, or Healer's
responsibilities itself.

The standard flow is:

```text
User
  ↓
Main Claude — Orchestrator
  ↓
Playwright Planner
  ↓
Playwright Generator
  ↓
Playwright execution + validation
  ↓
PASS ───────────────→ Final validation
  │
  FAIL
  ↓
Playwright Healer
  ↓
Re-run validation
  │
  └── difficult/unresolved → escalate to Fable 5 / Opus
  ↓
Final validation
  ↓
GitHub (see GITHUB_WORKFLOW.md)
  ↓
Commit → Push → PR
  ↓
GitHub CI
  ↓
GREEN ──────────────→ Human review
  │
  RED
  ↓
Playwright Healer
  ↓
Fix → Commit → Push → CI again
  ↓
Human review
  ↓
Human merges PR
```

## 2. Playwright Planner

Analysis and planning only, never implementation. Full contract in
[PLAYWRIGHT_PLANNER.md](PLAYWRIGHT_PLANNER.md). Use the strongest reasoning model
available for difficult planning work, preferably **Fable 5**.

## 3. Playwright Generator

Implementation from the Planner's handoff. Full contract in
[PLAYWRIGHT_GENERATOR.md](PLAYWRIGHT_GENERATOR.md). Default model: **Sonnet**.

## 4. Playwright Execution

After implementation, run the appropriate Playwright tests, plus this repository's
validation:

* `npm run typecheck`
* `npm run lint`
* `npm run webpet:runner:check` (webpet suite; new tests also need the runner-CSV
  two-pass id allocation via `npm run webpet:runner:sync`)
* any other project-specific validation the task touches

Do not assume that successful code generation means the task is complete. Prefer lean
verification: run the affected spec files, not the full suite, unless the change is
suite-wide.

## 5. Playwright Healer

Invoke the Healer **only when a validation or Playwright execution failure occurs**.
Full contract in [PLAYWRIGHT_HEALER.md](PLAYWRIGHT_HEALER.md). Default model: **Sonnet**.

The Healer must diagnose before changing anything, and must never blindly modify
assertions, locators, waits, or timeouts just to go green. If it cannot confidently
determine the cause, escalate to **Opus or Fable 5**.

## 6. Model Selection

Agent definitions default to `model: sonnet`; the orchestrator overrides per invocation
via the Agent tool's `model` parameter according to task complexity.

### Fable 5

* complex Planner work
* difficult root-cause analysis
* architecture decisions
* complicated Playwright failures / difficult cross-file reasoning
* escalation when another agent cannot confidently resolve the issue

### Opus

* complex implementation/review
* difficult debugging
* cases where Sonnet requires deeper reasoning
* escalation step before Fable 5 when appropriate

### Sonnet (default)

* Playwright Generator and Healer
* normal coding, test implementation, debugging
* locator work, fixture changes, routine code review

### Haiku

* lightweight repository searches, simple file discovery
* locating definitions/usages, extracting small pieces of information

Do not use Fable 5 or Opus for simple tasks that Sonnet or Haiku can handle.

## 7. Context and Token Efficiency

Minimize duplicated context across agents. Do not make every agent independently read
the entire repository. Use targeted handoffs:

```text
Planner   → requirement + relevant repository context   → concise plan
Generator → Planner handoff + implementation files       → diff
Healer    → failure output + relevant diff + source      → smallest fix
```

Reuse information already established by previous agents instead of rediscovering it.

## 8–11. Git, GitHub, CI, Human Approval

See [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md): dedicated branch → reviewed diff →
commit → push → PR → CI loop → **human reviews and merges**. Merge, force-push,
branch deletion, and settings/secrets changes are human-only.

## 12. Agent Invocation Requirement

The orchestrator must actually invoke the configured Playwright agents. Do not merely
describe what the Planner, Generator, or Healer would do and then perform the work
directly in the main session.

Progress should clearly identify the active stage:

```text
[Planner - Fable 5]
[Generator - Sonnet]
[Playwright validation]
[Healer - Sonnet]
[Escalation - Opus/Fable 5]
[GitHub]
[PR created]
[CI validation]
```

If a required agent is unavailable, report that condition — never silently replace it.

**Known gap:** the agents' browser/test-run tools come from the `playwright-test` MCP
server. When that server is disconnected, the agents keep their file tools (Glob, Grep,
Read; the Healer also Edit/Write) but lose browser and `test_run` tools. In that state
the orchestrator runs tests between stages and says so explicitly in its report.

## 13. Final Completion Criteria

A Playwright task is complete only when:

* the required implementation is complete;
* relevant Playwright tests pass;
* required validation passes;
* the final diff has been reviewed and contains no unrelated changes;
* the PR is created/updated;
* GitHub CI is green, or any remaining CI issue is explicitly reported;
* the PR is ready for human review.

The final response should briefly state:

```text
Planner result
Generator changes
Healer activity, if any
Tests executed
Validation results
Git branch
Commit
Pull Request
CI status
Remaining issues
```

## Core principle

```text
Fable 5 → Think / Plan / Deep reasoning
Sonnet  → Build / Debug / Heal
Haiku   → Find / Inspect / Lightweight tasks
Opus    → Complex escalation / deep implementation
```

The main Claude session coordinates these agents and the GitHub workflow rather than
doing all of the work itself.
