import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const APP_PACKAGE = 'com.orangesoftware.androidpet';

/**
 * SDK root. CI (and any properly set up machine) exports ANDROID_HOME; the
 * Windows fallback is this project's documented install location, since the SDK
 * had to live off the space-starved C: drive.
 */
export const ANDROID_HOME =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    (process.platform === 'win32' ? 'D:\\Android\\Sdk' : '');

/** Resolved adb, or plain `adb` from PATH when no SDK root is known (Linux CI). */
export const ADB_PATH = ANDROID_HOME
    ? path.join(ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
    : 'adb';

const ADB = ADB_PATH;

export function adb(args: string[]): Buffer {
    return execFileSync(ADB, args, { maxBuffer: 256 * 1024 * 1024 }) as Buffer;
}

export function adbShell(cmd: string): string {
    return adb(['shell', cmd]).toString('utf-8');
}

/** Run a command as the (debuggable) app user — works only on debug builds. */
export function runAs(cmd: string): string {
    return adbShell(`run-as ${APP_PACKAGE} ${cmd}`);
}

export function forceStopApp(): void {
    adbShell(`am force-stop ${APP_PACKAGE}`);
}
