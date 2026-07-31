---
name: annotations-to-script
description: Use when the user points at annotator output (a .video-annotations directory) and asks to generate a Playwright test from it — reads the annotations and keyframes, drafts a test plan under specs/, then generates, runs and heals the spec against the live app using the Playwright agents. Stage 2 of two; stage 1 is /annotate-video.
---

## Annotations → Playwright script

Stage 2 of the video pipeline. Input is a directory produced by
`/annotate-video`. The annotations supply **what happened and when**; the live
app supplies **how to address it**.

### 1. Resolve the run

The argument may be a specific run directory or the `.video-annotations/` root.

- Root → list subdirectories. One → use it. Several → list them with keyframe
  counts and dates, and ask. None → say the annotator has not been run and
  point at `/annotate-video`.
- Verify **both** `annotations.json` and `frames/` are present.
- If you find `frames.tar.gz.gpg` instead of `frames/`, the run came from CI, where
  keyframes are published encrypted because artifacts on this public repo are
  downloadable by anyone. Tell the user to decrypt it in place and stop:
  `gpg -d frames.tar.gz.gpg | tar xz`. Do not attempt the plan without the frames.

If only `annotations.json` was supplied, **stop and explain**: the JSON holds
coordinates and timings with no labels. A box at `[672, 264, 1073, 300]` is
meaningless without the rendered frame showing it is the Name field. Both are
required.

### 2. Interpret

Read `annotations.json`, then Read the annotated PNGs. Batch ~20 per pass on a
long journey and summarise as you go.

**How to read a keyframe:**

- **`phase` pairs.** Every moment is captured twice — `action` (pixels moving)
  then `settled` (just after). The action frame shows what was touched; the
  settled frame shows the result. The result is usually the assertion.
- **`change_region`** is `[x1, y1, x2, y2]` bounding the pixels that actually
  moved — the only targeting signal, and always present. It says *where on the
  frame* to look; the image says what is there.
- **`forced: true`** means nothing crossed the threshold and the frame was
  sampled purely to cover a quiet stretch. In practice this is almost always
  **typing** — these frames carry the field values, and they are exactly the
  steps that would otherwise be invisible. Do not skip them. A forced frame
  often has a whole-frame `change_region`, because there was nothing to
  localise; read the image rather than trusting the box.
- **`cursor` is normally `null`.** Cursor matching is off by default because
  the synthetic templates false-positive on 100% of frames. Ignore it unless a
  run explicitly used `--cursor` with real crops.
- **The PNG is where meaning lives.** Read it for every step you intend to
  write. There are no element boxes — one rectangle marks the change region and
  nothing else is drawn over the UI, so on-screen text is legible.

**There is no object detector.** Earlier versions emitted `elements[]` with YOLO
bounding boxes; that was removed after measurement showed the boxes contributed
nothing and their overlay obscured the text. If you are looking at output that
still has an `elements` array, it came from an old build — the frames are worth
reading but the boxes are noise.

**Check coverage before trusting the run.** `max_action_gap_ms` must not exceed
`settings.max_gap_ms`. If it does, a step of the journey went unsampled and the
plan will have a hole in it — say so rather than inventing the missing step.

**Collapse** consecutive keyframes describing one logical action — filling a
field is often several keyframes and one `fill` step.

**Say what you could not establish.** Text scrolled off-screen, masked
passwords, values in frames you did not open. A form scrolled to Permissions
cannot show a validation error up in General. Mark inferences as inferences —
an unverified detail silently promoted to fact becomes a wrong assertion.

### 3. Write the plan

Follow **`specs/README.md`**, which is the authoritative format reference. Read it
before writing. `specs/journey-a1-user-setup.annotator-run1.md` is the worked
example.

**Name the file after the annotations directory, not just the journey.** A run in
`.video-annotations/journey-a1-user-setup-1/` writes
`specs/journey-a1-user-setup.annotator-run1.md`. Plain `specs/<slug>.md` is already
taken by earlier hand-read plans for these journeys, so writing there would collide
on the first re-run.

Every requirement is numbered `R1`, `R2`, … and states **what happens** and **what
the system does about it**. Both halves — *"Initials and Email Address filled"*
states neither, so nobody can write a test from it without inventing the missing
half. A line that describes context rather than behaviour is a note, not a numbered
requirement.

