import path from 'node:path';

/**
 * Deterministic Journey B device fixture — no random data. Codes follow the
 * catalog barcode rule (≥4 digits, no leading zero, unique). Setup records
 * cross-reference **by Name** (Employee_Records.CREW = the crew's Name; the
 * record screens store the displayed name) — never link by code.
 *
 * B2 (crew move) needs a destination, hence the second ranch/field/job. With
 * more than one record per type the Crew In screen no longer auto-fills, so
 * specs pick values explicitly.
 *
 * These same names are seeded on dev staging by the specs' arrange phase so the
 * web-pet importer (which resolves FKs by Name, nullable) links the imported
 * rows instead of silently importing NULL counters.
 */
export const DEVICE_FIXTURE = {
    ranch: { code: '4001', name: 'B1 RANCH' },
    field: { code: '4101', name: 'B1 FIELD' },
    job: { code: '4201', name: 'B1 HARVEST', paymentType: 'Time' },
    // B2 destinations
    field2: { code: '4102', name: 'B2 FIELD EAST' },
    job2: { code: '4202', name: 'B2 PRUNING', paymentType: 'Time' },
    crew: { code: '5001', name: 'B1 CREW' },
    // Roster order matters: the Employee Selection dialog lists members in
    // Employee_Records insert order, and the specs assert that order.
    present: [
        { code: '6001', name: 'B1 PRESENT ONE' },
        { code: '6002', name: 'B1 PRESENT TWO' },
        { code: '6003', name: 'B1 PRESENT THREE' },
    ],
    absentee: { code: '6004', name: 'B1 ABSENTEE FOUR' },
} as const;

export const DEVICE_DATA_DIR = path.join(__dirname);
export const PREFS_FIXTURE = path.join(DEVICE_DATA_DIR, 'pet-prefs.xml');
export const SCHEMA_EMPTY_DB = path.join(DEVICE_DATA_DIR, 'schema-empty.db');
export const GOLDEN_DB = path.join(DEVICE_DATA_DIR, 'golden-petdb.db');
export const APK_PATH = path.join(__dirname, '..', '..', '..', 'apps-device', 'petpocket-debug.apk');
