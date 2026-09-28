/**
 * @fileoverview A screenshot after every user action in the journey suite.
 *
 * Playwright's `screenshot: 'on'` takes one shot at the end of a test; the
 * per-action frames only exist inside the trace. This patches the Page and
 * Locator prototypes — reached through the live `page`, never by deep-importing
 * playwright-core — so every click/fill/press leaves a numbered image on the
 * result without a spec or page object changing.
 *
 * Why the patch cannot escape: Playwright forks one process per worker
 * (playwright/lib/runner/processHost.js), tests inside a worker run serially,
 * and with no session the wrapper is a plain pass-through — so nothing is
 * captured between tests or after `page` teardown.
 *
 * Known limitation: two wrapped actions awaited concurrently would collapse into
 * one shot via the depth counter. No such call site exists here — the repo's
 * three `Promise.all` sites each pair one action with `waitForResponse`.
 */
import type { Page, TestInfo } from '@playwright/test';
import { Logger } from '../../utils/logger';
import { envNumber } from '../../utils/cleanup/residueSweep';

const logger = new Logger('ActionShots');

const LOCATOR_ACTIONS = [
    'click', 'fill', 'press', 'selectOption', 'check', 'uncheck',
    'dblclick', 'tap', 'setChecked', 'pressSequentially', 'type',
] as const;

const PAGE_ACTIONS = [
    'goto', 'click', 'fill', 'press', 'selectOption', 'check', 'uncheck',
    'dblclick', 'tap', 'setChecked',
] as const;

interface Options {
    type: 'jpeg' | 'png';
    ext: 'jpg' | 'png';
    mime: 'image/jpeg' | 'image/png';
    quality: number;
    timeoutMs: number;
    max: number;
}

interface Session {
    testInfo: TestInfo;
    seq: number;
    depth: number;
    opts: Options;
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
        timeoutMs: envNumber('ACTION_SHOTS_TIMEOUT_MS', 5_000),
        max: envNumber('ACTION_SHOTS_MAX', 250),
    };
}

export function beginSession(testInfo: TestInfo): void {
    session = { testInfo, seq: 0, depth: 0, opts: readOptions() };
}

export function endSession(): void {
    session = null;
}

// 40 chars: the on-disk name is sanitizeForFilePath(name) + a 40-char sha1 + ext,
// under an already long per-test output dir. Windows MAX_PATH is the constraint.
const UNSAFE = /[\\/:*?"<>|]/g;

function shorten(raw: string, max = 40): string {
    const flat = raw.replace(/\s+/g, ' ').replace(UNSAFE, '_').trim();
    return flat.length <= max ? flat : `${flat.slice(0, max - 1)}~`;
}

// String(locator) is Locator.toString — pure string work, no round trip to the
// browser — and yields the source-shaped `getByRole('button', { name: 'Save' })`.
function locatorLabel(self: unknown): string {
    try {
        return shorten(String(self));
    } catch {
        return 'locator';
    }
}

function pageLabel(method: string, args: unknown[]): string {
    const first = args[0];
    if (method === 'goto' && typeof first === 'string') {
        try {
            return shorten(new URL(first, 'http://local').pathname || '/');
        } catch {
            return shorten(first);
        }
    }
    return typeof first === 'string' ? shorten(first) : 'page';
}

async function capture(s: Session, page: Page, method: string, label: string, failed: boolean): Promise<void> {
    try {
        if (s.seq >= s.opts.max || page.isClosed()) return;
        const seq = String(++s.seq).padStart(4, '0');
        const file = s.testInfo.outputPath('action-shots', `${seq}.${s.opts.ext}`);
        await page.screenshot({
            // `path`, never `body`: a body attachment is base64-encoded over the
            // worker IPC and retained by every reporter — tens of MB at this volume.
            path: file,
            type: s.opts.type,
            ...(s.opts.type === 'jpeg' ? { quality: s.opts.quality } : {}),
            // No actionTimeout is configured, so without this a wedged page would
            // silently eat the whole test budget.
            timeout: s.opts.timeoutMs,
            // Guards against a HiDPI device descriptor quadrupling every image.
            scale: 'css',
            caret: 'hide',
        });
        const name = `action-${seq}-${method}${failed ? '-FAILED' : ''}-${label}.${s.opts.ext}`;
        await s.testInfo.attach(name, { path: file, contentType: s.opts.mime });
    } catch (error: unknown) {
        // Page closed, navigation in flight, frame detached, deadline passed — all
        // expected. Evidence capture must never decide a verdict.
        logger.debug(`action shot skipped after ${method}: ${String(error)}`);
    }
}

type Kind = 'page' | 'locator';

/* eslint-disable @typescript-eslint/no-explicit-any */
function wrap(proto: any, method: string, kind: Kind): void {
    const original = proto[method];
    if (typeof original !== 'function' || original.__actionShots) return;

    const patched = async function (this: any, ...args: unknown[]) {
        const s = session;
        if (!s) return await original.apply(this, args);

        // setChecked delegates to check/uncheck and pressSequentially to type, so
        // without this the nested call would shoot a second time.
        s.depth++;
        let failed = false;
        try {
            return await original.apply(this, args);
        } catch (error: unknown) {
            failed = true;
            throw error;
        } finally {
            s.depth--;
            if (s.depth === 0) {
                const page: Page | null = kind === 'page' ? this : (this.page?.() ?? null);
                const label = kind === 'page' ? pageLabel(method, args) : locatorLabel(this);
                if (page) await capture(s, page, method, label, failed);
            }
        }
    };
    patched.__actionShots = true;
    proto[method] = patched;
    restore.push(() => { proto[method] = original; });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function installActionShots(page: Page): void {
    if (restore.length) return;
    const pageProto = Object.getPrototypeOf(page);
    const locatorProto = Object.getPrototypeOf(page.locator(':root'));
    for (const m of PAGE_ACTIONS) wrap(pageProto, m, 'page');
    for (const m of LOCATOR_ACTIONS) wrap(locatorProto, m, 'locator');
}

export function uninstallActionShots(): void {
    for (const undo of restore.splice(0)) undo();
}
