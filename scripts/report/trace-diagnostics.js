/**
 * Console and network diagnostics from a run's Playwright traces.
 *
 * Reads artifacts/results/results.json (the JSON reporter) for each test's status and trace path, opens every
 * trace.zip, and writes diagnostics.json + diagnostics.md next to it: per test the console errors/warnings, page
 * errors, failed requests, browser API latency and the slowest requests; for the run an endpoint latency table, the
 * most frequent console errors, and the tenant (clientId) the session reported. Run with `--trace on` to cover passing
 * tests too; the default config keeps traces only for failures.
 *
 * Usage: node scripts/report/trace-diagnostics.js [resultsDir] [outDir]
 */
const fs = require('node:fs');
const path = require('node:path');

// Playwright ships yauzl in its zip bundle; no extra dependency for a report script.
const { yauzl } = require('playwright-core/lib/zipBundle');

const [resultsDir = path.join('artifacts', 'results'), outDir = resultsDir] = process.argv.slice(2);

const ANSI = /\x1b\[[0-9;]*m/g;
const SLOWEST = 10;

// Messages the suite itself causes, so the report never charges them to the app.
const SUITE_NOISE = [
    [/Service Worker registration blocked by Playwright/, 'suite: serviceWorkers block (playwright.config)'],
    [/Failed to read the 'localStorage' property from 'Window'/, 'suite: shell pin on about:blank (fixed 2026-11-06)'],
];
const sourceOf = (text) => (SUITE_NOISE.find(([re]) => re.test(text)) ?? [null, 'app'])[1];

function openZip(file) {
    return new Promise((resolve, reject) =>
        yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip))),
    );
}

function readEntry(zip, entry) {
    return new Promise((resolve, reject) =>
        zip.openReadStream(entry, (err, stream) => {
            if (err) return reject(err);
            const chunks = [];
            stream.on('data', (c) => chunks.push(c));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        }),
    );
}

async function readTrace(file) {
    const zip = await openZip(file);
    const entries = new Map();
    await new Promise((resolve, reject) => {
        zip.on('entry', (e) => {
            entries.set(e.fileName, e);
            zip.readEntry();
        });
        zip.on('end', resolve);
        zip.on('error', reject);
        zip.readEntry();
    });
    const texts = {};
    for (const [name, entry] of entries) {
        // test.trace holds the runner's steps, not browser events.
        if ((name.endsWith('.trace') && name !== 'test.trace') || name.endsWith('.network')) {
            texts[name] = (await readEntry(zip, entry)).toString('utf8');
        }
    }
    const resource = async (sha) => {
        const entry = entries.get(`resources/${sha}`);
        return entry ? (await readEntry(zip, entry)).toString('utf8') : null;
    };
    return { texts, resource, close: () => zip.close() };
}

function lines(text) {
    const out = [];
    for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
            out.push(JSON.parse(line));
        } catch {
            /* torn last line of an interrupted trace */
        }
    }
    return out;
}

/** /api/employees/37185?x=1 → /api/employees/:id — so one endpoint is one row. */
function endpointOf(url) {
    try {
        const u = new URL(url);
        const p = u.pathname.replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/[0-9a-f-]{32,36}(?=\/|$)/gi, '/:uuid');
        return `${u.host}${p}`;
    } catch {
        return url;
    }
}

const isApi = (url) => /\/api\//.test(url);

function quantile(sorted, q) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
}

function bump(map, key, extra) {
    const hit = map.get(key) ?? { count: 0, ...extra };
    hit.count += 1;
    map.set(key, hit);
    return hit;
}

