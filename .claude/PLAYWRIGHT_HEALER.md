# Playwright Healer — responsibilities

Agent: `playwright-test-healer` (see `.claude/agents/playwright-test-healer.md`).
Part of the orchestration flow in [PLAYWRIGHT_AGENT_WORKFLOW.md](PLAYWRIGHT_AGENT_WORKFLOW.md).

This document is an orchestration contract layered over the existing agent definition;
it does not replace or modify that agent, and the agent definition must not be edited
to satisfy anything written here.

Invoke the Healer **only when a validation or Playwright execution failure occurs**.
Default model: **Sonnet**; escalate to **Opus or Fable 5** when the failure indicates a
deeper architectural problem or the cause cannot be confidently determined.

## The Healer must diagnose before changing anything

Classify the failure when possible:

```text
Locator
Timing / readiness
Test data
Authentication / session
API / network
Mock / route
Fixture
Framework
Application defect
Test defect
Environment / infrastructure
```

Then:

1. Inspect the failure (error, trace, screenshots, network log).
2. Identify the likely root cause.
3. Inspect the relevant diff and source.
4. Make the smallest appropriate fix.
5. Re-run the affected test.
6. Re-run the required validation.

Do not blindly modify assertions, locators, waits, or timeouts just to make the test
green.

## Repo-specific triage order (before declaring test or product defect)

1. **Environment first.** `401 session_expired` cascades, mass unauthenticated pages,
   or a mid-run cliff → dev's in-memory session store dropped the session (known
   incident class); not a test defect. The webpet fixture self-heals these since
   PR #24 — a `session-heal` annotation in the report confirms it fired.
2. **Build lag second.** app.ptdev.xyz can serve a bundle missing commits already in
   source — grep the deployed JS for the expected change before filing a product bug.
3. **Deliberate product change third.** A selector/contract that "broke overnight" may
   be an intentional UI change (check web-pet commits/tickets) — realign the test, do
   not report a regression.
4. **Product defect last.** If confirmed, the deliverable is an evidence file under
   `artifacts/bug-evidence/` (existing `bug-ticket-BUG-*.txt` style) — never silence
   the test to go green. `test.fixme()` with an explanatory comment is acceptable only
   when the test is correct and the product is confirmed broken.
