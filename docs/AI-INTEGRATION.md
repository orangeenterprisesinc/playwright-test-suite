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
| **`annotate-video`** | You have a screen recording of a manual journey | Stage 1 of the video pipeline: runs the UI detector over the recording and writes timestamped annotations plus rendered keyframes to `.video-annotations/<slug>/`. Stops there. See §4. |
| **`annotations-to-script`** | You have annotator output and want a spec | Stage 2: reads the annotations *and* keyframes, drafts a plan under `specs/`, pauses for confirmation, then generates → runs → heals via the agents below. |

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

## 4. Video annotator (`tools/video-annotator/`)

A recorded manual journey is the other common starting point besides a ticket.
`tools/video-annotator/annotate_video.py` turns a screen recording into
timestamped, structured UI annotations that `/annotations-to-script` reads.

The pipeline is split into two skills on purpose — annotation is a slow CPU job
over a file, generation is an interactive job against a live app, and the two
are usually run at different times:

```
/annotate-video "Testing video/"
      ▼
.video-annotations/<slug>/{annotations.json, frames/}
      ▼
/annotations-to-script ".video-annotations/<slug>/"
      ▼
specs/<slug>.md  →  (you confirm)  →  generator → run → healer
      ▼
tests/ui/<module>.spec.ts
```

| Stage | What it does |
|-------|--------------|
| **Frame-diff** | Finds the frames where the screen actually changed. A 3-minute 30fps clip has ~5,400 frames but only ~40–120 moments where anything happened. |
| **Forced sampling** | Typing moves a few dozen pixels — below any threshold that is not pure noise. `--max-gap-ms` samples on a timer through quiet stretches, so a form-filling step cannot silently vanish. On the reference recording this recovered a 20-second hole that earlier settings missed entirely. |
| **Targeting** | Each keyframe records `change_region`, the bounding box of the pixels that moved. That says *where on the frame* to look; the rendered image says what is there. |

Invoke it with `npm run video:annotate -- --input "<video>"`; output goes to
`.video-annotations/<slug>/`. A typed programmatic API lives in `src/video/`
for use from fixtures or specs. Local use needs a one-time ~170 MB Python
bootstrap; CI uses the container instead. `tools/video-annotator/README.md`
covers setup, tuning and Docker.

> **There is no object detector.** Earlier versions ran a YOLOv8 UI-element
> model and emitted bounding boxes. It was removed after measurement: every fact
> in the resulting plans came from reading the frame image or from
> `change_region`, never from a box. It was also 90% of the install (1,727 MB →
> 171 MB), drew ~110 boxes per frame over the on-screen text a reader needs, and
> carried an AGPL-3.0 obligation via `ultralytics`. Removing it left keyframe
> selection byte-identical on the reference recording and halved the runtime.

**The two stages have opposite automation properties**, which is why they are
separate skills rather than one:

| | Stage 1 — `/annotate-video` | Stage 2 — `/annotations-to-script` |
|---|---|---|
| Needs Claude | no | **yes** — reads the frames |
| Needs the live app | no | **yes** — locators come from the real DOM |
| Deterministic | yes | no |
| Human gate | none | **yes, by design** |
| **Runs in CI** | **yes** | **no** |

Stage 1 runs unattended via `.github/workflows/annotate-video.yml` on a stock
`ubuntu-latest` runner, publishing the annotations as an artifact. It is pure
Python + OpenCV with no Windows dependency, so there is nothing to provision and
no contention with the e2e workflow over this machine's ports and database. Stage 2
stays local: automating it would mean removing the confirmation gate that exists
to catch a misread frame before it becomes a wrong assertion.

So the operating model is **upload → CI annotates → engineer runs stage 2 with
review**. The only requirement on whoever records the journey is that the file be
**MP4 (H.264)**.

**Where the boundary sits:** the annotator reports *when* the screen changed and
*where on the frame*, never what a control is called or that it was clicked. A
coordinate carries no label. The reading happens in the skill, from the rendered
keyframes; the real locator comes from the generator agent driving the live DOM.
No pixel coordinate ever reaches a spec file.

**The Playwright agents never read `annotations.json` or the frames.** They have
no vision and do not parse detector output — their input is the markdown plan
in `specs/`. Claude consumes the annotator output, and needs *both* parts of it:
the JSON carries timing and change regions, the PNG carries the labels. This is
why `/annotations-to-script` takes a directory, not a file.

Two findings from the first real run are worth knowing, since both are now
baked into the defaults. **Cursor matching is off** — synthetic templates
false-positived on 100% of frames, always snapping to the same three coordinates
while the real pointer was elsewhere, and a wrong cursor position points at the
wrong control; targeting uses `change_region` instead. And **typing is invisible
to frame-diff**, so quiet stretches are force-sampled on a timer
(`--max-gap-ms`); without that, a 20-second form-filling step produced no
keyframe at all.

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
    ├── jira-to-script/SKILL.md            # ticket → plan → generate → run → heal
    ├── annotate-video/SKILL.md            # stage 1: recording → annotations
    └── annotations-to-script/SKILL.md     # stage 2: annotations → plan → spec

tools/video-annotator/
├── annotate_video.py                      # frame-diff → keyframes + change regions
├── make_cursors.py                        # cursor match templates (opt-in)
├── requirements.txt                       # opencv + numpy only
├── Dockerfile                             # ~330 MB image used by CI
└── README.md                              # bootstrap, tuning, Docker

.github/workflows/
├── annotator-image.yml                    # build + push the image to GHCR
└── annotate-video.yml                     # stage 1 in CI (ubuntu-latest)

src/video/                                 # typed bridge to the annotator
├── types.ts
├── videoProcessor.ts
└── index.ts
scripts/annotate-video.js                  # npm run video:annotate
```
