# AI Integration — Claude Code Skills & Playwright Agents

This framework is **AI-augmented**: Playwright specs are planned, authored, and
repaired with Claude Code rather than written entirely by hand. The AI layer is
not a bolt-on — it is configured *inside the repo* so that everything it produces
follows this framework's own conventions (Page Object Model, fixtures,
data-driven rules, locator standards) and runs without manual correction.

It has three parts:

1. **Claude Skills** (`.claude/skills/`) — repo-scoped instruction packs that
   encode *how we write tests here*.
2. **Playwright Agents** (`.claude/agents/`) — specialised subagents that drive a
   real browser to plan, generate, and heal tests.
3. **MCP servers** (`.mcp.json`) — the tools those agents and skills call:
   `playwright-test` (browser automation) and `jira` (story retrieval).

---

## 1. Claude Skills (`.claude/skills/`)

Skills are invoked with `/<skill-name>` (or automatically when the task
matches). Each carries the repo's standards so the generated code matches the
existing suite on the first pass.

| Skill | Use it when… | What it does |
|-------|--------------|--------------|
| **`ui-script-generator`** | You describe a UI scenario in chat | Generates/updates a Playwright + TS spec that matches repo conventions — POM usage, fixtures, data-driven rules, locator priority — so it runs without rework. |
| **`data-driven-testing`** | Adding/editing data-driven tests | Manages `runnerManager.json` / `runnerManager.csv` rows and the `testCaseId` / `testCaseName` fixtures. Enforces the **read-directly rule**: JSON runs from JSON, CSV from CSV — *no conversion step*. |
| **`tdd`** | Building a new module test-first | Drives a red → green cycle: write the failing spec from acceptance criteria first, then build the page objects/fixtures to make it pass. |
| **`jira-to-script`** | "Automate PROJ-123" | End-to-end pipeline: fetch the story via the Jira MCP → plan against the live app → generate the spec → run it → heal any failures. Chains the three agents below. |

**Why skills matter:** without them, a general LLM would invent its own
structure. With them, the AI writes tests the way *this* repo already does —
standard Playwright `test()`/`test.describe()` with tags, page objects extending
`BasePage`, components off `BaseComponent`, data via `DataProvider`, and the repo's
locator priority (CSS id → `getByRole` → `data-testid` → `getByText`).

---

## 2. Playwright Agents (`.claude/agents/`)

Agents are **subagents** — each runs in isolation with only the Playwright MCP
tools it needs. They operate a real Chromium instance through the
`playwright-test` MCP server.

| Agent | Model | Role |
|-------|-------|------|
| **`playwright-test-planner`** | sonnet | Navigates and explores the live app in a real browser, identifies interactive elements/flows/edge cases, and saves a comprehensive **test plan**. |
| **`playwright-test-generator`** | sonnet | Takes a plan item, **executes each step live** via Playwright MCP tools (using the step text as intent), reads the generator log, and writes the spec file. |
| **`playwright-test-healer`** | sonnet | Runs the suite, debugs failing tests (`test_debug`), inspects snapshot/console/network, performs root-cause analysis, and fixes selectors, timing, or assertions. |

**Division of labour:** planner and generator *author*; healer *repairs*. Because
the generator drives the browser for real before emitting code, the resulting
locators and waits reflect the actual DOM rather than guesses.

---

## 3. MCP servers (`.mcp.json`)

| Server | Command | Provides |
|--------|---------|----------|
| **`playwright-test`** | `node node_modules/@playwright/test/cli.js run-test-mcp-server` | Real-browser tools the agents call: `browser_snapshot`, `browser_click`, `browser_type`, `browser_generate_locator`, `test_run`, `test_debug`, `generator_write_test`, and more. |
| **`jira`** | `uvx mcp-atlassian` | Reads Jira stories for `jira-to-script`. Needs `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN` (prompted as MCP inputs). |

---

## End-to-end example — Jira ticket → passing spec

The `jira-to-script` skill ties everything together:

```
/jira-to-script PROJ-123
     │
     ▼  Jira MCP        → fetch story PROJ-123 (acceptance criteria)
     ▼  planner agent   → explore the live app, save a test plan
     ▼  generator agent → execute each step in a real browser, write the spec
     ▼  test_run (MCP)  → run the new spec
     ▼  healer agent    → if it fails, debug + fix, re-run until green
     ▼
   Reviewed, passing tests/<module>/<name>.spec.ts
```

The output lands in `tests/`, uses the framework's fixtures and page objects,
and is picked up by the same reporting (Allure / Email / Slack) and CI/CD
pipeline as any hand-written spec.

---

## How it fits the framework

- **Conventions in, conventions out** — skills embed the repo's POM, fixture,
  data-driven, and locator rules, so AI output is consistent with existing specs.
- **Grounded, not guessed** — agents drive a real browser via MCP, so selectors
  and waits match the live DOM.
- **Same downstream path** — generated specs run under the same
  `playwright.config.ts`, fixtures, reporting, and GitHub Actions pipeline as
  everything else; there is no separate "AI test" track.
- **Human-in-the-loop** — everything is reviewed before merge; the AI accelerates
  authoring and repair, it does not bypass review.

---

## Files

```
.mcp.json                                  # playwright-test + jira MCP servers
.claude/
├── agents/
│   ├── playwright-test-planner.md         # explore app → test plan
│   ├── playwright-test-generator.md       # plan → live execution → spec
│   └── playwright-test-healer.md          # run → debug → fix failing tests
└── skills/
    ├── ui-script-generator/SKILL.md       # chat scenario → conforming spec
    ├── data-driven-testing/SKILL.md       # runnerManager rows + fixtures
    ├── tdd/SKILL.md                       # red → green module build
    └── jira-to-script/SKILL.md            # ticket → plan → generate → run → heal
```
