import fs from 'node:fs';
import path from 'node:path';
import type { TestInfo } from '@playwright/test';
import type { z } from 'zod';
import { JsonDataReader } from '../../data/readers/JsonDataReader';

// One JSON scenario file per spec file, same basename:
//   tests/web/journey-b-field/b03-x.spec.ts → src/data/journey-b/b03-x.json
//   tests/web/system/login-module.spec.ts   → src/data/system/login-module.json
// SCENARIO_DATA_DIR overrides the root, as RUNNER_DATA_DIR does for runner rows.
// A file is either one scenario object, or `{ shared?, cases: { '<testCaseId>': … } }`.
// Do not use a root `data` array key — JsonDataReader unwraps it.
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_ROOT = path.join(PROJECT_ROOT, process.env.SCENARIO_DATA_DIR || 'src/data');
const FIXTURE_FILE = 'fixture.json';

type MultiCaseFile = { shared?: Record<string, unknown>; cases: Record<string, Record<string, unknown>> };

export function scenarioFileFor(specFile: string): string {
    const folder = path.basename(path.dirname(specFile));
    const journey = folder === 'system' ? 'system' : /^(journey-[a-f])(?:-|$)/.exec(folder)?.[1];
    if (!journey) throw new Error(`scenarioLoader: '${folder}' is not a journey-<x>-<area> or system folder (${specFile})`);
    return path.join(DATA_ROOT, journey, `${path.basename(specFile).replace(/\.spec\.ts$/, '')}.json`);
}

function isMultiCase(raw: unknown): raw is MultiCaseFile {
    return typeof raw === 'object' && raw !== null && typeof (raw as { cases?: unknown }).cases === 'object';
}

/** The case a multi-case file holds for this test (`shared` under the case's own keys); a single-case file as is. */
export function caseOf(raw: unknown, testInfo: TestInfo, file: string): unknown {
    if (!isMultiCase(raw)) return raw;
    const id = testInfo.annotations.find((a) => a.type === 'testCaseId')?.description;
    if (!id) throw new Error(`${rel(file)}: multi-case scenario file, but '${testInfo.title}' has no testCaseId annotation`);
    const picked = raw.cases[id];
    if (!picked) throw new Error(`${rel(file)}: no case '${id}' (has: ${Object.keys(raw.cases).join(', ')})`);
    return { ...(raw.shared ?? {}), ...picked };
}

export async function loadScenario<S extends z.ZodTypeAny>(schema: S, testInfo: TestInfo): Promise<z.output<S>> {
    const file = scenarioFileFor(testInfo.file);
    const reader = new JsonDataReader(file);
    if (!(await reader.isAvailable())) {
        throw new Error(`scenario file missing: ${rel(file)} (one per spec, next to ${rel(testInfo.file)})`);
    }
    // A root object comes back as a one-element array (recipients.ts:99 precedent).
    const [raw] = await reader.readAll<unknown>();
    const result = schema.safeParse(caseOf(raw, testInfo, file));
    if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
        throw new Error(`${rel(file)} failed validation — ${issues}`);
    }
    if (path.basename(path.dirname(file)) === 'journey-b') await assertDistinctDayOffsets(path.dirname(file));
    return result.data as z.output<S>;
}

function rel(file: string): string {
    return path.relative(PROJECT_ROOT, file).split(path.sep).join('/');
}

/** Every `{name}` in every string of `value` replaced from `tokens`; unknown tokens are left as written. */
export function substituteTokens<T>(value: T, tokens: Record<string, string>): T {
    if (typeof value === 'string') {
        return value.replace(/\{(\w+)\}/g, (whole, key: string) => tokens[key] ?? whole) as unknown as T;
    }
    if (Array.isArray(value)) return value.map((v) => substituteTokens(v, tokens)) as unknown as T;
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, substituteTokens(v, tokens)]),
        ) as T;
    }
    return value;
}

// The fixture-day guard fixture.ts's DAY_OFFSET table used to give: two Journey B scenario
// files sharing a dayOffset would collide on the office's duplicate-Time-In rule under
// workers=2. Checked once per worker process; a rejected check stays rejected.
let dayOffsetCheck: Promise<void> | undefined;
function assertDistinctDayOffsets(dir: string): Promise<void> {
    return (dayOffsetCheck ??= (async () => {
        const byOffset = new Map<number, string[]>();
        for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== FIXTURE_FILE)) {
            const raw = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as Record<string, unknown> & Partial<MultiCaseFile>;
            const offsets = new Set<number>();
            const collect = (o: unknown) => {
                if (typeof o === 'number') offsets.add(o);
            };
            collect(raw.dayOffset);
            collect(raw.shared?.dayOffset);
            for (const c of Object.values(raw.cases ?? {})) collect(c.dayOffset);
            for (const o of offsets) byOffset.set(o, [...(byOffset.get(o) ?? []), name]);
        }
        const clashes = [...byOffset].filter(([, files]) => files.length > 1);
        if (clashes.length) {
            throw new Error(
                `Journey B dayOffset shared across scenario files (one fixture day per workflow, workers=2): ` +
                    clashes.map(([o, f]) => `${o} → ${f.join(', ')}`).join('; '),
            );
        }
    })());
}
