/**
 * @fileoverview Types for the video annotator output.
 *
 * These mirror the `annotations.json` written by
 * `tools/video-annotator/annotate_video.py`, converted from the Python side's
 * snake_case to the camelCase used everywhere else in this framework. The
 * conversion happens in {@link module:video/videoProcessor}, which is also the
 * only place the raw shape is read — so a change to the Python schema breaks
 * in exactly one file.
 *
 * @module video/types
 * @since 1.0.0
 */

/** A cursor located by template matching. Absent when no cursor was found. */
export interface CursorHit {
    x: number;
    y: number;
    /** Template that matched — `arrow`, `ibeam`, `hand`, or a custom filename. */
    kind: string;
    /** Match score, 0–1. */
    confidence: number;
}

/**
 * Whether a keyframe captures the moment of change or the settled state just
 * after it. Keyframes come in `action` → `settled` pairs so a reader sees both
 * the interaction and its result.
 */
export type KeyframePhase = 'action' | 'settled';

/** One analysed moment in the recording. */
export interface Keyframe {
    /** Sequential index across the whole run; also the PNG filename number. */
    index: number;
    /** Offset into the video, in milliseconds. */
    timestampMs: number;
    /** Source frame number. */
    frame: number;
    phase: KeyframePhase;
    /** Fraction of pixels that changed, 0–1. */
    changeScore: number;
    /**
     * True when nothing crossed the change threshold and this frame was sampled
     * purely to cover a long quiet stretch. In practice that means **typing** —
     * these frames carry field values that are otherwise invisible to
     * frame-diff, so they are the ones you least want to skip.
     */
    forced: boolean;
    /**
     * `[x1, y1, x2, y2]` bounding box of the pixels that moved. This is the
     * targeting signal: it says where on the frame to look for the control that
     * was interacted with.
     */
    changeRegion: [number, number, number, number];
    /** Un-annotated PNG, relative to the output directory. Only written with `keepRaw`. */
    image: string | null;
    /** PNG with the change region outlined, relative to the output directory. */
    annotatedImage: string;
    cursor: CursorHit | null;
}

/** Detector settings a run was produced with, echoed for reproducibility. */
export interface AnnotationSettings {
    sceneThreshold: number;
    pixelDelta: number;
    minGapMs: number;
    maxGapMs: number;
    settleMs: number;
}

/** Full result of annotating one video. */
export interface VideoAnnotation {
    /** Source filename. */
    video: string;
    /** Absolute path to the source video. */
    videoPath: string;
    fps: number;
    /** Total duration in ms, or null when the container has no frame count. */
    durationMs: number | null;
    /** `[width, height]` in pixels. */
    frameSize: [number, number];
    /** True when change points were subsampled to fit `maxFrames`. */
    truncated: boolean;
    keyframeCount: number;
    /** How many keyframes are `action` (the other half are their `settled` pairs). */
    actionCount: number;
    /** How many action keyframes were force-sampled rather than threshold hits. */
    forcedCount: number;
    /**
     * Largest interval between consecutive action keyframes. The coverage
     * guarantee: this should not exceed `settings.maxGapMs`, and a larger value
     * means a step of the journey may be missing.
     */
    maxActionGapMs: number;
    keyframes: Keyframe[];
    /** Absolute path to the directory holding `annotations.json` and `frames/`. */
    outputDir: string;
    settings: AnnotationSettings;
}

/** Options accepted by {@link module:video/videoProcessor.annotateVideo}. */
export interface AnnotateOptions {
    /** Path to the source video. Relative paths resolve against the repo root. */
    input: string;
    /** Output directory. Defaults to `.video-annotations/<video-slug>/`. */
    outputDir?: string;
    /** Fraction of pixels that must change to call a keyframe. */
    sceneThreshold?: number;
    /** Grayscale delta before a pixel counts as changed. */
    pixelDelta?: number;
    /** Debounce between keyframes, in ms. */
    minGapMs?: number;
    /** Force a keyframe after this long with no change, in ms. `0` disables. */
    maxGapMs?: number;
    /** Delay before capturing the settled frame, in ms. `0` disables pairing. */
    settleMs?: number;
    /**
     * Hard cap on change points; the annotator subsamples evenly and reports it.
     * With `settleMs > 0` each surviving change point yields an action + settled
     * frame, so up to 2x this many keyframes.
     */
    maxFrames?: number;
    /**
     * Enable cursor template matching. Off by default — the synthetic templates
     * false-positive on arbitrary background, and a wrong cursor position is
     * worse than none. Turn on only with real cursor crops in `cursors/`.
     */
    cursor?: boolean;
    /** Also keep un-annotated keyframe PNGs. */
    keepRaw?: boolean;
    /** Stream the annotator's progress to this process's stdout. Default true. */
    verbose?: boolean;
    /** Milliseconds before the annotator is killed. Default 30 minutes. */
    timeoutMs?: number;
}
