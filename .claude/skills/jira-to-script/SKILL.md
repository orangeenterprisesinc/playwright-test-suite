---
name: jira-to-script
description: Use when the user asks to generate a Playwright test from a Jira ticket/story (e.g. "automate PROJ-123") — fetches the story via the Jira MCP, plans against the live app with the Playwright planner agent, generates the spec, runs it, and heals failures.
---

## Jira story → Playwright script pipeline

Turns a Jira ticket into a reviewed, passing spec using the Jira MCP and
the Playwright test agents (planner / generator / healer).

### Prerequisites

- Jira MCP connected (`.mcp.json` server `jira`): requires `JIRA_URL`,
  `JIRA_USERNAME`, `JIRA_API_TOKEN` in the engineer's environment, plus
  `uv`/`uvx` installed. If unavailable, ask the user to paste the story
  text instead and continue from step 2.
- The app under test reachable at `BASE_URL` (local stack running for
  `env.local`). The planner/generator drive a real browser — without the
  app, stop after the plan draft and say so.

### Pipeline

1. **Fetch the story** — get the Jira issue (summary, description,
   acceptance criteria, linked designs). Quote the ACs back; if they are
   ambiguous or missing, ask focused questions before automating.

2. **Plan** — invoke the `playwright-test-planner` agent with the story's
   ACs and relevant app area. It explores the live app (via the
   playwright-test MCP + `tests/seed.spec.ts`) and produces a test plan.
   Save the plan under `specs/<ISSUE-KEY>-<slug>.md` with a link back to
   the Jira key.

3. **Generate** — invoke the `playwright-test-generator` agent per planned
   scenario. Generated code MUST follow the repo conventions in
   `/ui-script-generator` (standard test structure, page-object fixtures,
   no annotations, data files instead of hardcoded values). Rework agent
   output that violates them before accepting it.

4. **Run** — `npx playwright test tests/<module> --project=chromium`.

5. **Heal** — on failures, invoke the `playwright-test-healer` agent.
   Healing may fix locators/waits, but must NOT weaken assertions or
   change the intent of an acceptance criterion — if the app genuinely
   contradicts an AC, report it as a potential product bug instead of
   healing around it.

6. **Review gate** — before finishing: `npm run typecheck` clean, specs
   read as business scenarios, tags applied, selectors live in page
   objects, and the test title references the Jira key or scenario name.
   Summarize coverage (which ACs are automated, which are not and why).

### Traceability

- Test titles follow `[<Module>] Verify …`; mention the Jira key in the
  spec's describe title or a comment at the top of the file.
- One spec file per story/module; extend the existing module spec when
  the story adds scenarios to an existing area.
