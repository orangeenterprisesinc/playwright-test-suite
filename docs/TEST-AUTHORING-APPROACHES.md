# Test Authoring Approaches — Technical Evaluation

**PET Tiger — Playwright UI Automation Suite**

**Question:** what is the best input for our AI test-generation pipeline — a screen
recording, a Playwright codegen script, or a Chrome DevTools Recorder export?

**Scope:** Claude skills (`.claude/skills/`) plus three Playwright agents (planner,
generator, healer) convert a captured journey into framework-conforming specs: page
objects segregated, tests limited to navigation and assertions. Each workflow must also
yield 4–5 negative and edge-case scenarios.

---

## 1. The fundamental divide

Every approach falls into one of two classes, and the class determines the ceiling on
accuracy.

| | **Pixel-derived** | **DOM-derived** |
|---|---|---|
| Approaches | Direct video, video annotator | Playwright codegen, Chrome Recorder |
| Capture point | After rendering | At the DOM event |
| What is captured | An RGB bitmap | The element object |
| Element identity | **Must be inferred** | **Read directly** |
| Can emit a selector | **No — structurally impossible** | Yes, immediately |

### Why the pixel path cannot produce a selector

This is not a quality gap. It is a categorical one.

The annotator's richest possible output for a single control is:

```json
{ "id": 47, "type": "icon", "bbox": [672.0, 264.0, 1073.0, 300.0],
  "center": [872.5, 282.0], "confidence": 0.91, "in_change_region": true }
```

What Playwright requires is:

```ts
page.getByLabel('Name')
```

**No function maps the first to the second.** The DOM node's tag, id, ARIA role,
accessible name and attributes are not present in the bitmap — they were discarded at
render time. The only recovery route is to re-open the application and match visually,
which is a second derivation requiring the live app anyway.

By contrast, a DOM-instrumented recorder reads `<input id="name" aria-label="Name">`
at the instant of the event. The selector is not inferred; it is copied.

### The information-loss argument, quantified

| | Per frame |
|---|---|
| Pixel data captured | 1920 × 1080 × 3 = **6,220,800 bytes** |
| Semantic content actually needed | `{"action":"fill","target":"Name","value":"…"}` ≈ **45 bytes** |
| Ratio | **≈ 138,000 : 1** |

The browser held those 45 bytes at event time. The pixel path throws them away, then
spends CPU and tokens attempting to reconstruct them. **The user's observation is
correct: DOM-based capture is materially more effective, and this is why.**

---

## 2. Flow A — Direct video upload to Claude (the approach used previously)

```
[Uploaded Test Video]   Journey A1 User Setup (1).mp4 — H.264, 1920x1080, 92.7 s
        |
        v   BLOCKER 1: Claude has no video input modality
        v   BLOCKER 2: Playwright's bundled ffmpeg is a webm-only build (no H.264)
        |
        v   (workaround improvised at runtime)
[MP4 served over local HTTP with Range support]
        |
        v   (Playwright MCP drives real Chrome)
[Chrome <video> element: seek to t, drawImage() onto <canvas>]
        |
        v   canvas -> PNG screenshot
[~18 PNG frames, chosen ADAPTIVELY]
        |
        v   (frames read as images inside the Claude session;
        v    control labels legible directly - no box inference)
[Claude derives ordered steps]
        |
        v
[specs/journey-a1-user-setup.md]
        |
        v   (playwright-test-generator drives the LIVE app via MCP)
[Real locators resolved against live DOM]     <-- unavoidable step
        |
        v
[tests/ui/user-setup.generated.spec.ts]
```

**How it actually completed the task.** Claude had no video decoder available, so it
built one: it served the MP4 over HTTP, used Chrome's own H.264 decoder via a `<video>`
element, seeked to chosen timestamps, and rasterised each to a canvas it could screenshot.
It then applied the same grayscale frame-diff scene detection the annotator uses,
identified 18 change points, and **explicitly sampled the gaps where only a few pixels
move** (typing).

**The decisive property is adaptive seeking.** When the validation error was scrolled
off-screen, Claude went back and looked at a different timestamp. A fixed-schedule
extractor cannot do that.

---

## 3. Flow B — Video annotator (Python + OpenCV)

> **This flow shipped with a YOLOv8 UI-element detector, which has since been removed.**
> The detector measurements below are the evidence that justified removing it, so they are
> kept rather than deleted — but they describe a component that no longer exists. Stages
> and fields belonging to it are marked *removed* where they appear. The current annotator
> is OpenCV frame-differencing only; see finding 3 and
> `tools/video-annotator/annotate_video.py`.

