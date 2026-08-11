import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { adb, adbShell, ADB_PATH } from './adb';

const REMOTE = '/sdcard/pw-device-record.mp4';

/**
 * Records the emulator screen for the duration of a test. The MP4 is attached to
 * the Playwright report by the device fixture, so the native half of a journey
 * is reviewable next to the web half's video.
 *
 * Deliberately modest bitrate/size: the emulator's software encoder competes with
 * the app for CPU and at full resolution drops enough frames to make taps
 * unreliable.
 */
export class ScreenRecorder {
    private proc: ChildProcess | null = null;

    start(): void {
        try {
            adbShell(`rm -f ${REMOTE}`);
        } catch {
            /* first run */
        }
        this.proc = spawn(
            ADB_PATH,
            ['shell', 'screenrecord', '--bit-rate', '2000000', '--size', '480x960', REMOTE],
            { stdio: 'ignore', detached: true },
        );
        this.proc.unref();
    }

    /** Stop and pull the MP4. Returns the local path, or '' when unavailable. */
    async stop(dest: string): Promise<string> {
        if (!this.proc) return '';
        // SIGINT lets screenrecord write the MP4 moov atom before exiting;
        // killing it any other way leaves an unplayable file.
        try {
            adbShell('pkill -SIGINT screenrecord');
        } catch {
            /* already gone */
        }
        this.proc = null;
        await new Promise((r) => setTimeout(r, 2500));

        mkdirSync(path.dirname(dest), { recursive: true });
        try {
            adb(['pull', REMOTE, dest]);
            return existsSync(dest) ? dest : '';
        } catch {
            return '';
        }
    }
}
