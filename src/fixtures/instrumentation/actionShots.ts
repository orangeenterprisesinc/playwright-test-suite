/**
 * @fileoverview A screenshot after every assertion in the journey suite.
 *
 * Playwright's `screenshot: 'on'` takes one shot at the end of a test; the
 * per-step frames only exist inside the trace. This patches the Frame prototype
 * — reached through the live `page`, never by deep-importing playwright-core —
 * so every `expect(locator)` / `expect(page)` matcher leaves a numbered image on
 * the result without a spec or page object changing. Every locator and page
 * assertion funnels through `Frame._expect`, so one hook covers them all.
 *
 * Why assertions and not clicks: a click shot shows the screen the moment
 * before it changes; the assertion shot shows the state the test actually
 * verified. One run at full window size shot every click at 1920x1080 and
 * shipped a 763 MB report — so the frames are also downscaled (480p by
 * default) through CDP, which the page-level screenshot API cannot do.
 *
 * Why the patch cannot escape: Playwright forks one process per worker
 * (playwright/lib/runner/processHost.js), tests inside a worker run serially,
 * and with no session the wrapper is a plain pass-through — so nothing is
 * captured between tests or after `page` teardown.
 */
import fs from 'fs';
import path from 'path';
import type { CDPSession, Page, TestInfo } from '@playwright/test';
import { Logger } from '../../utils/logger';
import { envNumber } from '../../utils/cleanup/residueSweep';

const logger = new Logger('ActionShots');

interface Options {
    type: 'jpeg' | 'png';
    ext: 'jpg' | 'png';
    mime: 'image/jpeg' | 'image/png';
    quality: number;
    /** Longest side of the saved frame is scaled so the height fits this. */
    height: number;
    timeoutMs: number;
    max: number;
}

interface Session {
    testInfo: TestInfo;
    seq: number;
    depth: number;
    opts: Options;
    cdp: Map<Page, CDPSession | null>;
    /** Source-shaped label of the locator being asserted, set by the Locator hook for the Frame hook. */
    label: string | null;
}

let session: Session | null = null;
const restore: Array<() => void> = [];

/** `ACTION_SHOTS=0` is the kill switch; default is on. */
export function actionShotsEnabled(): boolean {
    return process.env.ACTION_SHOTS !== '0';
}

function readOptions(): Options {
    const png = (process.env.ACTION_SHOTS_FORMAT ?? 'jpeg').toLowerCase() === 'png';
    return {
        type: png ? 'png' : 'jpeg',
        ext: png ? 'png' : 'jpg',
        mime: png ? 'image/png' : 'image/jpeg',
        quality: envNumber('ACTION_SHOTS_QUALITY', 60),
        height: envNumber('ACTION_SHOTS_HEIGHT', 480),
        timeoutMs: envNumber('ACTION_SHOTS_TIMEOUT_MS', 5_000),
        max: envNumber('ACTION_SHOTS_MAX', 250),
    };
}

export function beginSession(testInfo: TestInfo): void {
    session = { testInfo, seq: 0, depth: 0, opts: readOptions(), cdp: new Map(), label: null };
}

export function endSession(): void {
    const s = session;
    session = null;
    for (const cdp of s?.cdp.values() ?? []) void cdp?.detach().catch(() => undefined);
}