```
[Uploaded Test Video]   .mp4 in Testing video/
        |
        v   npm run video:annotate --  --input "<video>"
        v   (Node scripts/annotate-video.js -> spawnSync -> Python 3.12)
[PASS 1 - OpenCV frame-diff over ALL 1390 frames]
        |   downscale to 320px grayscale; absdiff vs previous
        |   score = fraction of pixels changed by > 25 grey levels
        v   28 change points  (18 threshold hits + 10 FORCED samples)
[PASS 2 - sequential decode, no seeking]
        |
        v   56 frames written  (28 "action" + 28 "settled" @ +250 ms)
[YOLOv8 icon_detect - 56 CPU inferences]          <-- REMOVED (finding 3)
        |                                             measured 6,247 boxes total
        v                                             ~112/frame, median conf 0.50
[annotations.json  +  frames/*-annotated.png]     22 s CPU, ~45 MB
                                                  (was 40 s with the detector)
        |
        v   (Claude reads the JSON and the PNGs in-session)
[Claude infers steps from images]
        |
        v   RESULT: 6 steps verified, 13 inferred/unverified
[specs/journey-a1-user-setup.annotated.md]
        |
        v   (playwright-test-generator drives the LIVE app via MCP)
[Real locators resolved against live DOM]     <-- identical to Flow A
        |
        v
[tests/ui/*.spec.ts]
```

### Implementation skeleton — `tools/video-annotator/annotate_video.py`

```python
# ── Pass 1: which frames are worth looking at ────────────────────────────
def find_change_points(video, fps, threshold, pixel_delta,
                       min_gap_ms, max_gap_ms) -> list[dict]:
    """Score = FRACTION OF PIXELS that moved > pixel_delta grey levels.
    Mean absolute difference was rejected: a menu opening barely moves the mean."""
    small  = cv2.cvtColor(cv2.resize(frame, (320, h*320//w)), cv2.COLOR_BGR2GRAY)
    diff    = cv2.absdiff(small, prev_small)
    changed = diff > pixel_delta                       # default 25
    score   = np.count_nonzero(changed) / changed.size # 0.006 default threshold

    hit    = score >= threshold and (idx - last_pick) >= min_gap_frames
    forced = (idx - last_pick) >= max_gap_frames       # <-- covers typing
    if hit or forced:
        ys, xs = np.nonzero(changed)                   # bbox of what moved
        points.append({"frame": idx, "score": score, "forced": forced and not hit,
                       "change_region": [xs.min()*s, ys.min()*s,
                                         xs.max()*s, ys.max()*s]})

# ── Pass 2: pull those frames off disk ───────────────────────────────────
def extract_frames(video, wanted, frames_dir, keep_raw):
    """Sequential decode, NOT cap.set(CAP_PROP_POS_FRAMES).
    Seeking a compressed stream lands on the nearest I-frame, so requested
    timestamps drift. Decoding straight through is slower but exact."""

# ── Detection + targeting (REMOVED — see finding 3) ──────────────────────
# detect_elements(), check_weights() and flag_elements() no longer exist. The
# detector ran predict() on each keyframe and flagged every box against the
# change region and cursor. It was deleted because every fact in the resulting
# plans came from the frame image or from change_region instead, never from a
# box. change_region from pass 1 is now the only targeting signal, and the only
# thing drawn on an annotated frame is that one rectangle.
```

### Output schema (abridged, real values)

```json
{ "video": "Journey A1 User Setup (1).mp4", "fps": 15.0, "frame_size": [1920,1080],
  "settings": { "scene_threshold": 0.006, "pixel_delta": 25, "min_gap_ms": 900,
                "max_gap_ms": 5000, "settle_ms": 250 },
  "keyframe_count": 56, "action_count": 28, "forced_count": 10,
  "max_action_gap_ms": 5000, "truncated": false,
  "keyframes": [{
    "index": 14, "timestamp_ms": 22933, "frame": 344,
    "phase": "action", "forced": false,
    "change_score": 0.0237, "change_region": [96, 74, 1240, 820],
    "image": null,
    "annotated_image": "frames/keyframe-0014-annotated.png",
    "cursor": null
  }]}
```

**There is no `elements` array**, and `settings` carries no `conf`/`imgsz` — both belonged
to the removed detector. Output that still has them came from an old build. The coverage
guarantee lives in the two top-level fields `max_action_gap_ms` and `settings.max_gap_ms`:
if the former exceeds the latter, a stretch of the journey went unsampled.

