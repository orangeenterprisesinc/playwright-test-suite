/**
 * Runs the Python video annotator over a screen recording and prints a summary.
 *
 * All detection logic lives in tools/video-annotator/annotate_video.py; this
 * only resolves the interpreter and passes arguments safely. Unrecognised flags
 * are forwarded, so `--scene-threshold`, `--max-frames` and friends work here.
 *
 * Usage:
 *   npm run video:annotate -- --input "docs/media/journey-a/a01-user-setup.mp4"
 *   npm run video:annotate -- --input <video> --output-dir <dir> --max-frames 40
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ANNOTATOR_DIR = path.join(REPO_ROOT, 'tools', 'video-annotator');
const ANNOTATOR_SCRIPT = path.join(ANNOTATOR_DIR, 'annotate_video.py');
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, '.video-annotations');

const BOOTSTRAP_HELP = [
    'Set it up once (see tools/video-annotator/README.md) — ~170 MB, opencv + numpy:',
    '  cd tools/video-annotator',
    '  py -3.12 -m venv .venv',
    '  .venv/Scripts/python -m pip install -r requirements.txt',
    '',
    'Or point VIDEO_ANNOTATOR_PYTHON at an interpreter that already has the deps.',
    'In CI, prefer the container: tools/video-annotator/Dockerfile.',
].join('\n');

function fail(message) {
    console.error(`\n${message}\n`);
    process.exit(1);
}

/**
 * Locate the interpreter with the annotator's dependencies. Deliberately no
 * fall-through to a bare `python` on PATH: on Windows that usually resolves to
 * the Microsoft Store stub, which fails with an unrelated install prompt
 * instead of telling you the venv is missing.
 */
function resolvePython() {
    const override = process.env.VIDEO_ANNOTATOR_PYTHON;
    if (override) {
        if (!fs.existsSync(override)) {
            fail(`VIDEO_ANNOTATOR_PYTHON points at a missing file: ${override}`);
        }
        return override;
    }

    const venv = process.platform === 'win32'
        ? path.join(ANNOTATOR_DIR, '.venv', 'Scripts', 'python.exe')
        : path.join(ANNOTATOR_DIR, '.venv', 'bin', 'python');

    if (!fs.existsSync(venv)) {
        fail(`Video annotator is not bootstrapped — no virtualenv at\n  ${venv}\n\n${BOOTSTRAP_HELP}`);
    }
    return venv;
}

/** Slug from a video filename, used as the default output folder name. */
function videoSlug(videoPath) {
    return path.basename(videoPath, path.extname(videoPath))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'video';
}

/**
 * Split argv into the two flags this script needs and everything else, which
 * is forwarded untouched so the annotator stays the single source of truth for
 * its own options.
 */
function parseArgs(argv) {
    let input = null;
    let outputDir = null;
    const passthrough = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--input' || arg === '-i') {
            input = argv[++i];
        } else if (arg === '--output-dir' || arg === '-o') {
            outputDir = argv[++i];
        } else {
            passthrough.push(arg);
        }
    }
    return { input, outputDir, passthrough };
}

function printSummary(outputDir) {
    const jsonPath = path.join(outputDir, 'annotations.json');
    if (!fs.existsSync(jsonPath)) {
        fail(`Annotator finished but wrote no annotations.json in ${outputDir}`);
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const keyframes = data.keyframes || [];
    const withCursor = keyframes.filter((kf) => kf.cursor).length;
    const seconds = data.duration_ms ? (data.duration_ms / 1000).toFixed(1) : '?';

    // The coverage check is the one number that matters: no interval between
    // consecutive action keyframes may exceed --max-gap-ms, or a step of the
    // journey went unsampled. Typing is invisible to frame-diff, so without
    // forced sampling a whole form-filling stretch can silently vanish.
    const gap = (data.max_action_gap_ms / 1000).toFixed(1);
    const limit = (data.settings.max_gap_ms / 1000).toFixed(1);
    const covered = data.max_action_gap_ms <= data.settings.max_gap_ms;

    console.log([
        '',
        `Video      : ${data.video} (${data.frame_size[0]}x${data.frame_size[1]}, ${seconds}s)`,
        `Keyframes  : ${keyframes.length}${data.truncated ? ' (capped — raise --max-frames)' : ''}`,
        `  action   : ${data.action_count} (${data.forced_count} force-sampled)`,
        `Max gap    : ${gap}s of ${limit}s allowed${covered ? '' : '  <-- A STEP MAY BE MISSING'}`,
        `Cursor     : ${withCursor} keyframe(s) matched a cursor template`,
        `Output     : ${outputDir}`,
        '',
        'Next: /annotations-to-script "' + outputDir + '"',
        '      Reads this output and drafts a plan under test-plans/, then hands off to the agents.',
        '',
    ].join('\n'));
}

function main() {
    const { input, outputDir, passthrough } = parseArgs(process.argv.slice(2));

    if (!input) {
        fail('Missing --input.\n\nUsage:\n  npm run video:annotate -- --input "docs/media/journey-a/a01-user-setup.mp4"');
    }

    const videoPath = path.resolve(REPO_ROOT, input);
    if (!fs.existsSync(videoPath)) {
        fail(`Video not found: ${videoPath}`);
    }
    if (!fs.existsSync(ANNOTATOR_SCRIPT)) {
        fail(`Annotator script missing: ${ANNOTATOR_SCRIPT}`);
    }

    // Resolve the interpreter before creating anything, so a failed preflight
    // doesn't leave an empty output directory behind.
    const python = resolvePython();

    const resolvedOut = outputDir
        ? path.resolve(REPO_ROOT, outputDir)
        : path.join(DEFAULT_OUTPUT_ROOT, videoSlug(videoPath));
    fs.mkdirSync(resolvedOut, { recursive: true });
    // Argument array, never a shell string: the reference recording is named
    // "Journey A1 User Setup (1).mp4" and both the spaces and the parentheses
    // are shell metacharacters that would corrupt an interpolated command line.
    const args = [ANNOTATOR_SCRIPT, '--input', videoPath, '--output-dir', resolvedOut, ...passthrough];

    const result = spawnSync(python, args, {
        cwd: ANNOTATOR_DIR,
        stdio: 'inherit',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    if (result.error) {
        fail(`Could not run the annotator (${python}): ${result.error.message}`);
    }
    if (result.status !== 0) {
        process.exit(result.status === null ? 1 : result.status);
    }

    printSummary(resolvedOut);
}

main();
