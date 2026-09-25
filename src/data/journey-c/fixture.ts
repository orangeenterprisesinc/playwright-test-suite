import fs from 'node:fs';
import path from 'node:path';
import { JourneyCFixtureSchema } from '../schemas/journeyCFixture';

// Typed accessor over fixture.json, validated once per process — same shape as journey-b/fixture.ts.
const FIXTURE = JourneyCFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

export const JOURNEY_C_FIXTURE = FIXTURE.entities;