### Two engineering findings from the build

**1. Cursor detection was removed.** Synthetic template matching under
`TM_CCORR_NORMED` plateau-matched at ~0.88 against arbitrary background and reported a
cursor on **100% of frames**, always snapping to the same three coordinates while the real
pointer was elsewhere. A wrong `under_cursor` names the wrong control, so it is now
off by default; targeting relies on `change_region` from frame-diff.

**2. Typing is invisible to frame-diff.** At the original 0.02 threshold, a **20-second
stretch** filling in the Personal Info section produced **zero keyframes** — a whole step
of the journey silently absent. Fixed by `--max-gap-ms`, which force-samples on a timer
regardless of pixel change. That single parameter is what makes the coverage guarantee
possible.

**3. The detector contributed no measurable value, and has been removed.** Every fact in
the resulting plan came from reading the frame image or from `change_region` (frame-diff
output) — never from a bounding box. The detector accounted for the entire 1.8 GB install
and the AGPL-3.0 obligation via `ultralytics`, and its ~110-boxes-per-frame overlay
obscured the on-screen text Claude needs to read.

It was deleted. Keyframe selection was byte-identical without it, runtime halved (40 s →
22 s), and `tools/video-annotator/requirements.txt` is now two lines —
`opencv-python-headless` and `numpy`.

---

## 4. Flow C — Playwright codegen (DOM-derived)

```
[Live application at BASE_URL]
        |
        v   node node_modules/@playwright/test/cli.js codegen <url>
        v   (already installed - Playwright 1.58.2, zero setup)
[Chromium + Playwright Inspector - instrumented INSIDE the page]
        |
        v   every click/type read from the DOM AT EVENT TIME
        v   tag, id, ARIA role, accessible name all available
[Locator engine ranks candidates]
        |   getByRole > getByLabel > getByPlaceholder > getByText > CSS
        v   emits code live as you click
[Vanilla .spec.ts]
        |   + real, resolvable locators
        |   - flat script, no page objects, hardcoded values, no assertions
        v   (Claude + /ui-script-generator skill)
[Refactor: selectors -> page objects, body -> test]
        |
        v
[tests/ui/*.spec.ts - framework conforming]
```

**Strength:** the locators are validated by Playwright's own selector engine and are
known to resolve. Zero setup, instant, free.

**Weakness for our pipeline:** it emits *opinionated code*. Claude must reverse-engineer
structure back out of a written script before rebuilding it to our conventions — the
pre-written syntax is discarded in the refactor.

---

## 5. Flow D — Chrome DevTools Recorder (DOM-derived, structured)

```
[Live application in Chrome]
        |
        v   DevTools > Recorder > Start recording
[Chrome DevTools Protocol - browser-level instrumentation]
        |
        v   each interaction captured with MULTIPLE ranked selector candidates
[recording.json - steps[] each carrying selectors[]]
        |      ARIA / CSS / XPath / pierce / text
        v   pure DATA: no code, no assertions, framework-agnostic
[Claude reads JSON directly - NO vision pass required]
        |
        +---> selectors[]  --->  page objects   (pick the most stable candidate)
        +---> steps[]      --->  happy-path test body
        +---> MUTATE steps --->  4-5 negative / edge candidates
        |                        (blank value, over-length, drop required,
        |                         reorder, boundary)
        v   (playwright-test-planner explores the LIVE app
        v    to discover the EXPECTED OUTCOME of each mutation)
[Assertions: error text, disabled Save, URL unchanged]
        |
        v
[tests/ui/*.spec.ts  x  5-6 scenarios]
```

### The JSON shape (why it maps onto POM)

```json
{ "title": "Create User",
  "steps": [
    { "type": "navigate", "url": "http://192.168.1.74/settings/users" },
    { "type": "click",
      "selectors": [ ["aria/New User"], ["#new-user-btn"],
                     ["xpath///*[@id=\"new-user-btn\"]"], ["text/New User"] ] },
    { "type": "change", "value": "Jesus Mendoza",
      "selectors": [ ["aria/Name"], ["#name"], ["xpath///*[@id=\"name\"]"] ] }
  ]}
```

The split is already done for us:

| Recorder field | Becomes |
|---|---|
| `selectors[]` | Page-object locators — and the alternates are **healer fallbacks** |
| `steps[].type` + `value` | Test body (navigation + actions) |
| *(absent)* | Assertions — generated by the planner agent |

