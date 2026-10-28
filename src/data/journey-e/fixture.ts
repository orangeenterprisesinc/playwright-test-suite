import fs from 'node:fs';
import path from 'node:path';
import { JourneyEFixtureSchema, type JourneyE11Fixture, type JourneyE2Fixture, type JourneyE6Fixture } from '../schemas/journeyEFixture';

const FIXTURE = JourneyEFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

/** A function, not a constant: the block is optional in the schema, as journeyD10Fixture() is. */
export function journeyE2Fixture(): JourneyE2Fixture {
    if (!FIXTURE.e2) throw new Error('src/data/journey-e/fixture.json has no "e2" block');
    return FIXTURE.e2;
}

export function journeyE11Fixture(): JourneyE11Fixture {
    if (!FIXTURE.e11) throw new Error('src/data/journey-e/fixture.json has no "e11" block');
    return FIXTURE.e11;
}

export function journeyE13Fixture(): NonNullable<typeof FIXTURE.e13> {
    if (!FIXTURE.e13) throw new Error('src/data/journey-e/fixture.json has no "e13" block');
    return FIXTURE.e13;
}

export function journeyE6Fixture(): JourneyE6Fixture {
    if (!FIXTURE.e6) throw new Error('src/data/journey-e/fixture.json has no "e6" block');
    return FIXTURE.e6;
}

export function journeyE3Fixture(): NonNullable<typeof FIXTURE.e3> {
    if (!FIXTURE.e3) throw new Error('src/data/journey-e/fixture.json has no "e3" block');
    return FIXTURE.e3;
}

export function journeyE1Fixture(): NonNullable<typeof FIXTURE.e1> {
    if (!FIXTURE.e1) throw new Error('src/data/journey-e/fixture.json has no "e1" block');
    return FIXTURE.e1;
}

export function journeyE5Fixture(): NonNullable<typeof FIXTURE.e5> {
    if (!FIXTURE.e5) throw new Error('src/data/journey-e/fixture.json has no "e5" block');
    return FIXTURE.e5;
}

export function journeyE9Fixture(): NonNullable<typeof FIXTURE.e9> {
    if (!FIXTURE.e9) throw new Error('src/data/journey-e/fixture.json has no "e9" block');
    return FIXTURE.e9;
}

export function journeyE10Fixture(): NonNullable<typeof FIXTURE.e10> {
    if (!FIXTURE.e10) throw new Error('src/data/journey-e/fixture.json has no "e10" block');
    return FIXTURE.e10;
}
