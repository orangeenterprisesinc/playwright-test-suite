import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

/**
 * Joins the two halves of a device journey into one video.
 *
 * The halves are sequential — the emulator capture ends where the office
 * verification begins — so a temporal concat *is* the journey, and the report
 * gets one player instead of an mp4 and a webm sitting next to each other.
 *
 * Playwright's own bundled ffmpeg cannot do this: it is a VP8-only build with no
 * H.264 decoder and no mp4 demuxer, so it rejects `adb screenrecord` output
 * outright. Hence the `ffmpeg-static` devDependency.
 */

// Square canvas so neither half is cropped or upscaled much: the 480x960 device
// frame lands at native size, and a 960x540 office frame fits the width exactly.
const CANVAS_W = 960;
const CANVAS_H = 960;
const FPS = 15;

/** Encoding a 15-minute journey takes seconds, but this runs in teardown — never hang the run. */
const COMBINE_TIMEOUT_MS = 180_000;

function fit(index: number, label: string): string {
    return (
        `[${index}:v]scale=${CANVAS_W}:${CANVAS_H}:force_original_aspect_ratio=decrease,` +
        `pad=${CANVAS_W}:${CANVAS_H}:-1:-1:color=black,setsar=1,fps=${FPS}[${label}]`
    );
}

/**
 * ffmpeg-static ships the binary inside its package tarball, so this survives npm
 * declining to run install scripts (this repo has seven such packages pending) —
 * but its export is computed from `__dirname`, which any bundler rewrites to
 * somewhere the binary isn't. Hence the existence check rather than trusting the
 * export, and FFMPEG_PATH for a runner that would rather use a system build.
 */
function resolveFfmpeg(): string {
    for (const candidate of [process.env.FFMPEG_PATH, ffmpegPath]) {
        if (candidate && existsSync(candidate)) return candidate;
    }
    return '';
}

function run(bin: string, args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
        const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
        });
        const timer = setTimeout(() => {
            proc.kill('SIGKILL');
            resolve(false);
        }, COMBINE_TIMEOUT_MS);
        proc.on('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0 && stderr) console.warn(`[journeyVideo] ffmpeg failed: ${stderr.trim().split('\n').slice(-3).join(' ')}`);
            resolve(code === 0);
        });
    });
}

export interface CombineOptions {
    /** Emulator capture from `adb screenrecord`. */
    deviceMp4: string;
    /** Office-half browser capture. Absent when the test never reached the office. */
    officeWebm: string;
    dest: string;
}

/**
 * Returns the combined file, or '' when it could not be produced — the caller
 * then attaches whatever halves it has. Losing the *evidence* because the
 * *stitching* failed would be a worse bug than two videos.
 */
export async function combineJourneyVideo({ deviceMp4, officeWebm, dest }: CombineOptions): Promise<string> {
    const inputs = [deviceMp4, officeWebm].filter((f) => f && existsSync(f));
    // One half alone needs no concat — the caller attaches it directly.
    if (inputs.length < 2) return '';

    const ffmpeg = resolveFfmpeg();
    if (!ffmpeg) {
        console.warn('[journeyVideo] ffmpeg-static unavailable; leaving the two halves separate');
        return '';
    }

    // ffmpeg will not create the output's parent, and fails with a bare
    // "No such file or directory" that reads like a missing *input*.
    mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });

    const filter = [
        fit(0, 'a'),
        fit(1, 'b'),
        '[a][b]concat=n=2:v=1:a=0[v]',
    ].join(';');

    const ok = await run(ffmpeg, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        ...inputs.flatMap((f) => ['-i', path.resolve(f)]),
        '-filter_complex',
        filter,
        '-map',
        '[v]',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        // Screen content at 15fps compresses hard; a 74s journey lands ~150 KB,
        // which is what lets the result through the Allure size cap.
        '-crf',
        '30',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        path.resolve(dest),
    ]);

    return ok && existsSync(dest) ? dest : '';
}
