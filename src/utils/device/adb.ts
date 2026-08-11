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

/**
 * Target device serial (`adb devices`), for running against a real phone
 * instead of the `petpocket_rs35` AVD. Unset by default — every adb call then
 * targets whatever single device/emulator is connected, unchanged from before.
 * Required as soon as more than one is connected at once (adb otherwise
 * refuses with "more than one device/emulator").
 */
export const ADB_SERIAL = process.env.DEVICE_UDID;

/** Prefixes `-s <serial>` when DEVICE_UDID is set; passes args through otherwise. */
export function withSerial(args: string[]): string[] {
    return ADB_SERIAL ? ['-s', ADB_SERIAL, ...args] : args;
}

export function adb(args: string[]): Buffer {
    return execFileSync(ADB, withSerial(args), { maxBuffer: 256 * 1024 * 1024 }) as Buffer;
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
