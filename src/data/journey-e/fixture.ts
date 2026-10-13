import fs from 'node:fs';
import path from 'node:path';
import { JourneyEFixtureSchema, type JourneyE2Fixture } from '../schemas/journeyEFixture';

const FIXTURE = JourneyEFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

/** A function, not a constant: the block is optional in the schema, as journeyD10Fixture() is. */
export function journeyE2Fixture(): JourneyE2Fixture {
    if (!FIXTURE.e2) throw new Error('src/data/journey-e/fixture.json has no "e2" block');
    return FIXTURE.e2;
}