// 40 chars: the on-disk name is sanitizeForFilePath(name) + a 40-char sha1 + ext,
// under an already long per-test output dir. Windows MAX_PATH is the constraint.
const UNSAFE = /[\\/:*?"<>|]/g;

function shorten(raw: string, max = 40): string {
    const flat = raw.replace(/\s+/g, ' ').replace(UNSAFE, '_').trim();
    return flat.length <= max ? flat : `${flat.slice(0, max - 1)}~`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function cdpFor(s: Session, page: Page): Promise<CDPSession | null> {
    if (s.cdp.has(page)) return s.cdp.get(page)!;
    let cdp: CDPSession | null = null;
    try {
        cdp = await page.context().newCDPSession(page);
    } catch {
        // Not Chromium — page.screenshot below is the (full-size) fallback.
    }
    s.cdp.set(page, cdp);
    return cdp;
}

async function shoot(s: Session, page: Page, file: string): Promise<void> {
    const cdp = await cdpFor(s, page);
    if (cdp) {
        // `clip.scale` is the only screenshot path that downsizes the frame; the
        // page API always renders at CSS size.
        const { cssLayoutViewport: view } = await cdp.send('Page.getLayoutMetrics');
        const scale = Math.min(1, s.opts.height / view.clientHeight);
        const { data } = await cdp.send('Page.captureScreenshot', {
            format: s.opts.type,
            ...(s.opts.type === 'jpeg' ? { quality: s.opts.quality } : {}),
            clip: { x: 0, y: 0, width: view.clientWidth, height: view.clientHeight, scale },
        });
        // page.screenshot creates the parent folder itself; a raw write does not.
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
        return;
    }
    await page.screenshot({
        path: file,
        type: s.opts.type,
        ...(s.opts.type === 'jpeg' ? { quality: s.opts.quality } : {}),
        timeout: s.opts.timeoutMs,
        scale: 'css',
        caret: 'hide',
    });
}

async function capture(s: Session, page: Page, expression: string, label: string, failed: boolean): Promise<void> {
    try {
        if (s.seq >= s.opts.max || page.isClosed()) return;
        const seq = String(++s.seq).padStart(4, '0');
        const file = s.testInfo.outputPath('action-shots', `${seq}.${s.opts.ext}`);
        // No actionTimeout is configured, so without a deadline a wedged page
        // would silently eat the whole test budget.
        await withTimeout(shoot(s, page, file), s.opts.timeoutMs);
        // `path`, never `body`: a body attachment is base64-encoded over the
        // worker IPC and retained by every reporter.
        const name = `assert-${seq}-${expression}${failed ? '-FAILED' : ''}-${label}.${s.opts.ext}`;
        await s.testInfo.attach(name, { path: file, contentType: s.opts.mime });
    } catch (error: unknown) {
        // Page closed, navigation in flight, frame detached, deadline passed — all
        // expected. Evidence capture must never decide a verdict.
        logger.debug(`assertion shot skipped after ${expression}: ${String(error)}`);
    }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ExpectResult { matches: boolean; timedOut?: boolean }

// String(locator) is Locator.toString — pure string work, no round trip to the
// browser — and yields the source-shaped `getByRole('button', { name: 'Save' })`.
// Locator._expect delegates to Frame._expect with only the internal selector, so
// the label is stashed here for the Frame hook.
function wrapLocatorExpect(locatorProto: any): void {
    const original = locatorProto._expect;
    if (typeof original !== 'function' || original.__actionShots) return;

    const patched = async function (this: any, expression: string, options: any) {
        const s = session;
        if (s) {
            try {
                s.label = shorten(String(this));
            } catch {
                s.label = 'locator';
            }
        }
        try {
            return await original.call(this, expression, options);
        } finally {
            if (s) s.label = null;
        }
    };
    patched.__actionShots = true;
    locatorProto._expect = patched;
    restore.push(() => { locatorProto._expect = original; });
}

function wrapExpect(frameProto: any): void {
    const original = frameProto._expect;
    if (typeof original !== 'function' || original.__actionShots) return;

    const patched = async function (this: any, expression: string, options: any) {
        const s = session;
        if (!s) return await original.call(this, expression, options);

        s.depth++;
        let result: ExpectResult | undefined;
        try {
            result = await original.call(this, expression, options);
            return result;
        } finally {
            s.depth--;
            if (s.depth === 0) {
                const page: Page | null = this.page?.() ?? null;
                // Locator assertions arrive with the label stashed; page assertions carry none.
                const label = s.label ?? (typeof options?.selector === 'string' ? shorten(options.selector) : 'page');
                // A matcher that ran out its budget failed whichever way it was negated.
                if (page) await capture(s, page, expression, label, result?.timedOut === true);
            }
        }
    };
    patched.__actionShots = true;
    frameProto._expect = patched;
    restore.push(() => { frameProto._expect = original; });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function installActionShots(page: Page): void {
    if (restore.length) return;
    wrapLocatorExpect(Object.getPrototypeOf(page.locator(':root')));
    wrapExpect(Object.getPrototypeOf(page.mainFrame()));
}

export function uninstallActionShots(): void {
    for (const undo of restore.splice(0)) undo();
}
