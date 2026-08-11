import { remote, type Browser } from 'webdriverio';
import type { BrowserContext } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, expect } from './base.fixture';
import { createPageObjects, type PageObjects } from './pages.fixture';
import { PetPocketMainMenuPage } from '@pages/device/PetPocketMainMenuPage';
import { PetPocketCrewInPage } from '@pages/device/PetPocketCrewInPage';
import { ScreenRecorder } from '@utils/device/screenRecorder';
import { combineJourneyVideo } from '@utils/device/journeyVideo';
import { seedDb, seedPrefs } from '@utils/device/deviceSeed';
import { APP_PACKAGE } from '@utils/device/adb';
import { SESSION_STORAGE_STATE } from '@utils/api/sessionContext';
import { APK_PATH, GOLDEN_DB } from '@data/device/petPocketFixture';
import { shouldKeepVideo, shouldRecordVideo } from '@reporting/capture/videoRetention';

/**
 * Drives the PET Pocket Android app from inside a Playwright test.
 *
 * Appium cannot be a Playwright browser, but WebdriverIO's client library is
 * just a Node module — so one spec can capture on the emulator *and* verify the
 * web app with `office` / `sessionApi`, in one test and one report.
 *
 * ## One recording, not two
 *
 * A journey has two halves: the emulator, then the office verifying what the
 * emulator sent. They used to produce two videos — `adb screenrecord`'s mp4 plus
 * Playwright's own context webm — because the `device` project inherited the
 * global `video: 'on'` and the specs pulled in `page` at test start, so a browser
 * recorded fourteen idle minutes while the phone did the work.
 *
 * Now the project sets `video: 'off'` (Playwright records nothing on its own),
 * the office browser is built on first `office()` call so its recording starts
 * where the office half starts, and teardown concatenates the two halves into a
 * single `journey` attachment. Never attach the halves as well: one video is the
 * whole point.
 *
 * The Appium server itself is started by the `webServer` entry in
 * playwright.config.ts (device project only).
 */
export interface DeviceApp {
    /** Raw WebdriverIO session, for anything the page objects do not cover. */
    driver: Browser;
    mainMenu: PetPocketMainMenuPage;
    crewIn: PetPocketCrewInPage;
    /**
     * Seed the offline prefs and the golden DB, then relaunch so the app reads
     * both. Pass a different DB to vary the fixture per spec.
     */
    prepare: (opts?: { goldenDb?: string }) => Promise<void>;
    /** Label a step and attach a device screenshot to the Playwright report. */
    shot: (label: string) => Promise<void>;
    /**
     * Open the office browser and get its page objects, for the half of the
     * journey that verifies what the device sent.
     *
     * Deliberately a method and not the `pages` fixture: a fixture resolves
     * before the test body, and a browser that exists from test start is a
     * browser recording fourteen idle minutes. Calling this is what starts the
     * office recording, so call it when the office half actually begins.
     */
    office: () => Promise<PageObjects>;
}

