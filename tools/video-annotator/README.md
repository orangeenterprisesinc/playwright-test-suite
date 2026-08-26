# Video Annotator

Turns a screen recording of a manual test journey into timestamped keyframes and
change regions that the `/annotations-to-script` Claude Code skill reads to draft
a Playwright test plan.

```
docs/media/journey-a/a01-user-setup.mp4
   │  /annotate-video  ->  annotate_video.py
   │  frame-diff -> change points -> forced sampling -> keyframe pairs
   ▼
.video-annotations/<slug>/
   ├─ annotations.json               timestamps, change regions, coverage
   └─ frames/*-annotated.png         clean frames, one box around what changed
   │  /annotations-to-script         Claude reads BOTH (json alone is useless)
   ▼
test-plans/journey-<x>/<wf>-<slug>.md -> Planner -> Generator -> tests/web/<dir>/<wf>-<slug>.spec.ts
```

The two stages are separate skills on purpose: annotation is a deterministic CPU
job over a file and runs unattended in CI, while generation is interactive,
needs a live app, and has a human confirmation gate.

## What this does and does not do

It answers **when** the screen changed and **where on the frame** — nothing more.

It does **not** know what a control is called, or that it was clicked. That
reading happens downstream, where Claude looks at the rendered frames. This tool's
job is to reduce ~5,400 frames to the ~50 worth looking at, and to point at the
part of each that moved.

Every generated spec still goes through `playwright-test-generator`, which drives
the real browser and reads the live accessibility tree. That is where actual
`getByRole` locators come from — never from pixel coordinates.

### Why there is no object detector

Earlier versions ran a YOLOv8 UI-element detector (OmniParser `icon_detect`) and
emitted bounding boxes. It was removed after measurement:

- **It contributed nothing.** Every fact in the resulting test plans came from
  reading the frame image or from `change_region`. Never from a detector box.
- **It was 90% of the install** — 1,727 MB of site-packages, of which torch alone
  was 1,137 MB, plus `scipy`/`sympy`/`pandas`/`matplotlib` that the annotator
  never imported. Now 171 MB.
- **Its overlay hurt.** ~110 boxes per 1080p frame, including browser chrome and
  the Windows taskbar, drawn over the on-screen text that carries the meaning.
- **It carried AGPL-3.0** via `ultralytics`. The remaining dependencies are
  BSD/Apache only.

Removing it left keyframe selection byte-identical on the reference recording —
same 28 action timestamps — and cut runtime from 40 s to 22 s.

## Bootstrap (one-time, local)

Requires **real Python 3.11/3.12**. The `python.exe` in `WindowsApps` is the
Microsoft Store stub and will not work — if `python --version` prints an install
message, that is what you have.

```bash
cd tools/video-annotator
py -3.12 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

Verify:

```bash
.venv/Scripts/python -c "import cv2, numpy; print(cv2.__version__, numpy.__version__)"
```

Optional, only if you want cursor matching:
`.venv/Scripts/python make_cursors.py` — but read the caveat below first.

## Running it

Through the repo script, which resolves the venv and handles paths with spaces:

```bash
npm run video:annotate -- --input "docs/media/journey-a/a01-user-setup.mp4"
```

Directly:

```bash
.venv/Scripts/python annotate_video.py \
    --input ../../docs/media/journey-a/a01-user-setup.mp4 \
    --output-dir ../../.video-annotations/a01-user-setup
```

Recordings live under `docs/media/` (gitignored, see `test-plans/README.md`);
output goes to `.video-annotations/<slug>/` (also gitignored).

### Options

| Flag | Default | Purpose |
|---|---|---|
| `--input` | — | Source video (required) |
| `--output-dir` | — | Destination for `annotations.json` + `frames/` (required) |
| `--scene-threshold` | `0.006` | Fraction of pixels that must change to call a keyframe |
| `--pixel-delta` | `25` | Grayscale delta before a pixel counts as changed |
| `--min-gap-ms` | `900` | Debounce; suppresses animation and scroll bursts |
| `--max-gap-ms` | `5000` | Force a keyframe after this long with no change (`0` disables) |
| `--settle-ms` | `250` | Also capture the settled frame this long after each change |
| `--max-frames` | `60` | Hard cap on change points; evenly subsamples and says so. With `--settle-ms > 0` each surviving change point yields an action + settled frame, so up to 2x this many keyframes |
| `--cursor` | off | Enable cursor template matching (see caveat) |
| `--keep-raw` | off | Also keep un-annotated keyframe PNGs |

## Docker / CI

`Dockerfile` builds a ~330 MB image (`python:3.12-slim` + opencv + numpy). Because
the annotator has no Windows dependency, CI runs it on a stock `ubuntu-latest`
runner — nothing to provision, and no contention with the self-hosted box.

```bash
docker build -t video-annotator tools/video-annotator
docker run --rm -v "$PWD/in:/in:ro" -v "$PWD/out:/out" video-annotator \
    --input /in/journey.mp4 --output-dir /out
