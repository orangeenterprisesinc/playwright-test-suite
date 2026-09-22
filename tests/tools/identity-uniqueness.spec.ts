/**
 * Every identifier a scenario mints must differ between Playwright attempts.
 *
 * PET Tiger soft-deletes: a "deleted" time card still reserves its Reference
 * (`TimeCard_Reference_Unique`, SQL 2627 — the error that killed B2 in run
 * 35589360814), a deleted user keeps its email, and EmployeeCodeHistory has no
 * DELETE endpoint at all. So cleanup can never guarantee a clean re-run on its own;
 * unique minting is the half that actually does. This asserts it, offline, before
 * anything reaches dev.
 *
 * Plain `@playwright/test`, and a real test rather than a node script: `lineagePrefix`
 * reads `test.info().testId`, and outside a test context it falls back to a clock —
 * which would make every assertion here pass for the wrong reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { buildScenarioEnvelopes, mintRun } from '@utils/journeys/journeyBFlow';

const SCENARIO_DIR = path.join('src', 'data', 'journey-b');

// b15 mints through `uniqueName()` / `makeScanDevice()`, not the lineage helpers, so it
// has no reference space to collide over. Listed rather than skipped by a failed parse,
// so a scenario that stops matching the schema by accident still fails this guard.
const NOT_LINEAGE_MINTED = new Set(['b15-device-sync']);

interface Candidate {
    name: string;
    scenario: unknown;
}

/** One entry per case: a multi-case file is `shared` merged with each case, as the loader does. */
function candidates(): Candidate[] {
    const out: Candidate[] = [];
    for (const file of fs.readdirSync(SCENARIO_DIR)) {
        if (!file.endsWith('.json') || file === 'fixture.json') continue;
        const name = path.basename(file, '.json');
        if (NOT_LINEAGE_MINTED.has(name)) continue;
        const raw = JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, file), 'utf-8')) as {
            shared?: Record<string, unknown>;
            cases?: Record<string, Record<string, unknown>>;
        };
        if (raw.cases) {
            for (const [id, body] of Object.entries(raw.cases)) out.push({ name: `${name} [${id}]`, scenario: { ...raw.shared, ...body } });
        } else {
            out.push({ name, scenario: raw });
        }
    }
    return out;
}

/** Only `retry` is read by `mintRun`; nothing else of TestInfo is touched. */
function asAttempt(retry: number): TestInfo {
    return { retry } as TestInfo;
}

/** Every string this scenario would put on the wire for one attempt. */
function mintedValues(raw: unknown, retry: number): Record<string, string> {
    const scenario = JourneyBScenarioSchema.parse(raw);
    const run = mintRun(scenario, asAttempt(retry));
    const values: Record<string, string> = { prefix: run.prefix, fileName: run.fileName };
    run.codes.forEach((code, i) => (values[`code${String(i)}`] = code));
    for (const device of buildScenarioEnvelopes(run)) {
        device.envelope.recordReferences.forEach((reference, i) => {
            if (reference) values[`${device.id}.reference${String(i)}`] = reference;
        });
    }
    return values;
}

for (const { name, scenario } of candidates()) {
    test(`${name} mints a fresh identity on retry`, () => {
        const first = mintedValues(scenario, 0);
        const second = mintedValues(scenario, 1);

        expect(Object.keys(first).length, `${name}: nothing was minted, so this guard proves nothing`).toBeGreaterThan(0);
        const shared = Object.keys(first).filter((key) => first[key] === second[key]);
        expect(
            shared,
            `${name}: these values repeat across attempts, so a retry collides with the rows attempt 1 left behind ` +
                '(a soft-deleted row keeps its identifier). Fold the attempt in — see lineagePrefix/lineageDigits.',
        ).toEqual([]);
    });
}
