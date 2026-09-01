# Playwright AI Agent Orchestration Workflow

One orchestration layer serves two automation domains:

* **Web-PET** — maintaining the existing E2E suite (`tests/webpet/`, ~406 tests)
* **User Journey** — creating and maintaining automation from the PET-Tiger
  workflow catalog (`tests/web/`, `test-plans/`)

For every Playwright-related task — bug, test failure, test-generation request,
framework change, or automation maintenance — follow this workflow unless the task
explicitly requires otherwise. (Non-Playwright work — docs, CI YAML, report
analysis — is exempt.)

The agents are defined in `.claude/agents/`:

| Stage | Agent | Contract |
|---|---|---|
| Plan | `playwright-test-planner` | §4 |
| Implement | `playwright-test-generator` | §4 |
| Heal | `playwright-test-healer` | §4 |
| Git / PR / CI | (orchestrator) | [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md) |

## Critical rule — existing agents are preserved

The three agent definitions in `.claude/agents/` (`playwright-test-planner.md`,
`playwright-test-generator.md`, `playwright-test-healer.md`) are the configured agents.

**Never delete, recreate, rename, replace, or rewrite them. Never modify their prompts,
tools, responsibilities, or configuration unless the human explicitly asks.**

This workflow, the domain profiles, and the skills are an **orchestration layer
only** — they govern how the existing agents are invoked and coordinated; they do
not replace or amend the agents themselves.

Model preferences (§6) are applied only through the Agent tool's per-invocation
`model` parameter. Do not edit agent frontmatter to force a model. Before any
configuration change, inspect the existing agent configuration and confirm the
change is orchestration-only.

## 1. Main Claude = Orchestrator

The main Claude session is the **orchestrator**. It routes the task (§3),
coordinates the agents, and must not perform the Planner, Generator, or Healer's
responsibilities itself when the route calls for an agent.

The standard agent flow is:

```text
User → Orchestrator (routing, §3)
     → Planner → Generator → execution + validation
         FAIL → Healer → re-run
                  └─ unresolved → escalate to Opus / Fable 5
         PASS → final validation
     → GitHub (GITHUB_WORKFLOW.md): commit → push → PR → CI
         RED → Healer → fix → push → CI again
         GREEN → human review → human merges
```

Progress should clearly identify the active stage:
`[Planner - Fable 5]` `[Generator - Sonnet]` `[Playwright validation]`
`[Healer - Sonnet]` `[Escalation - Opus/Fable 5]` `[GitHub]` `[PR created]`
`[CI validation]`

If a required agent is unavailable, report that condition — never silently
replace it.

## 2. Domain profiles

All repo-specific knowledge lives in two profiles, loaded per task — never both
by default, never in non-Playwright sessions:

| Task touches | Profile |
|---|---|
| `tests/webpet/`, `src/pages/webpet/`, `src/components/webpet/`, `src/data/webpet/` | [profiles/WEBPET.md](profiles/WEBPET.md) |
| `tests/web/`, `src/data/runner/`, `src/data/catalog/`, `test-plans/` | [profiles/JOURNEY.md](profiles/JOURNEY.md) |
| Shared core (`src/fixtures/`, `src/config/`, `src/utils/`, `src/components/` root, `src/data/readers/`) | profile per affected suite; **both** suites' validation gates |

An agent invocation prompt names exactly: its stage contract (§4, summarized
inline — it is short), the one domain profile to Read, and the handoff (a file
path or a ≤30-line block). An agent Reads at most two files up front — the
profile and the handoff — plus only the source files those name.

## 3. Routing — skill vs agents

Skills encode conventions and handle small single-session work; agents handle
multi-step work that needs live-browser exploration or an unknown root cause.
Do not describe what an agent would do and then do it inline — when the route
says agent, invoke the agent.

| Task shape | Route |
|---|---|
| Automate a catalog workflow ("automate B3") | `journey-from-catalog` skill → Planner → Generator (→ Healer), JOURNEY profile |
| Automate a Jira story | `jira-to-script` skill (agent-orchestrated) |
| Automate from a screen recording | `annotate-video` → `annotations-to-script` skills → Planner → Generator (→ Healer), JOURNEY profile |
| New webpet spec / extend coverage | Planner → Generator (→ Healer), WEBPET profile |
| Failure, cause unknown | main session: `pw-failure-triage` Step 1 (gate-skip?) → if real, Healer with classification + artifact paths |
| Failure, cause known, single file | main session + `pw-locator-hardening` / `pw-spec-author` — no agents |
| New page object only | `pw-page-object` skill, main session |
| Runner CSV / tags / annotation edits | `data-driven-testing` / `pw-spec-author`, main session |
| Small spec from a scenario pasted in chat | `ui-` / `api-` / `workflow-script-generator` skill, main session |
| Shared-core change (fixtures/gate/utils/config) | Planner (Fable 5) → Generator; both suites' validation |
| CI red | [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md) loop → Healer |

When in doubt (cross-file work, unclear cause, live app exploration needed),
route to the agents.

## 4. Stage contracts

Generic contracts. Domain knowledge comes from the profile named in the
invocation, never from this document. Shared constraint for every stage:
setup/cleanup goes through the app's API — there is no DB access from tests.

### Planner — analysis and planning, never implementation

* Understand the requirement or failure; inspect only what the task needs —
  the orchestrator hands over the specific files and context.
* Identify root cause, expected behavior, existing patterns to reuse (per the
  profile), the minimum files to change, and the required validation.