```

Build context is `tools/video-annotator`, **not** the repo root. Its
`.dockerignore` keeps a local developer venv out of the transfer — without it the
build appears to hang on "sending build context".

Two workflows:

| Workflow | Does |
|---|---|
| `.github/workflows/annotator-image.yml` | Builds and pushes to GHCR on changes to this directory; smoke-tests the pushed image |
| `.github/workflows/annotate-video.yml` | Manual dispatch: runs that image against a direct video URL, publishes `annotations.json` + gpg-encrypted `frames.tar.gz.gpg` as an artifact (needs repo secret `ANNOTATION_ARCHIVE_PASSPHRASE`; decrypt with `gpg -d frames.tar.gz.gpg \| tar xz`) |

**Stage 2 is not in CI** and should not be: it needs Claude reading the frames, a
live app to resolve locators against, and a human confirmation gate.

## Input format — the one requirement

**MP4 (H.264).** OpenCV is unreliable with the VP8/VP9 `.webm` many browser-based
recorders emit. Resolution, frame rate and cursor visibility do not matter.

The CI workflow checks the file *header* rather than the extension, because a
`.webm` renamed to `.mp4` passes an extension check and then dies inside OpenCV
with an unhelpful stack trace.

Playwright's own `.webm` recordings need transcoding first — the ffmpeg Playwright
ships is a webm-only build with no H.264 encoder, so use a real ffmpeg:

```bash
ffmpeg -i artifacts/results/<test>/video.webm -c:v libx264 -pix_fmt yuv420p out.mp4
```

## Tuning

The defaults are validated against `Journey A1 User Setup (1).mp4` (92.7 s, 15 fps,
1080p, dense enterprise form UI). They are deliberately more sensitive than the
original guesses, which were badly wrong: at `--scene-threshold 0.02` the annotator
produced **15 change points with a 20-second hole** covering the entire Personal
Info section — a whole step of the journey silently absent. Tuned, the same video
yields 28 action keyframes with no gap over 5 s.

Two mechanisms do that work together:

- `--scene-threshold` catches things that visibly change.
- `--max-gap-ms` catches things that **don't**. Typing into a text field moves a
  few dozen pixels, below any threshold that is not pure noise, so quiet stretches
  are sampled on a timer regardless. Frames picked this way are flagged
  `"forced": true`.

Adjust when:

- **Too many keyframes** (animations, video content, a blinking caret): raise
  `--scene-threshold` to `0.02`, or raise `--min-gap-ms`.
- **Steps still missing**: lower `--scene-threshold` to `0.004`, or lower
  `--max-gap-ms` to `3000`.

### Cursor matching is off by default, and you probably want to leave it off

Measured on the reference recording, the synthetic templates from
`make_cursors.py` plateau-match at ~0.88 against arbitrary background: they
reported a cursor on **100% of keyframes**, always the `hand` template, snapping
to the same three coordinates while the real pointer was elsewhere. A wrong
`cursor` is worse than none.

`change_region` needs no templates and is the reliable signal. Enable `--cursor`
only after replacing `cursors/*.png` with real crops from your own recording.

## Output

```json
{
  "video": "Journey A1 User Setup (1).mp4",
  "fps": 15.0,
  "duration_ms": 92666,
  "frame_size": [1920, 1080],
  "settings": { "scene_threshold": 0.006, "pixel_delta": 25, "min_gap_ms": 900,
                "max_gap_ms": 5000, "settle_ms": 250 },
  "truncated": false,
  "keyframe_count": 56,
  "action_count": 28,
  "forced_count": 10,
  "max_action_gap_ms": 5000,
  "keyframes": [{
    "index": 30,
    "timestamp_ms": 57866,
    "phase": "action",
    "forced": true,
    "change_score": 0.0041,
    "change_region": [0, 0, 1919, 1079],
    "annotated_image": "frames/keyframe-0030-annotated.png",
    "cursor": null
  }]
}
```

The fields that carry the signal:

- **`change_region`** — bounding box of the pixels that moved. Where to look.
- **`forced`** — nothing crossed the threshold; this frame was sampled to cover a
  quiet stretch. Almost always **typing**, so these carry field values and are the
  ones you least want to skip. A forced frame often has a whole-frame
  `change_region`, because there was nothing to localise.
- **`max_action_gap_ms`** — the coverage guarantee. If this exceeds
  `settings.max_gap_ms`, a step of the journey went unsampled.

Keyframes come in pairs: a `phase: "action"` frame at the moment of change and a
`phase: "settled"` frame just after, so a reader sees both the interaction and its
result.

## Troubleshooting

**`Could not open video`** — almost always a `.webm` (or one renamed to `.mp4`).
Transcode it; see Input format above.

**`No change points found`** — the video is static, or `--scene-threshold` is too
high. Try `0.002`.

**Slow** — roughly 20–25 s for a 3-minute 1080p clip, dominated by two sequential
decode passes. Lower `--max-frames` for a quick sanity check.

**`import cv2` fails in a container with `libGL.so.1: cannot open shared object
file`** — the base image is missing `libgl1` / `libglib2.0-0`. The bundled
Dockerfile installs both.

## Licensing

`opencv-python-headless` is Apache-2.0; `numpy` is BSD-3-Clause. Both are
permissive and safe to redistribute in a container image. The AGPL-3.0 obligation
that came with `ultralytics` no longer applies — the detector was removed.
