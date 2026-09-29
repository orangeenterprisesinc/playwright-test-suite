import fs from 'node:fs';
import path from 'node:path';
import { JourneyDFixtureSchema } from '../schemas/journeyDFixture';

// Typed accessor over fixture.json, validated once per process — same shape as journey-c/fixture.ts.
const FIXTURE = JourneyDFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

export const JOURNEY_D_FIXTURE = FIXTURE.entities;
