---
name: annotate-video
description: Use when the user asks to annotate or process a screen recording of a manual test journey (e.g. "annotate the A1 recording in docs/media", "run the annotator on this recording") — runs the OpenCV frame-diff annotator over the video and writes timestamped annotations plus rendered keyframes. Stage 1 of two; stops before any test planning or code generation.
---

## Screen recording → annotations

Stage 1 of the video pipeline. Turns a recording into `annotations.json` plus
rendered keyframes, and stops. Stage 2 is `/annotations-to-script`.

Does **not** write a test plan and does **not** generate code. If the user asks
for a spec in the same breath, run this, report the output directory, then
hand over to `/annotations-to-script`.

### 1. Resolve the video

The argument may be a video file **or** a directory. Recordings live under
`docs/media/` (gitignored), ideally as `docs/media/journey-<x>/<wf>-<slug>.mp4`
matching the plan path — see `test-plans/README.md`.

- Directory → glob recursively for `*.mp4` and `*.webm`.
  - Exactly one → use it, and say which.
  - Several → list them with sizes and dates, and ask which. Do not guess.
  - None → say so and stop.
- File → use it directly.

`.webm` (Playwright's own recordings) is unreliable in OpenCV. If the annotator
fails to open one, transcode to MP4/H.264 first — but **not** with the ffmpeg
Playwright bundles: that is a webm-only build with no H.264 encoder, so it cannot
produce the output needed. A real ffmpeg is required. See
`tools/video-annotator/README.md`.

### 2. Preflight

`tools/video-annotator/.venv/` must exist. If it does not, print the bootstrap
block from `tools/video-annotator/README.md` and **stop** — do not install
Python or create the venv unless the user explicitly asks.

It is a small install (~170 MB: opencv + numpy, no torch, no model weights), so
this is a short detour rather than a decision, but it is still their machine.

### 3. Run

```
npm run video:annotate -- --input "<resolved video path>"
```

**Pass no tuning flags.** The defaults in `annotate_video.py` are the values
validated against the Journey A1 recording. Add flags only when step 4 says the
output is bad.

Output lands in `.video-annotations/<slug>/`, where the slug derives from the
filename — `Journey A1 User Setup (1).mp4` → `journey-a1-user-setup-1`.

### 4. Sanity-check before handing on

The command prints a summary. Read it; a bad run wastes the whole of stage 2.

| Symptom | Meaning | Fix |
|---|---|---|
| `Max gap` exceeds the allowed limit | a stretch of the journey went unsampled | lower `--max-gap-ms` |
| `Keyframes` says *capped* | keyframes were subsampled, steps may be lost | raise `--max-frames` |
| < ~10 action keyframes for a 60 s+ video | threshold too high, steps missing | `--scene-threshold 0.004` |
| Keyframes cluster in one burst | animation or video content on screen | raise `--min-gap-ms` |

**The coverage line is the one that matters.** The summary prints
`Max gap : Xs of Ys allowed`; if X exceeds Y the run flags it, and that means a
step of the journey has no keyframe covering it. Typing is invisible to
frame-diff, so a silent hole is the failure mode this tool exists to prevent.

`Cursor: 0` is **expected and correct** — cursor matching is off by default
because the synthetic templates false-positive on every frame. Targeting comes
from `change_region`.

### 5. Report

Finish with the **absolute path** of the output directory on its own line. That
path is the input to stage 2, and the user will paste it into the next prompt.

Also state: keyframe count, action-keyframe count, largest gap, and anything
retuned. Then say that `/annotations-to-script <path>` is the next step.

### Cost

Roughly 20–25 s of CPU and ~45 MB of frames per 90 s of 1080p video, on this
machine with no GPU — measured on the 92.7 s Journey A1 recording. Say so before
starting on anything much longer, so the user can decide.
