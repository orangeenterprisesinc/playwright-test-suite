# Stage 1 of the video pipeline, containerised.
#
# Build context is THIS directory, not the repo root:
#   docker build -t video-annotator tools/video-annotator
#
# The annotator is pure Python + OpenCV with no Windows dependency, so this runs
# on a stock ubuntu-latest GitHub runner — no self-hosted machine, no venv to
# provision, nothing to keep in sync. That is the whole point of packaging it.
#
# ~330 MB. An earlier version bundled a YOLOv8 detector (torch 1.1 GB,
# ultralytics + its unused scipy/pandas/matplotlib deps another 440 MB, plus
# 39 MB of weights) for roughly 1.9 GB, and carried an AGPL-3.0 obligation. It
# was dropped after measurement showed the bounding boxes contributed nothing
# downstream. See the header of annotate_video.py.

FROM python:3.12-slim

# opencv-python-headless still links libGL and libglib at import time even
# though it has no GUI. Without these, `import cv2` fails with
# "libGL.so.1: cannot open shared object file" — the single most common way
# this image fails to start. --no-install-recommends keeps it to ~25 MB.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copied before the source so `docker build` only re-resolves pip when the
# pinned dependencies actually change.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY annotate_video.py make_cursors.py ./

# Cursor matching is off by default (synthetic templates false-positive on
# every frame), so no cursors/ directory is baked in. Mount one at
# /app/cursors and pass --cursor if you have real crops.

# /in and /out are the mount points. Declared so `docker run` without -v still
# has somewhere to write rather than failing on a missing path.
RUN mkdir -p /in /out

# Not root: the container only reads a video and writes frames, so there is no
# reason to run privileged. Also keeps output files owned sanely when /out is a
# bind mount on Linux.
RUN useradd --create-home --uid 1001 annotator && chown -R annotator /app /in /out
USER annotator

# Args after the image name are appended, e.g.
#   docker run --rm -v "$PWD/in:/in" -v "$PWD/out:/out" video-annotator \
#       --input /in/journey.mp4 --output-dir /out
ENTRYPOINT ["python", "annotate_video.py"]
CMD ["--help"]
