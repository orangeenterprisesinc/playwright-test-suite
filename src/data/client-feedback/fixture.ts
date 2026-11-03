import fs from 'node:fs';
import path from 'node:path';
import { ClientFeedbackFixtureSchema, type CfCrewKey } from '../schemas/clientFeedbackFixture';

// Typed accessor over fixture.json, validated once per process — same shape as journey-d/fixture.ts.
const FIXTURE = ClientFeedbackFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

export const CF_FIXTURE = FIXTURE;

export function cfCrew(key: CfCrewKey) {
    return FIXTURE.crews[key];
}
