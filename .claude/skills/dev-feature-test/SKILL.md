---
name: dev-feature-test
description: Use when a web-pet developer (or QA on their behalf) wants to contribute the Playwright spec for a new feature — e.g. "/dev-feature-test WEBPET-123" or a pasted feature description. Runs the contributor workflow from docs/DEV-E2E-CONTRIBUTION.md end to end - preflight, branch, spec generation via the existing planner/generator pipeline, validation gates against dev staging, and a PR to main for QA review. Never merges, never touches framework files.
---

## Developer feature-test contribution

Wraps the existing generation pipeline in the contributor workflow defined in
`docs/DEV-E2E-CONTRIBUTION.md`. This skill is **orchestration only**: it routes
to the existing skills and agents and adds the guardrails a dev contribution
needs. It never modifies the agents in `.claude/agents/` or any framework file.

The invoker is typically a web-pet developer, not the framework owner — prefer
pointing at the onboarding doc over improvising fixes when their setup is
broken.

### 1. Preflight (fail fast, name the missing step)

Check in order; on failure, cite the matching section of
`docs/DEV-E2E-CONTRIBUTION.md` §2 and stop:

1. `node_modules/` present (`npm ci` done) and Node ≥ 20.
2. `.env` exists at the repo root; `SECRET_KEY` set if any value is `ENC(...)`.
3. Jira MCP reachable if the input is a ticket id. If not, ask the developer
   to paste the ticket's summary + acceptance criteria and continue.
4. Working tree clean and on an up-to-date `main` (fetch first). Never start
   from a dirty tree — ask the developer to stash or commit elsewhere.

### 2. Branch

Create `test/<TICKET-ID>-<slug>` off `origin/main` (slug from the ticket
summary, kebab-case, ≤5 words). All work happens on this branch. Never commit
to `main`.

### 3. Generate the spec

Route by input, per the orchestration workflow (§3 of
`.claude/PLAYWRIGHT_AGENT_WORKFLOW.md`):

- **Jira ticket id** → follow `/jira-to-script` (fetch story → planner agent →
  generator agent), with one deviation: all runs use `npm run test:dev`
  (dev staging), never the local target.
- **Pasted scenario** → `/ui-script-generator`, `/api-script-generator`, or
  `/workflow-script-generator` by scenario shape.
- WEBPET-area features load `.claude/profiles/WEBPET.md`; PET-Tiger journey
  features load `.claude/profiles/JOURNEY.md`. Never both.

Conventions are enforced by the existing skills — `pw-spec-author` (fixture
module, tags, testCaseId/requirement annotations), `pw-page-object` (new
screens + registry), `data-driven-testing` (runner rows via the CSV only).

### 4. Contribution boundary (hard rule)

The diff may contain only: spec files, new page objects + their registry
registration, and runner data CSV rows (plus the synced JSON mirror). If the
task seems to require touching fixtures, config, utils, scripts, CI, or
anything under `.claude/` — stop and tell the developer to raise it with QA.
Do not work around the boundary.

### 5. Validate

Run, in order, and show the developer the results:

1. `npm run test:dev -- <spec-path>` (add `--project=webpet` for webpet specs)
2. `npm run typecheck`
3. `npm run lint`
4. `npm run runner:check` or `npm run webpet:runner:check` (match the domain)

On test failure, follow `/pw-failure-triage` first; heal via the healer agent
only for cause-known selector/timing issues **within the contribution
boundary**. Never weaken an assertion to go green — if the app contradicts the
ticket's expected behavior, report it as a potential product bug and stop
before the PR.

### 6. Developer review gate

Before any push, show the developer the full spec diff and the green run
summary and get an explicit confirmation that the assertions test the
ticket's real expected behavior. This confirmation is the developer's actual
contribution — do not skip it.

### 7. PR

1. Commit as `test(<domain>): <TICKET-ID> <short summary>`.
2. Push the branch; open a PR to `main` with the repository PR template
   checklist filled in (paste the real `test:dev` summary line).
3. Request review from QA (Gukan). **Never merge, never enable auto-merge.**

### 8. Report

End with: branch, spec path(s), test/gate results, PR URL, and anything QA
must know (serial-only flag, suspected product bug, skipped ACs and why).
