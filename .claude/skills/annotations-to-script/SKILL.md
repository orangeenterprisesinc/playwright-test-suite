---
name: annotations-to-script
description: Use when the user points at annotator output (a .video-annotations directory) and asks to generate a Playwright test from it — reads the annotations and keyframes, drafts a test plan under test-plans/ from _template.md, pauses for confirmation, then hands off to the Planner → Generator → Healer agents per the orchestration workflow. Stage 2 of two; stage 1 is /annotate-video.
---

## Annotations → Playwright script

Stage 2 of the video pipeline. Input is a directory produced by
`/annotate-video`. The annotations supply **what happened and when**; the live
app supplies **how to address it**. Load `.claude/profiles/JOURNEY.md` for the
repo conventions — this skill adds only the recording-specific steps.

### 1. Resolve the run

The argument may be a specific run directory or the `.video-annotations/` root.

- Root → list subdirectories. One → use it. Several → list them with keyframe
  counts and dates, and ask. None → say the annotator has not been run and
  point at `/annotate-video`.
- Verify **both** `annotations.json` and `frames/` are present.
- If you find `frames.tar.gz.gpg` instead of `frames/`, the run came from CI,
  where keyframes are published encrypted because artifacts on this public repo
  are downloadable by anyone. Tell the user to decrypt it in place and stop:
  `gpg -d frames.tar.gz.gpg | tar xz`. Do not attempt the plan without the frames.

If only `annotations.json` was supplied, **stop and explain**: the JSON holds
coordinates and timings with no labels. A box at `[672, 264, 1073, 300]` is
meaningless without the rendered frame showing it is the Name field.

### 2. Interpret

Read `annotations.json`, then Read the annotated PNGs. Batch ~20 per pass on a
long journey and summarise as you go.

**How to read a keyframe:**

- **`phase` pairs.** Every moment is captured twice — `action` (pixels moving)
  then `settled` (just after). The action frame shows what was touched; the
  settled frame shows the result. The result is usually the assertion.
- **`change_region`** is `[x1, y1, x2, y2]` bounding the pixels that moved — the
  only targeting signal. It says *where on the frame* to look; the image says
  what is there.
- **`forced: true`** means nothing crossed the threshold and the frame was
  sampled to cover a quiet stretch. In practice this is almost always
  **typing** — these frames carry the field values. Do not skip them. A forced
  frame often has a whole-frame `change_region`; read the image rather than
  trusting the box.
- **`cursor` is normally `null`.** Cursor matching is off by default because the
  synthetic templates false-positive on every frame. Ignore it.
- **The PNG is where meaning lives.** One rectangle marks the change region and
  nothing else is drawn over the UI, so on-screen text is legible.

**Check coverage before trusting the run.** `max_action_gap_ms` must not exceed
`settings.max_gap_ms`. If it does, a step of the journey went unsampled — say
so rather than inventing the missing step.

**Collapse** consecutive keyframes describing one logical action — filling a
field is often several keyframes and one `fill` step.

**Say what you could not establish.** Text scrolled off-screen, masked
passwords, values in frames you did not open. Mark inferences as inferences —
an unverified detail silently promoted to fact becomes a wrong assertion.

### 3. Write the plan

Plans live at `test-plans/journey-<x>/<wf>-<slug>.md`, copied from
`test-plans/_template.md`; `test-plans/README.md` is the format reference and
`test-plans/journey-a/a01-user-setup.md` the worked example. Read all three.

- **Identify the catalog workflow first.** The slug usually names it
  (`a01-user-setup` → `A1`); if not, ask the user. Extract only that node from
  `src/data/catalog/workflow-catalog.json` (`node -e`, not a full Read) to fill
  the *Catalog entry* and *Catalog steps* sections.
- Fill "What the recording shows" per catalog step from the keyframes, with the
  keyframe indexes you drew it from (`kf 12–15`), so a reviewer can check.
- Requirements go in the *Acceptance criteria (EARS)* table as `<WF>-R<n>`.
  Every row states **what happens** and **what the system does about it** —
  *"Initials and Email filled"* states neither and cannot be tested. Context
  lines are notes, not numbered rows.
- **Negative coverage is the part that gets skipped.** Aim for 4–5 failure /
  edge rows, each naming the wrong input and the observed response.
- **Never write an outcome the recording did not show.** A recording shows one
  path. Anything not demonstrated goes in a **Not established** table with a
  note on why it matters — the Planner agent discovers it live in step 5.
- Add a `Source:` line naming the video and the `.video-annotations/<slug>/` dir.
- **Never overwrite an existing plan.** If `test-plans/journey-<x>/<wf>-<slug>.md`
  exists, write `<wf>-<slug>.annotator.md` alongside and show the diff.

### 4. Stop and confirm

Show the user the step list and **wait**. Vision inference over a recording is
fallible, and a wrong step here becomes a wrong assertion three stages later.
This is the cheapest place in the pipeline to catch a mistake.

### 5. Hand off to the agents

From here the standard flow in `.claude/PLAYWRIGHT_AGENT_WORKFLOW.md` applies —
the main session orchestrates, it does not implement:

1. **Planner** (`playwright-test-planner`): handoff = the plan file path +
   JOURNEY profile. It resolves every *Not established* row against the live
   app and appends the answers as new `<WF>-R<n>` rows. Do not skip to a test
   for something the plan lists as unknown.
2. **Runner rows** in `src/data/runner/journey-<x>.csv` (one per test case,
   `enabled=0`), then `npm run runner:sync`.
3. **Generator** (`playwright-test-generator`): one test per requirement, the
   requirement id in the `testCaseId` annotation or a comment. Spec path
   `tests/web/journey-<x>-<area>/<wf>-<slug>.spec.ts` for every surface —
   device specs live there too, with API + UI verification in one test (see
   `b01-crew-time-in.spec.ts`). Locators come from the live accessibility tree the
   generator reads — never from pixel coordinates.
4. **Run**: `npm run test:dev -- tests/web/<dir>/<wf>-<slug>.spec.ts`.
5. **Healer** (`playwright-test-healer`) on failure. It may fix locators and
   waits but must **not** weaken assertions or drop a step the recording clearly
   showed. If the app contradicts the recording, report it — the recording may
   be stale, or it may be a product bug.
6. Flip rows to `status=automated`, `enabled=1`, re-sync.

### 6. Review gate

`npm run typecheck`, `npm run lint`, `npm run runner:check` clean. Plus:

- Every `<WF>-R<n>` maps to exactly one test and no test lacks one.
- Every numbered row states both an action and an expected result.
- ≥4 negative/edge cases, each naming what the system does about the wrong input.
- Every *Not established* row is resolved into a requirement or still listed
  as open — never silently dropped.

Report the real outcome — if tests still fail after healing, say so with output.

### Guardrails

- **No pixel coordinates in specs.** No `page.mouse.click(x, y)`. Coordinates
  are evidence for you, not output. If you cannot name a control, say so and
  let the Generator find it live.
- **No invented assertions.** Flag the gap instead.
- **Reuse page objects** under `src/pages/` — add methods, don't build a
  parallel object. Check the profile's building-blocks list first.
- **Do not re-implement login.** Browser projects load storage state from
  `auth-setup`, so a journey starts logged in even if the recording shows the
  login screen. Trim those steps unless the journey is *about* logging in.
- **Cleanup goes through the app's API.** There is no DB access from tests.
  Entities with uniqueness rules (e.g. user initials, 3 chars) need run-unique
  values and an API delete in `afterEach`; flag it if the plan lacks them.
- **Do not overwrite hand-written plans or specs.** Generate alongside and diff.