async function analyseTrace(file) {
    const trace = await readTrace(file);
    const consoleMsgs = new Map();
    const pageErrors = new Map();
    const requests = [];
    const clientIds = new Set();
    try {
        for (const [name, text] of Object.entries(trace.texts)) {
            if (!name.endsWith('.trace')) continue;
            let pageUrl = '';
            for (const e of lines(text)) {
                if (e.type === 'frame-snapshot' && e.snapshot?.isMainFrame) pageUrl = e.snapshot.frameUrl ?? pageUrl;
                if (e.type === 'console' && (e.messageType === 'error' || e.messageType === 'warning')) {
                    const msg = String(e.text ?? '').slice(0, 300);
                    bump(consoleMsgs, `${e.messageType}|${msg}`, {
                        level: e.messageType,
                        text: msg,
                        source: e.location?.url ?? '',
                        page: pageUrl,
                    });
                }
                if (e.type === 'event' && e.method === 'pageError') {
                    const err = e.params?.error?.error ?? e.params?.error ?? {};
                    const msg = String(err.message ?? err.value ?? '').slice(0, 300);
                    bump(pageErrors, msg, { text: msg, page: pageUrl });
                }
            }
        }
        for (const [name, text] of Object.entries(trace.texts)) {
            if (!name.endsWith('.network')) continue;
            for (const e of lines(text)) {
                const s = e.snapshot;
                if (!s?.request) continue;
                const url = s.request.url;
                const status = s.response?.status ?? 0;
                const failure = s.response?._failureText ?? '';
                requests.push({
                    url,
                    endpoint: endpointOf(url),
                    method: s.request.method,
                    status,
                    failure,
                    ms: Math.round(s.time ?? 0),
                    ttfb: Math.round(s.timings?.wait ?? 0),
                    bytes: s.response?._transferSize > 0 ? s.response._transferSize : (s.response?.content?.size ?? 0),
                    origin: s._apiRequest ? 'test-api' : 'browser',
                    api: isApi(url),
                });
                if (url.endsWith('/api/session/me') && status === 200 && s.response?.content?._sha1) {
                    const body = await trace.resource(s.response.content._sha1);
                    const m = body && body.match(/"clientId"\s*:\s*(\d+)/);
                    if (m) clientIds.add(Number(m[1]));
                }
            }
        }
    } finally {
        trace.close();
    }
    return { consoleMsgs, pageErrors, requests, clientIds };
}

function collectTests(results) {
    const tests = [];
    const walk = (suite) => {
        for (const spec of suite.specs ?? []) {
            for (const t of spec.tests ?? []) {
                t.results.forEach((r, i) => {
                    const traces = (r.attachments ?? []).filter((a) => a.name === 'trace' && a.path).map((a) => a.path);
                    const err = (r.error?.message ?? r.errors?.[0]?.message ?? '').replace(ANSI, '').split('\n')[0];
                    tests.push({
                        file: spec.file,
                        title: spec.title,
                        project: t.projectName,
                        retry: i,
                        status: r.status,
                        expected: t.expectedStatus,
                        durationMs: r.duration,
                        error: err.slice(0, 300),
                        traces,
                    });
                });
            }
        }
        for (const child of suite.suites ?? []) walk(child);
    };
    for (const s of results.suites ?? []) walk(s);
    return tests;
}

