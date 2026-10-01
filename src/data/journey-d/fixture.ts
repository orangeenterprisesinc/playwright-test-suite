import fs from 'node:fs';
import path from 'node:path';
import { JourneyDFixtureSchema, type JourneyD9Fixture } from '../schemas/journeyDFixture';

// Typed accessor over fixture.json, validated once per process — same shape as journey-c/fixture.ts.
const FIXTURE = JourneyDFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

export const JOURNEY_D_FIXTURE = FIXTURE.entities;

/** A function, not a constant: the block is optional in the schema so D6 never depends on it. */
export function journeyD9Fixture(): JourneyD9Fixture {
    if (!FIXTURE.d9) throw new Error('src/data/journey-d/fixture.json has no "d9" block');
    return FIXTURE.d9;
}
