/**
 * Cold-path proof for the `arrange` allowance: a reference row that is missing (or
 * binned) is created or restored through the API under `UI_FIRST_GUARD=enforce` with
 * no standing allowance on the context, and each write lands in the ledger as arrange.
 *
 * A stub server stands in for a cold environment — dev is warm, so the seeding POSTs
 * never fire there. Runs only in the opt-in `tools-unit` project: `npm run test:unit`.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { expect, request, test } from '@playwright/test';
import { guardApiContext } from '@utils/api/writeGuard';
import { ensureRanch } from '@utils/api/setupEntitiesApi';
import { ensureQuestion } from '@utils/api/questionsApi';

const binnedRanch = { ranchCounter: 9, code: 'R1', name: 'Ranch One', version: 'AAA=' };
const restoredRanch = { ranchCounter: 9, code: 'R1', name: 'Ranch One' };
const question = {
    questionCounter: 5, name: 'Q1', questionText: 't', allowedResponses: 'Yes,No', requiredResponse: 'Yes', active: true,
};

/** Once the restore has happened the row is listed again, as on the real endpoint. */
let restored = false;
const routes: Record<string, () => [number, unknown]> = {
    'GET /api/ranches': () => [200, restored ? [restoredRanch] : []],
    'POST /api/ranches': () => [409, { message: 'name already exists' }],
    'GET /api/ranches/deleted': () => [200, [binnedRanch]],
    'POST /api/ranches/9/restore': () => {
        restored = true;
        return [200, restoredRanch];
    },
    'GET /api/questions': () => [200, []],
    'POST /api/questions': () => [201, question],
};

let server: Server;
let baseURL: string;

test.beforeAll(async () => {
    server = createServer((req, res) => {
        const [status, body] = routes[`${req.method} ${req.url}`]?.() ?? [404, {}];
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/`;
});

test.afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

const LEDGER_DIR = path.join('artifacts', 'results');
const ledgerFiles = () =>
    existsSync(LEDGER_DIR) ? readdirSync(LEDGER_DIR).filter((n) => /^ui-first-w.*\.jsonl$/.test(n)) : [];
const readLedger = () =>
    ledgerFiles().flatMap((n) =>
        readFileSync(path.join(LEDGER_DIR, n), 'utf-8')
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l) as Record<string, unknown>),
    );

async function coldContext() {
    process.env.UI_FIRST_GUARD = 'enforce';
    const raw = await request.newContext({ baseURL });
    return { raw, ctx: guardApiContext(raw, { label: 'sessionApi', baseURL }) };
}

test.describe('arrange allowance on a cold environment', () => {
    test.beforeEach(() => {
        restored = false;
        for (const n of ledgerFiles()) rmSync(path.join(LEDGER_DIR, n), { force: true });
    });

    test('ensureRanch creates then restores a binned row without a violation', async () => {
        const { raw, ctx } = await coldContext();
        const ranch = await ensureRanch(ctx, { code: 'R1', name: 'Ranch One' });
        expect(ranch.id).toBe(9);

        const writes = readLedger();
        expect(writes.map((w) => `${String(w.type)}/${String(w.allowance)} ${String(w.method)} ${String(w.url)}`)).toEqual([
            'allowed/arrange POST ranches',
            'allowed/arrange POST ranches/9/restore',
        ]);
        await raw.dispose();
    });

    test('ensureQuestion creates a missing question as one arrange write', async () => {
        const { raw, ctx } = await coldContext();
        const created = await ensureQuestion(ctx, {
            name: 'Q1', questionText: 't', allowedResponses: 'Yes,No', requiredResponse: 'Yes',
        });
        expect(created.questionCounter).toBe(5);

        const writes = readLedger();
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({ type: 'allowed', allowance: 'arrange', method: 'POST', url: 'questions' });
        await raw.dispose();
    });
});
