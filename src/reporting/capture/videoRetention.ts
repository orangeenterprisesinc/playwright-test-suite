import type { TestInfo } from '@playwright/test';

type VideoOption = TestInfo['project']['use']['video'];

/**
 * Playwright wires `use.video` into its own `context` fixture only. Fixtures that
 * build a context by hand (webpet.fixture, device.fixture's office half) have to
 * re-implement two decisions, and getting only the first one right is the trap:
 * recording unconditionally and then attaching unconditionally turns
 * 'retain-on-failure' into 'on', which is how a parity run ends up shipping a
 * video for all 405 green tests.
 *
 * Mirrors shouldCaptureVideo() and the `preserveVideo` expression in
 * node_modules/playwright/lib/index.js (v1.58) — see the module comment there if
 * this ever drifts on upgrade.
 */

export function videoMode(configured: VideoOption): string {
    if (!configured) return 'off';
    const mode = typeof configured === 'string' ? configured : configured.mode;
    // Playwright's own alias, kept so a project using the old name behaves.
    return mode === 'retry-with-video' ? 'on-first-retry' : mode;
}

/** Whether to pass `recordVideo` to newContext(). Decided before the test runs. */
export function shouldRecordVideo(testInfo: TestInfo): boolean {
    const mode = videoMode(testInfo.project.use.video);
    return mode === 'on' || mode === 'retain-on-failure' || (mode === 'on-first-retry' && testInfo.retry === 1);
}

/** Whether to keep the finished recording. Decided after, so it can read the outcome. */
export function shouldKeepVideo(testInfo: TestInfo): boolean {
    const mode = videoMode(testInfo.project.use.video);
    const failed = testInfo.status !== testInfo.expectedStatus;
    return (
        mode === 'on' ||
        (failed && mode === 'retain-on-failure') ||
        (mode === 'on-first-retry' && testInfo.retry === 1)
    );
}