**Negative coverage is the part that gets skipped.** Each workflow should yield 4–5
failure and edge cases, each naming the wrong input and exactly what the system does
about it — the message text, whether Save disables, whether the URL changes, whether
the record is created.

**Never write an outcome the recording did not show.** This is the rule that
matters most here, because a recording shows one path and nothing else. If the
frames did not demonstrate what happens on failure, the behaviour is unknown —
put it in a **Not established** table with a note on why it matters, so the
planner agent discovers it live. A fabricated expected outcome becomes a wrong
assertion, which is worse than a missing test.

Include a `Source:` line naming the video and the annotations directory. Do not
overwrite an existing plan for the same journey — write alongside it and diff.

### 4. Stop and confirm

Show the user the step list and **wait**. Vision inference over a recording is
fallible, and a wrong step here becomes a wrong assertion three stages later.
This is the cheapest place in the pipeline to catch a mistake.

### 5. Generate

**One requirement → one test.** Every generated test traces back to a numbered
requirement, and every requirement has a test. Reference the number in the
`testCaseId` annotation or a comment so traceability survives into the code. Map
the parts directly:

| Part of the plan | Becomes |
|---|---|
| Preconditions | Fixture, storage state, or a setup step |
| The action | The action in the test body |
| A negative case's wrong input | That test's setup |
| The expected result | The `expect(...)` assertions |

Work the **Not established** table before generating: hand those open questions
to `playwright-test-planner` so it discovers the real behaviour against the
running application. Its answers become new numbered requirements — added to the
plan first, then tested. Do not skip straight to writing a test for something the
plan lists as unknown.

Invoke `playwright-test-generator` per scenario. It executes each step live via
the `playwright-test` MCP and reads the real accessibility tree, which is where
actual locators come from.

Generated code MUST follow `.claude/skills/ui-script-generator/SKILL.md` —
page-object fixtures, no hardcoded values, locator priority `getByRole` →
`getByLabel` → `getByPlaceholder` → text → CSS/`data-testid`. Rework agent
output that violates it before accepting.

### 6. Run

```
node scripts/run-playwright.js local tests/ui/<name>.spec.ts --project=chromium
```

Use the wrapper, not `npx playwright`. `&` in `D:\R&D\…` is a cmd.exe command
separator, so the `.bin` shims break in this repo — that is why
`scripts/run-playwright.js` exists.

### 7. Heal

On failure, invoke `playwright-test-healer`. It may fix locators and waits, but
must **not** weaken assertions or drop a step the recording clearly showed. If
the app genuinely contradicts the recording, report it — the recording may be
stale, or it may be a product bug.

### 8. Review gate

`npm run typecheck` clean; specs read as business scenarios; selectors live in
page objects; tags applied. Report the real outcome — if tests still fail after
healing, say so with the output.

Plan-specific checks:

- Every numbered line states both an action and an expected result; anything that
  only describes context is a note, not a requirement.
- At least 4 negative or edge cases exist, and each names what the system does about
  the wrong input — not merely that it is rejected.
- Every requirement number appears in exactly one test, and no test exists without one.
- Anything in **Not established** is either resolved into a numbered requirement or
  still listed as open — never silently dropped.

### Guardrails

- **Never write pixel coordinates into a spec.** No `page.mouse.click(x, y)`.
  Coordinates are evidence for you, not output. If you cannot name a control,
  say so and let the generator find it live.
- **Never invent an assertion the recording did not show.** Flag the gap.
- **Reuse existing page objects.** `UsersPage`, `LoginPage` and
  `LeftNavigationPage` already model much of PET Tiger. Check `src/pages/`
  before proposing a new one — add methods, don't build a parallel object.
- **Do not re-implement login.** Browser projects load `.auth/user.json`, so an
  authenticated journey starts logged in even if the recording shows the login
  screen. Trim those steps unless the journey is *about* logging in.
- **Do not overwrite a hand-written spec.** Generate alongside and diff.
  `tests/ui/user-setup.spec.ts` in particular is the human-authored reference
  for measuring this pipeline.
- **Cleanup is not optional.** PET Tiger has no UI delete and soft-deletes
  users, and the Initials field caps at 3 characters with a uniqueness rule. A
  spec that creates users needs SQL cleanup in `afterEach` and a
  regenerate-and-retry loop on `duplicate-initials`, or re-runs fail
  intermittently. Flag it if the plan does not call for them.
