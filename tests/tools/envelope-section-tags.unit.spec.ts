/**
 * Offline guard on the element names each device envelope carries inside its sections.
 * The journey flows compare these lists with the file the run sent (and the Import Log row);
 * a change in `buildRow` that alters a section's tags fails here instead of in a dev run.
 *
 * On a mismatch the message prints the ACTUAL lists as one JSON line per scenario, to paste into
 * `expected.envelope.sectionTags`. Runs only under `npm run test:unit`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { punchDay } from '@data/journey-b/fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { JourneyD3CorrectionCaseSchema } from '@data/schemas/journeyDScenario';
import { buildScenarioEnvelopes, mintRun } from '@utils/journeys/journeyBFlow';
import { buildD3Envelope } from '@utils/journeys/journeyDFlow';

const DATA = path.resolve(__dirname, '..', '..', 'src', 'data');
const readJson = (file: string): Record<string, unknown> => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

// Device-sync scenarios (B15) carry no `records`, so they build no envelope.
const bFiles = readdirSync(path.join(DATA, 'journey-b')).filter(
    (f) => /^b\d.*\.json$/.test(f) && 'records' in readJson(path.join(DATA, 'journey-b', f)),
);

test.describe('Device envelope section tags', () => {
    for (const name of bFiles) {
        test(`${name}: built envelope matches expected.envelope.sectionTags`, () => {
            const scenario = JourneyBScenarioSchema.parse(readJson(path.join(DATA, 'journey-b', name)));
            const built = buildScenarioEnvelopes(mintRun(scenario));
            const actual = Object.fromEntries(built.map((b) => [b.id, b.envelope.sectionTags]));
            const wants = scenario.devices
                ? (scenario.expected.devices ?? []).map((d) => ({ id: d.device, tags: d.envelope.sectionTags }))
                : [{ id: built[0].id, tags: scenario.expected.envelope?.sectionTags }];
            const message = `${name} actual sectionTags: ${JSON.stringify(scenario.devices ? actual : actual[built[0].id])}`;
            for (const want of wants) {
                if (!want.tags) continue; // a crew envelope may omit its lists
                expect(actual[want.id], message).toEqual(want.tags);
            }
        });
    }

    test('d03: the seed envelope matches expected.envelope.sectionTags', () => {
        const name = 'd03-add-missing-time-in-and-correct-time-card.json';
        const scenario = JourneyD3CorrectionCaseSchema.parse(readJson(path.join(DATA, 'journey-d', name)));
        const envelope = buildD3Envelope(scenario, { employeeCode: '8019', crewCode: '5001' }, { prefix: 'ABCD', punchDate: punchDay(scenario.dayOffset) });
        expect(envelope.sectionTags, `${name} actual sectionTags: ${JSON.stringify(envelope.sectionTags)}`).toEqual(scenario.expected.envelope.sectionTags);
    });
});