**How this is better.** Codegen locks in one selector choice; Recorder hands over the
whole ranked candidate set, so the agent picks the most stable and the healer has real
alternates when a locator drifts. And because negatives are produced by *mutating a data
field* rather than editing lines inside an already-written script, the transformation is
far less error-prone.

---

## 6. Evidence — Journey A1 trial

Both video approaches were run against the same 92.7-second recording (1920 × 1080).

| | **Annotator** | **Direct video (ad-hoc)** |
|---|---|---|
| Frame decode | OpenCV | Chrome `<video>` → canvas |
| Frame selection | Frame-diff + forced sampling | **Same frame-diff technique** |
| Frame choice | Fixed schedule | **Adaptive — can re-seek** |
| Keyframes | 56 (28 action) | 18 + explicit typing samples |
| Steps confirmed from a frame | **6** | Effectively all |
| Steps inferred, unverified | **13** | — |
| Setup | 1.8 GB, Python 3.12 | None |
| Runtime | 40 s CPU + ~$2 tokens | ~$2 tokens |

Recovered by the ad-hoc run but **not** by the annotator: the *"Already in use"* error
text, the `JM`→`JM1` correction, the row count changing 33→34, the resulting URL
`/settings/users/34`, the header *"Edit User: Jesus Mendoza"*, and the deduction that
validation is **server-side on save**.

Both pixel approaches then required the **identical** live-DOM resolution step to obtain
usable locators — the step the DOM-derived approaches skip entirely.

---

## 7. Decisive finding — negative scenarios do not come from recordings

**A happy-path recording contains no information about failure behaviour.** A recording of
a successful user creation cannot tell you what appears when Name is left empty.

Mutating a recorded step produces the **action**. It cannot produce the **expected
outcome** — which error text, whether Save disables, whether the URL changes. That is
discoverable only by driving the live application.

Observed directly: Journey A1 demonstrates exactly one negative case (duplicate initials),
and the annotator could not read its error message because the form had scrolled away
from it.

> **The capture format is therefore largely irrelevant to 4 of the 5 required scenarios.**
> The happy path comes from the recording; the negatives come from the planner agent
> exploring the live app. Optimising the capture format optimises roughly 20% of the
> deliverable.

---

## 8. Recommendation

| Situation | Recommended approach |
|---|---|
| **Standard case — application reachable** | **Chrome Recorder JSON → agents** |
| Fast one-off, no Chrome setup | Playwright codegen → agents |
| No capture artifact needed at all | `playwright-test-planner` against the live app |
| **Only a video exists, cannot re-drive** | Video annotator |

**Primary: Chrome DevTools Recorder.** DOM-derived (no inference), structured data that
maps 1:1 onto the POM split, ranked selector alternates that double as healer fallbacks,
and a step model that mutates cleanly into negative cases. Since Claude regenerates all
code to our conventions regardless, codegen's pre-written syntax is discarded anyway —
structured data is the cleaner input.

**Trade-off, stated fairly.** Codegen's locators are engine-validated and known to
resolve; Recorder's candidates are selector strings requiring translation to Playwright
syntax. Codegen is also already installed and needs no extension. For a single urgent
spec, codegen is the lower-friction path.

**In all cases, negative and edge scenarios are generated by the planner agent against the
running application** — not derived from the capture.

### Position on the video annotator

Retained for the **recording-only case**, which is real: a journey captured by someone who
has since moved on, a client system we cannot access, or a state no longer reproducible.
It is the only option requiring no live application.

It should not be the default where the application is reachable — DOM-derived capture is
categorically more accurate, costs nothing, and requires no installation.

**Reduction applied.** The object-detection layer (`ultralytics`, `torch`) has been
removed. That dropped the install from ~1.8 GB to opencv-headless plus numpy, eliminated
the AGPL-3.0 obligation, halved the runtime, and removed the bounding-box overlay that
obscured on-screen text. Frame extraction, change detection and guaranteed-coverage
sampling were retained — these carry the genuine value: determinism, unattended batch
processing, and a guarantee that no interval longer than `--max-gap-ms` goes unsampled.

---

*Prepared against the PET Tiger Playwright suite (`playwright-pom-core` v1.0.0, Playwright
1.58.2, Claude Opus 5). Trial data from `Testing video/Journey A1 User Setup (1).mp4`. The
hand-authored reference suite for that journey is `tests/ui/user-setup.spec.ts`, which
currently defines 4 tests; the "5 scenarios, 6 tests, green in 47.1 s" figure recorded here
was measured against an earlier revision of that file and has not been re-run.*