function fmtMs(ms) {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function fmtBytes(b) {
    if (b >= 1 << 20) return `${(b / (1 << 20)).toFixed(1)} MB`;
    if (b >= 1 << 10) return `${(b / (1 << 10)).toFixed(0)} KB`;
    return `${b} B`;
}

const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

async function main() {
    const resultsFile = path.join(resultsDir, 'results.json');
    if (!fs.existsSync(resultsFile)) {
        console.error(`${resultsFile} not found — run with the JSON reporter (the suite config writes it).`);
        process.exit(1);
    }
    const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
    const tests = collectTests(results);

    const endpoints = new Map();
    const consoleAll = new Map();
    const pageErrorAll = new Map();
    const clientIds = new Set();
    let traced = 0;
    let unreadable = 0;

    for (const t of tests) {
        const reqs = [];
        const cons = new Map();
        const pErr = new Map();
        for (const file of t.traces) {
            if (!fs.existsSync(file)) continue;
            let a;
            try {
                a = await analyseTrace(file);
            } catch (err) {
                unreadable += 1;
                t.traceError = String(err.message ?? err);
                continue;
            }
            traced += 1;
            reqs.push(...a.requests);
            for (const [k, v] of a.consoleMsgs) {
                const hit = cons.get(k) ?? { ...v, count: 0 };
                hit.count += v.count;
                cons.set(k, hit);
            }
            for (const [k, v] of a.pageErrors) {
                const hit = pErr.get(k) ?? { ...v, count: 0 };
                hit.count += v.count;
                pErr.set(k, hit);
            }
            a.clientIds.forEach((id) => clientIds.add(id));
        }
        delete t.traces;
        t.traced = reqs.length > 0 || cons.size > 0;

        const browserApi = reqs.filter((r) => r.origin === 'browser' && r.api && r.status > 0);
        const times = browserApi.map((r) => r.ms).sort((x, y) => x - y);
        const failed = new Map();
        for (const r of reqs) {
            if (r.status >= 400 || r.status === 0 || r.failure) {
                bump(failed, `${r.method} ${r.endpoint} ${r.status || r.failure}`, {
                    method: r.method,
                    endpoint: r.endpoint,
                    status: r.status,
                    failure: r.failure,
                    origin: r.origin,
                });
            }
            if (r.api && r.status > 0) {
                const ep = endpoints.get(`${r.method} ${r.endpoint}`) ?? {
                    method: r.method,
                    endpoint: r.endpoint,
                    times: [],
                    errors: 0,
                    bytes: 0,
                    browser: 0,
                    testApi: 0,
                };
                ep.times.push(r.ms);
                ep.bytes += r.bytes;
                if (r.status >= 400) ep.errors += 1;
                if (r.origin === 'browser') ep.browser += 1;
                else ep.testApi += 1;
                endpoints.set(`${r.method} ${r.endpoint}`, ep);
            }
        }
        t.network = {
            requests: reqs.length,
            browserApi: browserApi.length,
            testApi: reqs.filter((r) => r.origin === 'test-api').length,
            bytes: reqs.reduce((n, r) => n + r.bytes, 0),
            apiP50: quantile(times, 0.5),
            apiP95: quantile(times, 0.95),
            failed: [...failed.values()].sort((a, b) => b.count - a.count),
            slowest: [...reqs]
                .sort((a, b) => b.ms - a.ms)
                .slice(0, SLOWEST)
                .map(({ method, endpoint, status, ms, ttfb, bytes, origin }) => ({ method, endpoint, status, ms, ttfb, bytes, origin })),
        };
        t.console = [...cons.values()].sort((a, b) => b.count - a.count);
        t.pageErrors = [...pErr.values()].sort((a, b) => b.count - a.count);
        for (const c of t.console) {
            const hit = consoleAll.get(`${c.level}|${c.text}`) ?? { level: c.level, text: c.text, count: 0, tests: 0 };
            hit.count += c.count;
            hit.tests += 1;
            consoleAll.set(`${c.level}|${c.text}`, hit);
        }
        for (const p of t.pageErrors) {
            const hit = pageErrorAll.get(p.text) ?? { text: p.text, count: 0, tests: 0 };
            hit.count += p.count;
            hit.tests += 1;
            pageErrorAll.set(p.text, hit);
        }
    }

    const endpointRows = [...endpoints.values()].map((ep) => {
        const s = ep.times.sort((x, y) => x - y);
        return {
            method: ep.method,
            endpoint: ep.endpoint,
            calls: s.length,
            browser: ep.browser,
            testApi: ep.testApi,
            p50: quantile(s, 0.5),
            p95: quantile(s, 0.95),
            max: s[s.length - 1] ?? 0,
            totalMs: s.reduce((n, x) => n + x, 0),
            errors: ep.errors,
            avgBytes: s.length ? Math.round(ep.bytes / s.length) : 0,
        };
    });

    const count = (st) => tests.filter((t) => t.retry === 0 && t.status === st).length;
    const summary = {
        generatedAt: new Date().toISOString(),
        resultsDir: path.resolve(resultsDir),
        runStart: results.stats?.startTime,
        runDurationMs: results.stats?.duration,
        stats: results.stats,
        tests: tests.filter((t) => t.retry === 0).length,
        passed: count('passed'),
        failed: count('failed') + count('timedOut') + count('interrupted'),
        skipped: count('skipped'),
        tracesRead: traced,
        tracesUnreadable: unreadable,
        testsWithTrace: tests.filter((t) => t.traced).length,
        clientIds: [...clientIds].sort(),
    };

    const report = {
        summary,
        endpoints: endpointRows.sort((a, b) => b.p95 - a.p95),
        console: [...consoleAll.values()].map((c) => ({ ...c, source: sourceOf(c.text) })).sort((a, b) => b.tests - a.tests || b.count - a.count),
        pageErrors: [...pageErrorAll.values()].map((p) => ({ ...p, source: sourceOf(p.text) })).sort((a, b) => b.tests - a.tests || b.count - a.count),
        tests,
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'diagnostics.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(outDir, 'diagnostics.md'), toMarkdown(report));
    console.log(
        `diagnostics: ${summary.tests} tests (${summary.passed} passed, ${summary.failed} failed, ${summary.skipped} skipped), ` +
            `${summary.tracesRead} traces read, ${endpointRows.length} API endpoints, clientId ${summary.clientIds.join(',') || 'n/a'} → ` +
            path.join(outDir, 'diagnostics.md'),
    );
}

function toMarkdown(r) {
    const s = r.summary;
    const out = [];
    out.push(`# Run diagnostics`, '');
    out.push(`Run start ${s.runStart ?? 'n/a'} · duration ${fmtMs(Math.round(s.runDurationMs ?? 0))} · generated ${s.generatedAt}`, '');
    out.push('| Tests | Passed | Failed | Skipped | Tests with trace | Session clientId |', '| --- | --- | --- | --- | --- | --- |');
    out.push(`| ${s.tests} | ${s.passed} | ${s.failed} | ${s.skipped} | ${s.testsWithTrace} | ${s.clientIds.join(', ') || 'n/a'} |`, '');

    out.push('## Slowest API endpoints (p95)', '', '| Endpoint | Calls | Browser / test | p50 | p95 | Max | Errors | Avg size |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const e of r.endpoints.slice(0, 25)) {
        out.push(`| ${cell(`${e.method} ${e.endpoint}`)} | ${e.calls} | ${e.browser} / ${e.testApi} | ${fmtMs(e.p50)} | ${fmtMs(e.p95)} | ${fmtMs(e.max)} | ${e.errors} | ${fmtBytes(e.avgBytes)} |`);
    }
    out.push('');

    out.push('## Console errors and warnings (by tests affected)', '', '| Level | Message | Source | Tests | Count |', '| --- | --- | --- | --- | --- |');
    for (const c of r.console.slice(0, 30)) out.push(`| ${c.level} | ${cell(c.text.slice(0, 160))} | ${sourceOf(c.text)} | ${c.tests} | ${c.count} |`);
    if (!r.console.length) out.push('| — | none | — | 0 | 0 |');
    out.push('');

    out.push('## Uncaught page errors', '', '| Message | Source | Tests | Count |', '| --- | --- | --- | --- |');
    for (const p of r.pageErrors.slice(0, 20)) out.push(`| ${cell(p.text.slice(0, 160))} | ${sourceOf(p.text)} | ${p.tests} | ${p.count} |`);
    if (!r.pageErrors.length) out.push('| none | — | 0 | 0 |');
    out.push('');

    out.push('## Tests', '', '| Status | Test | Duration | Requests | API p50 / p95 | Failed requests | Console err/warn | First error |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    const order = { failed: 0, timedOut: 0, interrupted: 0, passed: 1, skipped: 2 };
    const first = r.tests.filter((t) => t.retry === 0).sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.file.localeCompare(b.file));
    for (const t of first) {
        const n = t.network ?? {};
        const failedReqs = (n.failed ?? []).reduce((x, f) => x + f.count, 0);
        out.push(
            `| ${t.status} | ${cell(`${t.file} › ${t.title}`.slice(0, 140))} | ${fmtMs(t.durationMs)} | ${n.requests ?? 0} | ` +
                `${t.traced ? `${fmtMs(n.apiP50)} / ${fmtMs(n.apiP95)}` : '—'} | ${failedReqs} | ${(t.console ?? []).reduce((x, c) => x + c.count, 0)} | ${cell(t.error.slice(0, 120))} |`,
        );
    }
    out.push('');
    return out.join('\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
