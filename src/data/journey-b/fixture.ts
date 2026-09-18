import fs from 'node:fs';
import path from 'node:path';
import { JourneyBFixtureSchema } from '../schemas/journeyBFixture';

// Typed accessor over fixture.json: the values live in the JSON, this module validates
// them once per process and keeps the import surface every consumer already has.
const FIXTURE = JourneyBFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

export const JOURNEY_B_FIXTURE = FIXTURE.entities;
export const B4_PACK_HOUSE_ROLL = FIXTURE.b4.packHouseRoll;

/** `base` shifted by `offset` days (negative moves the punch into the past). */
export function punchDay(offset: number, base = new Date()): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return d;
}
