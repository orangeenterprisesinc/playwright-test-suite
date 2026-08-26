#!/usr/bin/env python3
"""
Keyframe extractor for manual-test screen recordings.

Turns a recorded manual journey (.mp4) into a timestamped set of frames covering
every moment something changed on screen, plus the bounding box of what changed.
The output feeds the `/annotations-to-script` Claude Code skill, which reads it
alongside the rendered frames and drafts a plan under `test-plans/`.

Two signals are produced per keyframe:

  1. **Change points** - frames where the screen actually changed, found by a
     cheap grayscale frame-diff. A 3-minute 30fps clip has ~5,400 frames but
     only ~40-120 moments where anything happened.
  2. **`change_region`** - the bounding box of the pixels that moved. This is
     the targeting signal: it tells a downstream reader *where on the frame* to
     look for the control that was interacted with.

Frames come in `action` / `settled` pairs so a reader sees both the moment of
the change and its result.

## Why there is no object detector

Earlier versions ran a YOLOv8 UI-element detector (OmniParser `icon_detect`)
over every keyframe and emitted bounding boxes. It was removed after measurement
showed it contributed nothing: every fact in the resulting test plans came from
*reading the frame image* or from `change_region`, never from a detector box. It
cost 1.7 GB of dependencies (torch alone was 1.1 GB), carried an AGPL-3.0
obligation via `ultralytics`, and its ~110-boxes-per-frame overlay obscured the
on-screen text that actually carries the meaning.

What remains is opencv + numpy - about 200 MB - and produces the same downstream
result with clean, readable frames.

Usage:
    python annotate_video.py --input <video> --output-dir <dir> [options]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

# Frame-diff work happens at this width; full resolution adds cost without
# changing which frames get picked.
DIFF_WIDTH = 320

# Colours (BGR) for the rendered overlay.
COLOR_CHANGE = (255, 120, 0)   # blue - the region that changed
COLOR_CURSOR = (0, 0, 255)     # red  - matched cursor


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Extract timestamped keyframes and change regions from a screen recording.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--input", required=True, help="Path to the source video (.mp4)")
    p.add_argument("--output-dir", required=True, help="Directory for annotations.json and frames/")

    # Defaults below are the values validated against Journey A1 (92.7 s, 15fps,
    # 1080p, dense enterprise form UI). The original guesses were much worse:
    # a 0.02 threshold missed every typing step, including a 20-second stretch
    # filling in Personal Info that produced no keyframe at all. See the tuning
    # section of README.md before changing them.
    p.add_argument("--scene-threshold", type=float, default=0.006,
                   help="Fraction of pixels that must change to call a keyframe")
    p.add_argument("--pixel-delta", type=int, default=25,
                   help="Grayscale delta before a pixel counts as changed")
    p.add_argument("--min-gap-ms", type=int, default=900,
                   help="Debounce between keyframes; suppresses animation bursts")
    p.add_argument("--max-gap-ms", type=int, default=5000,
                   help="Force a keyframe after this long with no change (0 disables)")
    p.add_argument("--settle-ms", type=int, default=250,
                   help="Also capture the settled frame this long after each change (0 disables)")
    p.add_argument("--max-frames", type=int, default=60,
                   help="Hard cap on change points; with --settle-ms > 0 each yields an "
                        "action + settled frame, so up to 2x this many keyframes")

    # Cursor matching is OFF by default. Measured on the Journey A1 recording,
    # the synthetic templates plateau-match at ~0.88 on arbitrary background and
    # report a cursor on 100% of frames, snapping to the same three coordinates
    # while the real pointer is elsewhere. Enable only with real cursor crops
    # from your own recording (see make_cursors.py).
    p.add_argument("--cursor", action="store_true",
                   help="Enable cursor template matching (needs real crops in cursors/)")
    p.add_argument("--cursor-threshold", type=float, default=0.95, help="Cursor template match score")
    p.add_argument("--keep-raw", action="store_true", help="Also keep un-annotated keyframe PNGs")
    return p.parse_args()


# --------------------------------------------------------------------------
# Pass 1 - find the frames worth looking at
# --------------------------------------------------------------------------

def find_change_points(video: Path, fps: float, threshold: float, pixel_delta: int,
                       min_gap_ms: int, max_gap_ms: int) -> list[dict]:
    """Scan the video and return the frames where the screen changed.

    Score is the *fraction of pixels* that moved by more than `pixel_delta`,
    so 0.02 reads as "2% of the screen changed" - an intuitive dial. Mean
    absolute difference was rejected: a menu opening barely moves the mean.

    `max_gap_ms` forces a keyframe when nothing has crossed the threshold for
    too long. Typing into a text field changes a few dozen pixels, far below
    any threshold that is not pure noise, so on the Journey A1 recording a
    20-second stretch of filling in Personal Info produced no keyframe at all.
    A forced sample is cheap and turns a silently missing step into a visible
    one.
    """
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise SystemExit(f"Could not open video: {video}")

    min_gap_frames = max(1, int((min_gap_ms / 1000.0) * fps))
    max_gap_frames = int((max_gap_ms / 1000.0) * fps) if max_gap_ms > 0 else 0
    points: list[dict] = []
    prev_small: np.ndarray | None = None
    last_pick = -min_gap_frames
    idx = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        h, w = frame.shape[:2]
        small = cv2.cvtColor(
            cv2.resize(frame, (DIFF_WIDTH, max(1, int(h * DIFF_WIDTH / w)))),
            cv2.COLOR_BGR2GRAY,
        )

        if prev_small is not None:
            diff = cv2.absdiff(small, prev_small)
            changed = diff > pixel_delta
            score = float(np.count_nonzero(changed)) / changed.size

            hit = score >= threshold and (idx - last_pick) >= min_gap_frames
            forced = bool(max_gap_frames) and (idx - last_pick) >= max_gap_frames

            if hit or forced:
                # Bounding box of the change, scaled back to full resolution.
                # A forced sample may have no pixels over the delta at all, in
                # which case the whole frame is the region of interest.
                ys, xs = np.nonzero(changed)
                scale = w / DIFF_WIDTH
                region = ([int(xs.min() * scale), int(ys.min() * scale),
                           int(xs.max() * scale), int(ys.max() * scale)]
                          if xs.size else [0, 0, w - 1, h - 1])
                points.append({
                    "frame": idx,
                    "score": round(score, 4),
                    "forced": forced and not hit,
                    "change_region": region,
                })
                last_pick = idx

        prev_small = small
        idx += 1

    cap.release()
    return points


def cap_keyframes(points: list[dict], max_frames: int) -> tuple[list[dict], bool]:
    """Evenly subsample when there are too many change points.

    Even spacing rather than top-N-by-score: keeping the highest-scoring
    frames would cluster on one busy moment and drop whole steps of the
    journey. Temporal coverage matters more than per-frame drama here.
    """
    if len(points) <= max_frames:
        return points, False
    step = len(points) / max_frames
    return [points[int(i * step)] for i in range(max_frames)], True


# --------------------------------------------------------------------------
# Pass 2 - pull the selected frames off disk
# --------------------------------------------------------------------------

def extract_frames(video: Path, wanted: dict[int, dict], frames_dir: Path,
                   keep_raw: bool) -> dict[int, np.ndarray]:
    """Sequentially decode the video, returning only the frames we asked for.

    Sequential reads rather than `cap.set(CAP_PROP_POS_FRAMES, ...)`: seeking
    in a compressed stream lands on the nearest keyframe, so requested
    timestamps drift. Decoding straight through is slower but exact.
    """
    cap = cv2.VideoCapture(str(video))
    grabbed: dict[int, np.ndarray] = {}
    idx = 0
    remaining = set(wanted)

    while remaining:
        ok, frame = cap.read()
        if not ok:
            break
        if idx in remaining:
            grabbed[idx] = frame.copy()
            remaining.discard(idx)
            if keep_raw:
                cv2.imwrite(str(frames_dir / f"keyframe-{wanted[idx]['index']:04d}.png"), frame)
        idx += 1

    cap.release()
    return grabbed


# --------------------------------------------------------------------------
# Cursor (optional)
# --------------------------------------------------------------------------

def load_cursor_templates(cursors_dir: Path) -> list[tuple[str, np.ndarray, np.ndarray | None]]:
    """Load cursor bitmaps. Missing or empty directory is fine - we skip."""
    if not cursors_dir.is_dir():
        return []

    templates = []
    for png in sorted(cursors_dir.glob("*.png")):
        img = cv2.imread(str(png), cv2.IMREAD_UNCHANGED)
        if img is None:
            continue
        # An alpha channel becomes the match mask, so the transparent corners
        # of a non-rectangular arrow don't count against the score.
        mask = None
        if img.ndim == 3 and img.shape[2] == 4:
            mask = cv2.cvtColor(img[:, :, 3], cv2.COLOR_GRAY2BGR)
            img = img[:, :, :3]
        templates.append((png.stem, img, mask))
    return templates


def find_cursor(frame: np.ndarray, templates, threshold: float) -> dict | None:
    best = None
    for kind, tpl, mask in templates:
        if tpl.shape[0] > frame.shape[0] or tpl.shape[1] > frame.shape[1]:
            continue
        try:
            res = cv2.matchTemplate(frame, tpl, cv2.TM_CCORR_NORMED, mask=mask)
        except cv2.error:
            continue
        res = np.nan_to_num(res, nan=0.0, posinf=0.0, neginf=0.0)
        _, score, _, loc = cv2.minMaxLoc(res)
        if score >= threshold and (best is None or score > best["confidence"]):
            best = {
                # Hotspot is the tip for an arrow, so report the top-left corner
                # rather than the template centre.
                "x": int(loc[0]), "y": int(loc[1]),
                "kind": kind, "confidence": round(float(score), 3),
            }
    return best


# --------------------------------------------------------------------------
# Overlay
# --------------------------------------------------------------------------

def draw_overlay(frame: np.ndarray, change_region: list[int], cursor: dict | None) -> np.ndarray:
    """One rectangle around what changed - and the cursor if one was matched.

    Deliberately minimal. The detector version drew ~110 boxes per frame,
    including browser chrome and the Windows taskbar, which obscured the very
    on-screen text a reader needs. One region is the whole signal.
    """
    out = frame.copy()

    cv2.rectangle(out, (change_region[0], change_region[1]),
                  (change_region[2], change_region[3]), COLOR_CHANGE, 2)
    cv2.putText(out, "changed", (change_region[0] + 4, max(16, change_region[1] - 6)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_CHANGE, 2, cv2.LINE_AA)

    if cursor:
        cv2.circle(out, (cursor["x"], cursor["y"]), 14, COLOR_CURSOR, 2)
        cv2.drawMarker(out, (cursor["x"], cursor["y"]), COLOR_CURSOR,
                       cv2.MARKER_CROSS, 22, 1)

    return out


# --------------------------------------------------------------------------

def main() -> int:
    args = parse_args()
    started = time.time()

    video = Path(args.input).expanduser().resolve()
    if not video.is_file():
        raise SystemExit(f"Video not found: {video}")

    out_dir = Path(args.output_dir).expanduser().resolve()
    frames_dir = out_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    probe = cv2.VideoCapture(str(video))
    if not probe.isOpened():
        raise SystemExit(
            f"Could not open video: {video}\n"
            "If this is a Playwright .webm recording, transcode it to .mp4 first "
            "using the ffmpeg bundled with Playwright (see README)."
        )
    fps = probe.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(probe.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(probe.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(probe.get(cv2.CAP_PROP_FRAME_HEIGHT))
    probe.release()

    print(f"[1/3] Scanning {video.name} ({width}x{height}, {fps:.1f}fps, {total} frames)")
    points = find_change_points(video, fps, args.scene_threshold, args.pixel_delta,
                                args.min_gap_ms, args.max_gap_ms)
    points, truncated = cap_keyframes(points, args.max_frames)
    if truncated:
        print(f"      Capped to {args.max_frames} change points (evenly spaced) - raise --max-frames for more detail")
    if not points:
        raise SystemExit(
            "No change points found. The video may be static, or --scene-threshold "
            f"({args.scene_threshold}) may be too high."
        )
    print(f"      {len(points)} change point(s)")

    # Pair each action frame with the settled frame just after it, so the
    # downstream reader sees both the moment of the click and its result.
    settle_frames = int((args.settle_ms / 1000.0) * fps)
    wanted: dict[int, dict] = {}
    for pt in points:
        for phase, frame_no in (("action", pt["frame"]), ("settled", pt["frame"] + settle_frames)):
            if phase == "settled" and settle_frames <= 0:
                continue
            if frame_no in wanted or (total and frame_no >= total):
                continue
            wanted[frame_no] = {"phase": phase, "change_region": pt["change_region"],
                                "score": pt["score"], "forced": pt["forced"],
                                "frame": frame_no}

    # Number the keyframes in playback order. These dicts are the same objects
    # `wanted` holds, so extract_frames sees the index too.
    ordered = sorted(wanted.values(), key=lambda k: k["frame"])
    for i, entry in enumerate(ordered):
        entry["index"] = i

    print(f"[2/3] Extracting {len(ordered)} frame(s)")
    grabbed = extract_frames(video, wanted, frames_dir, args.keep_raw)

    templates = load_cursor_templates(Path(__file__).parent / "cursors") if args.cursor else []
    if args.cursor and not templates:
        print("      --cursor requested but no templates in cursors/ - skipping")

    print(f"[3/3] Rendering {len(grabbed)} keyframe(s)")
    keyframes = []
    for entry in ordered:
        frame = grabbed.get(entry["frame"])
        if frame is None:
            continue

        cursor = find_cursor(frame, templates, args.cursor_threshold) if templates else None

        name = f"keyframe-{entry['index']:04d}"
        cv2.imwrite(str(frames_dir / f"{name}-annotated.png"),
                    draw_overlay(frame, entry["change_region"], cursor))

        keyframes.append({
            "index": entry["index"],
            "timestamp_ms": int((entry["frame"] / fps) * 1000),
            "frame": entry["frame"],
            "phase": entry["phase"],
            "change_score": entry["score"],
            # True when nothing crossed the threshold and this frame was
            # sampled purely to cover a long quiet stretch (usually typing).
            "forced": entry["forced"],
            "change_region": entry["change_region"],
            "image": f"frames/{name}.png" if args.keep_raw else None,
            "annotated_image": f"frames/{name}-annotated.png",
            "cursor": cursor,
        })

    action = [k for k in keyframes if k["phase"] == "action"]
    gaps = [(b["timestamp_ms"] - a["timestamp_ms"]) / 1000.0
            for a, b in zip(action, action[1:])]

    payload = {
        "video": video.name,
        "video_path": str(video),
        "fps": round(fps, 3),
        "duration_ms": int((total / fps) * 1000) if total else None,
        "frame_size": [width, height],
        "generated_by": "annotate_video.py",
        "settings": {
            "scene_threshold": args.scene_threshold,
            "pixel_delta": args.pixel_delta,
            "min_gap_ms": args.min_gap_ms,
            "max_gap_ms": args.max_gap_ms,
            "settle_ms": args.settle_ms,
        },
        "truncated": truncated,
        "keyframe_count": len(keyframes),
        "action_count": len(action),
        "forced_count": sum(1 for k in action if k["forced"]),
        "max_action_gap_ms": int(max(gaps) * 1000) if gaps else 0,
        "keyframes": keyframes,
    }

    out_json = out_dir / "annotations.json"
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"\nDone in {time.time() - started:.1f}s")
    print(f"  {out_json}")
    print(f"  {frames_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
