/**
 * @fileoverview Bridge to the Python video annotator.
 *
 * Runs `tools/video-annotator/annotate_video.py` against a screen recording and
 * returns the parsed result. Owns only the *invocation* mechanics — resolving
 * the interpreter, passing arguments safely, and translating the annotator's
 * snake_case JSON into this framework's camelCase types. All frame-diff and
 * extraction logic lives on the Python side.
 *
 * The child process is launched with {@link spawnSync} and an argument array,
 * never a shell string. That is not incidental: the reference recording in this
 * repo is `Testing video/Journey A1 User Setup (1).mp4`, and both the spaces and
 * the parentheses are shell metacharacters that would corrupt an interpolated
 * command line. An argv array also removes the command-injection path entirely.
 *
 * Uses node builtins only, so `package.json` keeps its zero runtime dependencies.
 *
 * @module video/videoProcessor
 * @since 1.0.0
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    AnnotateOptions,
    AnnotationSettings,
    CursorHit,
    Keyframe,
    KeyframePhase,
    VideoAnnotation,
} from './types';

/** Repo root — this file sits at `<root>/src/video/`. */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ANNOTATOR_DIR = path.join(REPO_ROOT, 'tools', 'video-annotator');
const ANNOTATOR_SCRIPT = path.join(ANNOTATOR_DIR, 'annotate_video.py');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, '.video-annotations');
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/** Shape written by annotate_video.py, before camelCase conversion. */
interface RawAnnotations {
    video: string;
    video_path: string;
    fps: number;
    duration_ms: number | null;
    frame_size: [number, number];
    truncated: boolean;
    keyframe_count: number;
    action_count: number;
    forced_count: number;
    max_action_gap_ms: number;
    settings: {
        scene_threshold: number;
        pixel_delta: number;
        min_gap_ms: number;
        max_gap_ms: number;
        settle_ms: number;
    };
    keyframes: Array<{
        index: number;
        timestamp_ms: number;
        frame: number;
        phase: KeyframePhase;
        change_score: number;
        forced: boolean;
        change_region: [number, number, number, number];
        image: string | null;
        annotated_image: string;
        cursor: CursorHit | null;
    }>;
}

/**
 * Locate the Python interpreter that has the annotator's dependencies.
 *
 * `VIDEO_ANNOTATOR_PYTHON` wins so an engineer can point at any interpreter,
 * then the project venv. There is deliberately no fall-through to a bare
 * `python` on PATH: on Windows that usually resolves to the Microsoft Store
 * stub, which fails with an unrelated install message instead of telling you
 * the venv is missing.
 */
export function resolvePython(): string {
    const override = process.env.VIDEO_ANNOTATOR_PYTHON;
    if (override) {
        if (!fs.existsSync(override)) {
            throw new Error(`VIDEO_ANNOTATOR_PYTHON points at a missing file: ${override}`);
        }
        return override;
    }

    const venv = process.platform === 'win32'
        ? path.join(ANNOTATOR_DIR, '.venv', 'Scripts', 'python.exe')
        : path.join(ANNOTATOR_DIR, '.venv', 'bin', 'python');

    if (!fs.existsSync(venv)) {
        throw new Error(
            'Video annotator is not bootstrapped — no virtualenv at\n' +
            `  ${venv}\n\n` +
            'Set it up once (see tools/video-annotator/README.md):\n' +
            '  cd tools/video-annotator\n' +
            '  py -3.12 -m venv .venv\n' +
            '  .venv/Scripts/python -m pip install -r requirements.txt\n\n' +
            'Or point VIDEO_ANNOTATOR_PYTHON at an interpreter that already has the deps.\n' +
            'In CI, prefer the container: tools/video-annotator/Dockerfile.',
        );
    }
    return venv;
}

/** Filesystem-safe slug from a video filename, used as the default output folder. */
export function videoSlug(videoPath: string): string {
    return path.basename(videoPath, path.extname(videoPath))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'video';
}

/** Build the annotator's argv from the caller's options. */
function buildArgs(input: string, outputDir: string, options: AnnotateOptions): string[] {
    const args = [ANNOTATOR_SCRIPT, '--input', input, '--output-dir', outputDir];

    const numeric: Array<[string, number | undefined]> = [
        ['--scene-threshold', options.sceneThreshold],
        ['--pixel-delta', options.pixelDelta],
        ['--min-gap-ms', options.minGapMs],
        ['--max-gap-ms', options.maxGapMs],
        ['--settle-ms', options.settleMs],
        ['--max-frames', options.maxFrames],
    ];
    for (const [flag, value] of numeric) {
        if (value !== undefined) args.push(flag, String(value));
    }

    if (options.cursor) args.push('--cursor');
    if (options.keepRaw) args.push('--keep-raw');

    return args;
}

