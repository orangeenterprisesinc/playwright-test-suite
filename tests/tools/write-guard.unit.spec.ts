/**
 * Offline proof of the UI-first write guard (`src/utils/api/writeGuard.ts`).
 *
 * The guard is a Proxy over an APIRequestContext, and a Proxy is exactly the kind of
 * thing that works until it does not: bind a trapped method to the Proxy instead of the
 * target and Playwright's own `_wrapApiCall` breaks days later, in an unrelated spec,
 * as a "context disposed" nobody traces back here. So it is proven against a local
 * http server rather than the app — no browser, no auth, no tenant.
 *
 * Runs only in the opt-in `tools-unit` project: `npm run test:unit`.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { expect, request, test } from '@playwright/test';
import {
    UiFirstViolation,
    allowApiWrites,
    guardApiContext,
    VIOLATION_ANNOTATION,
} from '@utils/api/writeGuard';

/** Echoes back method and path so a test can prove the real request was sent. */
let server: Server;
let baseURL: string;
const seen: Array<{ method: string; url: string }> = [];

test.beforeAll(async () => {
    server = createServer((req, res) => {
        seen.push({ method: req.method ?? '', url: req.url ?? '' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method, url: req.url }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`;
});

test.afterAll(async () => {
    // close() alone waits for keep-alive sockets, and an APIRequestContext holds them
    // open — without this the whole run hangs after the last assertion passes.
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A fresh guarded context plus the annotation sink the guard would push to. */
async function guarded(opts: { mode: string; label?: string; kind?: 'app' | 'relay' }) {
    process.env.UI_FIRST_GUARD = opts.mode;
    const annotations: Array<{ type: string; description?: string }> = [];
    const raw = await request.newContext({ baseURL });
    const ctx = guardApiContext(raw, {
        label: opts.label ?? 'unit',
        kind: opts.kind,
        baseURL,
        // Only `annotations` is read by the guard; a whole TestInfo is not needed.
        testInfo: { annotations } as never,
    });
    return { ctx, raw, annotations };
}

const violations = (a: Array<{ type: string; description?: string }>) =>
    a.filter((x) => x.type === VIOLATION_ANNOTATION);

/** The ledger is named for the worker index, which the runner chooses — so read them all. */
const LEDGER_DIR = path.join('artifacts', 'results');
const ledgerFiles = () =>
    existsSync(LEDGER_DIR)
        ? readdirSync(LEDGER_DIR).filter((n) => /^ui-first-w.*\.jsonl$/.test(n))
        : [];
const readLedger = () =>
    ledgerFiles().flatMap((n) =>
        readFileSync(path.join(LEDGER_DIR, n), 'utf-8')
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l) as Record<string, unknown>),
    );

test.describe('UI-first write guard', () => {
    test.beforeEach(() => {
        seen.length = 0;
        for (const n of ledgerFiles()) rmSync(path.join(LEDGER_DIR, n), { force: true });
    });

    test('a GET passes untouched and still reaches the server', async () => {
        const { ctx, raw, annotations } = await guarded({ mode: 'enforce' });
        const res = await ctx.get('crews');
        expect(res.ok()).toBe(true);
        expect(await res.json()).toMatchObject({ method: 'GET' });
        expect(violations(annotations), 'a read is never a violation').toHaveLength(0);
        await raw.dispose();
    });

    test('an undeclared POST annotates in warn mode but is still sent', async () => {
        const { ctx, raw, annotations } = await guarded({ mode: 'warn', label: 'sessionApi' });
        const res = await ctx.post('crew-time-in', { data: {} });
        expect(res.ok(), 'warn mode observes, it does not block').toBe(true);
        expect(seen.at(-1)).toMatchObject({ method: 'POST' });
        const found = violations(annotations);
        expect(found).toHaveLength(1);
        expect(found[0].description).toContain('POST crew-time-in');
        expect(found[0].description, 'names the context so the audit can group').toContain('sessionApi');
        await raw.dispose();
    });

    test('an undeclared POST throws in enforce mode, before the request is sent', async () => {
        const { ctx, raw } = await guarded({ mode: 'enforce' });
        await expect(ctx.post('crew-time-in', { data: {} })).rejects.toThrow(UiFirstViolation);
        expect(seen, 'enforce blocks — nothing reached the server').toHaveLength(0);
        await raw.dispose();
    });

    test('the Transfer screen’s non-committing POSTs are reads', async () => {
        const { ctx, raw, annotations } = await guarded({ mode: 'enforce' });
        await ctx.post('transfer-to-job-cards/analyze/42', { data: {} });
        await ctx.post('transfer-to-job-cards/job-cards-preview', { data: {} });
        expect(violations(annotations)).toHaveLength(0);
        expect(seen).toHaveLength(2);
        await raw.dispose();
    });

    test('a write inside an allowance passes and lands in the ledger with its reason', async () => {
        const { ctx, raw, annotations } = await guarded({ mode: 'enforce', label: 'cleanupScope' });
        await allowApiWrites('cleanup', 'after timeCards', () => ctx.delete('time-cards/7'));
        expect(violations(annotations)).toHaveLength(0);

        const ledger = readLedger();
        expect(ledger, 'the write was recorded').toHaveLength(1);
        expect(ledger[0]).toMatchObject({
            type: 'allowed',
            method: 'DELETE',
            allowance: 'cleanup',
            reason: 'after timeCards',
            label: 'cleanupScope',
        });
        await raw.dispose();
    });

    test('the allowance survives a polling await inside it', async () => {
        // AsyncLocalStorage is the whole mechanism; expect().toPass() re-enters the
        // callback across ticks, which is where a naive implementation loses context.
        const { ctx, raw, annotations } = await guarded({ mode: 'enforce' });
        let attempts = 0;
        await allowApiWrites('preference', 'B7 stickerStartLocations', async () => {
            await expect(async () => {
                attempts += 1;
                await ctx.put('preferences', { data: {} });
                expect(attempts).toBeGreaterThanOrEqual(3);
            }).toPass({ timeout: 10_000 });
        });
        expect(attempts).toBeGreaterThanOrEqual(3);
        expect(violations(annotations), 'every retry stayed inside the allowance').toHaveLength(0);
        await raw.dispose();
    });

    test('fetch is judged by its method, defaulting to GET', async () => {
        const { ctx, raw, annotations } = await guarded({ mode: 'warn' });
        await ctx.fetch('crews');
        expect(violations(annotations), 'no method means GET').toHaveLength(0);
        await ctx.fetch('crews', { method: 'PATCH', data: {} });
        expect(violations(annotations)).toHaveLength(1);
        await raw.dispose();
    });

    test('untrapped members stay bound to the real context', async () => {
        // The regression this file exists for: dispose() bound to the Proxy leaves the
        // underlying context alive and the next call fails somewhere else entirely.
        const { ctx } = await guarded({ mode: 'enforce' });
        expect(typeof ctx.storageState).toBe('function');
        await ctx.dispose();
        await expect(ctx.get('crews')).rejects.toThrow();
    });

    test('off mode hands back the context itself', async () => {
        process.env.UI_FIRST_GUARD = 'off';
        const raw = await request.newContext({ baseURL });
        expect(guardApiContext(raw, { label: 'unit' })).toBe(raw);
        await raw.dispose();
    });
});