export const test = base.extend<{ device: DeviceApp }>({
    device: async ({ browser }, use, testInfo) => {
        // DEVICE_UDID (from `adb devices`) targets a real, already-connected
        // phone instead of booting the AVD — same driver, same page objects.
        // Unset (the default) keeps launching the emulator exactly as before.
        const udid = process.env.DEVICE_UDID;
        const driver = await remote({
            hostname: '127.0.0.1',
            port: 4723,
            path: '/',
            logLevel: 'error',
            // WebdriverIO's default (120s) is tuned for an already-warm emulator.
            // A real device's first session installs two UiAutomator2 helper APKs
            // plus the app itself, which routinely runs past that.
            connectionRetryTimeout: 300_000,
            capabilities: {
                platformName: 'Android',
                'appium:automationName': 'UiAutomator2',
                ...(udid
                    ? { 'appium:udid': udid }
                    : { 'appium:avd': process.env.DEVICE_AVD ?? 'petpocket_rs35' }),
                'appium:app': APK_PATH,
                'appium:appPackage': APP_PACKAGE,
                'appium:appWaitActivity': '*',
                'appium:autoGrantPermissions': true,
                'appium:avdLaunchTimeout': 600_000,
                'appium:avdReadyTimeout': 600_000,
                'appium:adbExecTimeout': 120_000,
                'appium:uiautomator2ServerInstallTimeout': 180_000,
                'appium:newCommandTimeout': 600,
            } as Record<string, unknown>,
        });

        const recorder = new ScreenRecorder();
        recorder.start();

        const recordOffice = shouldRecordVideo(testInfo);
        const officeVideoDir = testInfo.outputPath('office');
        let officeContext: BrowserContext | undefined;

        // Stopped either when the office half opens or in teardown, whichever
        // comes first — idempotent so both call sites can just ask.
        let deviceMp4 = '';
        let deviceStopped = false;
        const stopDeviceRecording = async (): Promise<string> => {
            if (deviceStopped) return deviceMp4;
            deviceStopped = true;
            return recorder.stop(path.join(testInfo.outputDir, 'device-recording.mp4'));
        };

        let step = 0;
        const app: DeviceApp = {
            driver,
            mainMenu: new PetPocketMainMenuPage(driver),
            crewIn: new PetPocketCrewInPage(driver),

            prepare: async ({ goldenDb = GOLDEN_DB } = {}) => {
                // DEVICE_RELAY_SERVER/URL (set in .env.dev) give the app a real
                // Post Office destination, so EXPORT delivers instead of failing
                // on-device ("Missing body tag"). The relay has no accounts —
                // ValidateUser() only null-checks — so an address is a queue key
                // created on use; @petb1 keeps ours off the shared @usesilo pool,
                // where a collision would silently share someone's queue. Blank
                // both to run offline; the specs then skip the delivery assert.
                seedPrefs({
                    serverAddress: process.env.DEVICE_RELAY_SERVER,
                    restWebAddress: process.env.DEVICE_RELAY_URL,
                });
                seedDb(goldenDb);
                await driver.execute('mobile: terminateApp', { appId: APP_PACKAGE });
                await driver.execute('mobile: activateApp', { appId: APP_PACKAGE });
            },

            shot: async (label: string) => {
                step += 1;
                const png = Buffer.from(await driver.takeScreenshot(), 'base64');
                await testInfo.attach(`device-${String(step).padStart(2, '0')}-${label}`, {
                    body: png,
                    contentType: 'image/png',
                });
            },

            office: async () => {
                if (!officeContext) {
                    // Hand the baton over: the device half is done, so stop the
                    // emulator capture before the browser one starts. Skipping this
                    // would leave both recordings covering the office half, and the
                    // concat would replay that stretch twice.
                    deviceMp4 = await stopDeviceRecording();

                    officeContext = await browser.newContext({
                        storageState: SESSION_STORAGE_STATE,
                        // 960 wide matches the concat canvas, so the office half is
                        // letterboxed rather than rescaled in the combined video.
                        ...(recordOffice
                            ? { recordVideo: { dir: officeVideoDir, size: { width: 960, height: 540 } } }
                            : {}),
                    });
                }
                return createPageObjects(await officeContext.newPage());
            },
        };

        await use(app);

        // ── teardown: one recording out of two captures ──
        // Still running when the test never reached the office half.
        deviceMp4 = await stopDeviceRecording();

        // The office .webm is only written once its context closes, so close
        // before looking for the file.
        await officeContext?.close();
        const officeWebm = findOfficeVideo(officeVideoDir);

        if (shouldKeepVideo(testInfo)) {
            const journey = await combineJourneyVideo({
                deviceMp4,
                officeWebm,
                dest: path.join(testInfo.outputDir, 'journey.mp4'),
            });

            if (journey) {
                await testInfo.attach('journey', { path: journey, contentType: 'video/mp4' });
            } else {
                // Only one half exists, or ffmpeg was unavailable. Two videos beat
                // none, so fall back rather than lose the evidence.
                if (deviceMp4) {
                    await testInfo.attach('device-recording', { path: deviceMp4, contentType: 'video/mp4' });
                }
                if (officeWebm) {
                    await testInfo.attach('office-recording', { path: officeWebm, contentType: 'video/webm' });
                }
            }
        }

        await driver.deleteSession().catch(() => undefined);
    },
});

/** The office context writes one .webm under a directory Playwright names itself. */
function findOfficeVideo(dir: string): string {
    if (!existsSync(dir)) return '';
    const webm = readdirSync(dir).find((f) => f.endsWith('.webm'));
    return webm ? path.join(dir, webm) : '';
}

export { expect };
