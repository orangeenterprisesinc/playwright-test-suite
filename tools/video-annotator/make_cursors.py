#!/usr/bin/env python3
"""
Generate cursor template bitmaps into cursors/ for template matching.

These are *synthetic approximations* of the standard Windows cursors (white
fill, black outline, transparent background used as the match mask). They are
good enough to locate an unmodified system cursor in a clean recording, and
they cost nothing to ship.

For materially better accuracy, replace them with real crops from your own
recording: pause on a frame where the cursor is over a plain background, crop
it tightly, save it as a PNG with a transparent background in cursors/, and
delete the synthetic file of the same name. Any *.png in cursors/ is used.

Cursor matching is a bonus signal, not the primary one. `change_region` in
annotations.json - the bounding box of the pixels that actually moved - works
regardless of whether the recorder captured a cursor at all, and many do not.

Usage:
    python make_cursors.py [--scale 1.5]      # scale for display DPI
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

OUT_DIR = Path(__file__).parent / "cursors"

# Standard Windows arrow outline, in a 12x21 grid, tip at the origin.
ARROW = [(0, 0), (0, 18), (4, 14), (7, 21), (10, 20), (7, 13), (12, 13)]

# I-beam: vertical stem with top and bottom serifs, in a 7x17 grid.
IBEAM = [(0, 0), (7, 0), (7, 2), (5, 2), (5, 15), (7, 15), (7, 17),
         (0, 17), (0, 15), (2, 15), (2, 2), (0, 2)]

# Pointing hand, heavily simplified, in a 16x21 grid.
HAND = [(5, 0), (8, 0), (8, 9), (10, 8), (13, 9), (15, 12), (15, 19),
        (13, 21), (6, 21), (3, 17), (2, 12), (4, 11), (5, 13)]


def render(points: list[tuple[int, int]], scale: float) -> np.ndarray:
    """Draw a cursor polygon as BGRA, with alpha as the template mask."""
    pts = (np.array(points, dtype=np.float32) * scale).astype(np.int32)
    w = int(pts[:, 0].max()) + 3
    h = int(pts[:, 1].max()) + 3

    canvas = np.zeros((h, w, 4), dtype=np.uint8)
    # White fill, black outline - the shape every default Windows cursor uses.
    cv2.fillPoly(canvas, [pts], (255, 255, 255, 255), lineType=cv2.LINE_AA)
    cv2.polylines(canvas, [pts], True, (0, 0, 0, 255),
                  thickness=max(1, int(scale)), lineType=cv2.LINE_AA)

    # Anything the polygon did not cover stays fully transparent, so matchTemplate
    # ignores the corners of the bounding rectangle.
    canvas[:, :, 3] = np.where(canvas[:, :, 3] > 0, 255, 0).astype(np.uint8)
    return canvas


def main() -> int:
    p = argparse.ArgumentParser(description="Generate synthetic cursor templates.")
    p.add_argument("--scale", type=float, default=1.5,
                   help="Size multiplier; raise for high-DPI recordings")
    args = p.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, shape in (("arrow", ARROW), ("ibeam", IBEAM), ("hand", HAND)):
        path = OUT_DIR / f"{name}.png"
        cv2.imwrite(str(path), render(shape, args.scale))
        print(f"  {path}")

    print(f"\nWrote 3 template(s) at scale {args.scale}. "
          "Replace with real crops from your recording for better accuracy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