* Handoff for fix/maintenance tasks (≤30 lines):

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

* For journey-creation tasks the handoff is the **test-plan file** itself —
  see [profiles/JOURNEY.md](profiles/JOURNEY.md).

### Generator — implementation from the handoff

* Follow the Planner's handoff; inspect only the files it names.
* Reuse existing building blocks (per the profile) before writing new ones.
* Smallest appropriate change; no unrelated refactoring; preserve existing
  coverage unless the requirement changes it.
* Sparse comments: only non-obvious "why", no JSDoc boilerplate.
* Does not re-plan unless the plan is demonstrably incorrect — then report back
  to the orchestrator before making broad changes.

### Healer — invoked only on a validation or execution failure

* Diagnose before changing anything. Classify per the canonical taxonomy in
  `.claude/skills/pw-failure-triage/SKILL.md` — gate-skip check first, then
  environment/auth → selector drift → timing → missing registration → real bug —
  and apply the profile's domain triage order.
* Then: inspect evidence (error, trace, artifacts) → root cause → relevant
  diff/source → smallest fix → re-run the affected test → re-validate.
* Never blindly modify assertions, locators, waits, or timeouts just to go
  green. Escalate to Opus or Fable 5 when the cause cannot be confidently
  determined or the problem is architectural.

**Tool gaps:** the agents' browser/test-run tools come from the `playwright-test`
MCP server. The Generator has no Write/Edit of its own — it emits specs via
`generator_write_test`. When the MCP server is disconnected, agents keep their
file tools (Glob, Grep, Read; the Healer also Edit/Write) but lose browser and
`test_run` tools: the orchestrator materializes the Generator's output to disk,
runs tests between stages, and says so explicitly in its report.

## 5. Execution + validation

After implementation, run the affected Playwright tests plus:

* shared gate: `npm run typecheck`, `npm run lint`
* domain gate: the profile's §Validation
  (`webpet:runner:sync`/`webpet:runner:check` vs `runner:sync`/`runner:check`)
* a shared-core change runs **both** domain gates

Do not assume successful code generation means the task is complete. Prefer lean
verification: run the affected spec files, not the full suite, unless the change
is suite-wide.

## 6. Model Selection

Agent definitions default to `model: sonnet`; the orchestrator overrides per
invocation via the Agent tool's `model` parameter.

* **Opus** — first escalation from Sonnet: complex planning, complex
  implementation/review, difficult debugging.
* **Fable 5** — reserved for two cases only: root-cause analysis Opus could
  not resolve, and framework/architecture decisions (shared-core changes).
  Never the first escalation.
* **Sonnet (default)** — Generator and Healer, normal coding, locator/fixture
  work, routine review.
* **Haiku** — lightweight searches, file discovery, extracting small facts.

Escalation order is always Sonnet → Opus → Fable 5.
Do not use Fable 5 or Opus for tasks Sonnet or Haiku can handle.

## 7. Context and Token Efficiency

Minimize duplicated context across agents. Do not make every agent independently
read the repository. Targeted handoffs:

```text
Planner   → requirement + relevant repository context   → concise plan
Generator → Planner handoff + implementation files       → diff
Healer    → failure output + relevant diff + source      → smallest fix
```

Binding rules:

1. **Route small work to skills** (§3). A one-line or purely mechanical fix never
   spawns an agent pipeline.
2. **Handoffs are pointers, not payloads.** Pass file *paths* and the §4 handoff
   block; never paste whole files or full run logs between agents. Each agent
   Reads only the files named in its handoff.
3. **Healer input is minimal.** The failing test's error message, trace path, and
   the relevant diff — never the full-suite output.
4. **No browser exploration unless the task needs it.** Page snapshots are
   token-heavy; code-level failures are diagnosed from source; a screen that
   already has a page object is read, not re-explored.
5. **Model tiering** (§6): Haiku finds, Sonnet builds and heals, Fable 5 only for
   genuinely hard planning or escalation.
6. **Batch per task, not per failure.** One Planner call per task; one Generator
   call per plan; related runner-CSV edits go into one sync — never one pipeline
   per failing test.
7. **Extract, don't load.** Pull single workflow nodes from
   `workflow-catalog.json`; report validation failures only, never full logs.

Rules 2, 3, and 6 are the big savers: they keep the three-agent pipeline near
single-session cost instead of multiplying it.

## 8. Git, GitHub, CI, Human Approval

See [GITHUB_WORKFLOW.md](GITHUB_WORKFLOW.md): dedicated branch → reviewed diff →
commit → push → PR → CI loop → **human reviews and merges**. Merge, force-push,
branch deletion, and settings/secrets changes are human-only.

## 9. Final Completion Criteria

A Playwright task is complete only when: the implementation is complete;
relevant tests pass; shared + domain validation gates pass; the final diff has
been reviewed and contains no unrelated changes; the PR is created/updated;
GitHub CI is green or any remaining CI issue is explicitly reported; and the PR
is ready for human review.

The final response should briefly state:

```text
Planner result · Generator changes · Healer activity (if any)
Tests executed · Validation results
Git branch · Commit · Pull Request · CI status · Remaining issues
```

## Core principle

```text
Fable 5 → Think / Plan / Deep reasoning
Sonnet  → Build / Debug / Heal
Haiku   → Find / Inspect / Lightweight tasks
Opus    → Complex escalation / deep implementation
```

The main Claude session routes and coordinates; domain knowledge lives in the
profiles; conventions live in the skills; the agents do the staged work.
