import { remote, type Browser } from 'webdriverio';
import path from 'node:path';
import { test as base, expect } from './base.fixture';
import { PetPocketMainMenuPage } from '@pages/device/PetPocketMainMenuPage';
import { PetPocketCrewInPage } from '@pages/device/PetPocketCrewInPage';
import { ScreenRecorder } from '@utils/device/screenRecorder';
import { seedDb, seedPrefs } from '@utils/device/deviceSeed';
import { APP_PACKAGE } from '@utils/device/adb';
import { APK_PATH, GOLDEN_DB } from '@data/device/petPocketFixture';

/**
 * Drives the PET Pocket Android app from inside a Playwright test.
 *
 * Appium cannot be a Playwright browser, but WebdriverIO's client library is
 * just a Node module — so one spec can capture on the emulator *and* verify the
 * web app with `page` / `sessionApi`, in one test, one report, one video set.
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
}

export const test = base.extend<{ device: DeviceApp }>({
    device: async ({}, use, testInfo) => {
        const driver = await remote({
            hostname: '127.0.0.1',
            port: 4723,
            path: '/',
            logLevel: 'error',
            capabilities: {
                platformName: 'Android',
                'appium:automationName': 'UiAutomator2',
                'appium:avd': process.env.DEVICE_AVD ?? 'petpocket_rs35',
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
        };

        await use(app);

        // ── teardown: attach the emulator recording, then close everything ──
        const mp4 = await recorder.stop(
            path.join(testInfo.outputDir, 'device-recording.mp4'),
        );
        if (mp4) {
            await testInfo.attach('device-recording', { path: mp4, contentType: 'video/mp4' });
        }
        await driver.deleteSession().catch(() => undefined);
    },
});

export { expect };
