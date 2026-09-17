import fs from 'node:fs';
import path from 'node:path';
import { JourneyBFixtureSchema } from '../schemas/journeyBFixture';

// Typed accessor over fixture.json: the values live in the JSON, this module validates
// them once per process and keeps the import surface every consumer already has.
const FIXTURE = JourneyBFixtureSchema.parse(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json'), 'utf8')) as unknown,
);

export const JOURNEY_B_FIXTURE = FIXTURE.entities;
export const B12_QUESTIONS = FIXTURE.b12.questions;
export const B12_SIGNATURE_PNG = FIXTURE.b12.signaturePng;
export const B4_PACK_HOUSE_ROLL = FIXTURE.b4.packHouseRoll;

// Transitional: the specs not yet on a scenario file (b02, b04-b07, b10-b12) still read
// their fixture day here. A converted spec carries `dayOffset` in its JSON instead, and
// scenarioLoader asserts those stay pairwise distinct. Values must equal the JSON ones
// (B1 0, B3 -2 today). Removed with 4d.
export const DAY_OFFSET = {
    B1: 0,
    B2: -1,
    B3: -2,
    B10: -3,
    B11: -4,
    B12: -5,
    B6: -6,
    B5: -7,
    B4: -8,
    B7: -9,
} as const;

/** `base` shifted by `offset` days (negative moves the punch into the past). */
export function punchDay(offset: number, base = new Date()): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return d;
}
