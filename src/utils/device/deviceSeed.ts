import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adb, adbShell, forceStopApp, APP_PACKAGE } from './adb';
import { PREFS_FIXTURE } from '@data/device/petPocketFixture';

// The app's SQLite database, per AndroidPET/Docs/UsingDbFromErrorLogsEmail.md —
// the org's own troubleshooting flow swaps this exact file on emulators.
const DB_REL = 'databases/petdb.db';
const DB_TMP_REMOTE = '/data/local/tmp/petdb.seed.db';

// Default shared-prefs file (PreferenceManager.getDefaultSharedPreferences).
const PREFS_REL = `shared_prefs/${APP_PACKAGE}_preferences.xml`;
const PREFS_TMP_REMOTE = '/data/local/tmp/pet-prefs.xml';

export interface PrefsOverrides {
    /**
     * Relay service URL (`RestWebAddress`). Unset, the app generates a list and
     * uses **v1**, while web-pet defaults to v3 and its live test uses v6 — so pin
     * it explicitly when talking to a real relay.
     */
    restWebAddress?: string;
    /**
     * The **office** mailbox the device sends TO (`server_address_preference`).
     *
     * Without it the relay rejects the upload with "To Address cannot be Empty" —
     * and because the app reads the wrong element when reporting errors, that
     * surfaces as the useless "Missing body tag" dialog. Verified 2026-08-10:
     * setting this plus a v6 URL made a real export succeed
     * (`is push file success: true`, and every row got an `ExportTime`).
     */
    serverAddress?: string;
}

/**
 * Install the offline first-run preferences (see pet-prefs.xml for why each key
 * exists), with runtime-only entries injected before push. Debug-build only
 * (`run-as`). Caller restarts the app afterwards.
 */
export function seedPrefs(overrides: PrefsOverrides = {}): void {
    let xml = readFileSync(PREFS_FIXTURE, 'utf-8');
    const extra: string[] = [];
    if (overrides.restWebAddress) {
        extra.push(`    <string name="RestWebAddress">${overrides.restWebAddress}</string>`);
    }
    if (overrides.serverAddress) {
        extra.push(
            `    <string name="server_address_preference">${overrides.serverAddress}</string>`,
        );
    }
    if (extra.length) {
        xml = xml.replace('</map>', `${extra.join('\n')}\n</map>`);
    }
    const tmp = path.join(mkdtempSync(path.join(os.tmpdir(), 'pet-prefs-')), 'pet-prefs.xml');
    writeFileSync(tmp, xml, 'ascii');

    forceStopApp();
    adb(['push', tmp, PREFS_TMP_REMOTE]);
    adbShell(
        `run-as ${APP_PACKAGE} sh -c "mkdir -p shared_prefs && cp ${PREFS_TMP_REMOTE} ${PREFS_REL}"`,
    );
}

/** Replace the app's database with a golden fixture (caller restarts the app). */
export function seedDb(localGoldenDb: string): void {
    forceStopApp();
    adb(['push', localGoldenDb, DB_TMP_REMOTE]);
    adbShell(
        `run-as ${APP_PACKAGE} sh -c "mkdir -p databases && cp ${DB_TMP_REMOTE} ${DB_REL} && rm -f ${DB_REL}-journal ${DB_REL}-wal ${DB_REL}-shm"`,
    );
}

/**
 * Pull the app's live database for assertions. Captures adb's raw stdout in
 * Node — NEVER pipe this through a shell redirect (PowerShell re-encodes
 * binary, and in-shell redirection to /sdcard under run-as writes 0 bytes).
 */
export function pullDb(localDest: string): string {
    const bytes = adb(['exec-out', 'run-as', APP_PACKAGE, 'cat', DB_REL]);
    writeFileSync(localDest, bytes);
    return localDest;
}