/** Translate the annotator's snake_case payload into the exported types. */
function toVideoAnnotation(raw: RawAnnotations, outputDir: string): VideoAnnotation {
    const settings: AnnotationSettings = {
        sceneThreshold: raw.settings.scene_threshold,
        pixelDelta: raw.settings.pixel_delta,
        minGapMs: raw.settings.min_gap_ms,
        maxGapMs: raw.settings.max_gap_ms,
        settleMs: raw.settings.settle_ms,
    };

    const keyframes: Keyframe[] = raw.keyframes.map((kf) => ({
        index: kf.index,
        timestampMs: kf.timestamp_ms,
        frame: kf.frame,
        phase: kf.phase,
        changeScore: kf.change_score,
        forced: kf.forced,
        changeRegion: kf.change_region,
        image: kf.image,
        annotatedImage: kf.annotated_image,
        cursor: kf.cursor,
    }));

    return {
        video: raw.video,
        videoPath: raw.video_path,
        fps: raw.fps,
        durationMs: raw.duration_ms,
        frameSize: raw.frame_size,
        truncated: raw.truncated,
        keyframeCount: raw.keyframe_count,
        actionCount: raw.action_count,
        forcedCount: raw.forced_count,
        maxActionGapMs: raw.max_action_gap_ms,
        keyframes,
        outputDir,
        settings,
    };
}

/**
 * Annotate a screen recording and return the parsed keyframe data.
 *
 * Writes `annotations.json` plus a `frames/` directory of rendered PNGs into
 * `outputDir` (default `.video-annotations/<video-slug>/`). Both are inputs to
 * the `/annotations-to-script` skill: the JSON supplies timing and change
 * regions, the PNGs supply the on-screen text a coordinate cannot carry.
 *
 * Throws with actionable guidance when the annotator is not bootstrapped, the
 * video is missing, or the child process fails — this is a developer tool, so
 * failing loudly beats returning an empty result.
 *
 * @param options  source video plus optional tuning
 */
export function annotateVideo(options: AnnotateOptions): VideoAnnotation {
    const input = path.resolve(REPO_ROOT, options.input);
    if (!fs.existsSync(input)) {
        throw new Error(`Video not found: ${input}`);
    }
    if (!fs.existsSync(ANNOTATOR_SCRIPT)) {
        throw new Error(`Annotator script missing: ${ANNOTATOR_SCRIPT}`);
    }

    // Resolve the interpreter before creating anything, so a failed preflight
    // doesn't leave an empty output directory behind.
    const python = resolvePython();

    const outputDir = options.outputDir
        ? path.resolve(REPO_ROOT, options.outputDir)
        : path.join(DEFAULT_OUTPUT_ROOT, videoSlug(input));
    fs.mkdirSync(outputDir, { recursive: true });

    const verbose = options.verbose !== false;

    const result = spawnSync(python, buildArgs(input, outputDir, options), {
        cwd: ANNOTATOR_DIR,
        encoding: 'utf-8',
        stdio: verbose ? 'inherit' : 'pipe',
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        // PYTHONIOENCODING keeps the annotator's output readable when Windows
        // consoles default to a legacy code page.
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    if (result.error) {
        throw new Error(`Could not run the annotator (${python}): ${result.error.message}`);
    }
    if (result.status !== 0) {
        const detail = verbose ? '' : `\n${(result.stderr || result.stdout || '').trim()}`;
        throw new Error(`Annotator exited with code ${result.status}.${detail}`);
    }

    const jsonPath = path.join(outputDir, 'annotations.json');
    if (!fs.existsSync(jsonPath)) {
        throw new Error(`Annotator finished but wrote no annotations.json in ${outputDir}`);
    }

    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as RawAnnotations;
    if (!Array.isArray(raw.keyframes)) {
        throw new Error(`Malformed annotations.json (no keyframes array): ${jsonPath}`);
    }

    return toVideoAnnotation(raw, outputDir);
}

/**
 * Condense an annotation run into a few lines for a console summary.
 *
 * The line that matters is the coverage check: `maxActionGapMs` must not exceed
 * the configured `maxGapMs`, or a step of the journey went unsampled. That is
 * the practical measure of whether a run is worth reading further.
 */
export function summarize(annotation: VideoAnnotation): string {
    const seconds = annotation.durationMs ? (annotation.durationMs / 1000).toFixed(1) : '?';
    const gap = (annotation.maxActionGapMs / 1000).toFixed(1);
    const limit = (annotation.settings.maxGapMs / 1000).toFixed(1);
    const covered = annotation.maxActionGapMs <= annotation.settings.maxGapMs;

    return [
        `Video      : ${annotation.video} (${annotation.frameSize[0]}x${annotation.frameSize[1]}, ${seconds}s)`,
        `Keyframes  : ${annotation.keyframeCount}${annotation.truncated ? ' (capped — raise --max-frames)' : ''}`,
        `  action   : ${annotation.actionCount} (${annotation.forcedCount} force-sampled)`,
        `Max gap    : ${gap}s of ${limit}s allowed${covered ? '' : '  <-- A STEP MAY BE MISSING'}`,
        `Cursor     : ${annotation.keyframes.filter((k) => k.cursor !== null).length} keyframe(s) matched`,
        `Output     : ${annotation.outputDir}`,
    ].join('\n');
}
