/**
 * Build src/data/device/golden-petdb.db — the deterministic seed database for the
 * Journey B device specs — from a schema-complete empty petdb.db.
 *
 * The schema source (schema-empty.db) is pulled from a running emulator on first
 * use: the app creates the full schema on its first launch. Fixture rows are then
 * inserted locally with better-sqlite3 — no relay, no manual XML import.
 *
 * Cross-references between setup tables are by NAME, not code: the record screens
 * store the picker's display value and the roster query filters
 * Employee_Records.CREW by exactly that value
 * (DBRecordsLayer.getEmployeesByHomeCrew → getAll(EMPLOYEE, CREW, <crew name>)).
 *
 * Run: npx tsx scripts/device/make-golden-db.ts   (emulator running, app installed)
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { pullDb } from '../../src/utils/device/deviceSeed';
import {
    DEVICE_FIXTURE as F,
    DEVICE_DATA_DIR,
    GOLDEN_DB,
    SCHEMA_EMPTY_DB,
} from '../../src/data/device/petPocketFixture';

mkdirSync(DEVICE_DATA_DIR, { recursive: true });

if (!existsSync(SCHEMA_EMPTY_DB)) {
    console.log('No cached schema DB — pulling petdb.db from the running emulator...');
    pullDb(SCHEMA_EMPTY_DB);
}

copyFileSync(SCHEMA_EMPTY_DB, GOLDEN_DB);
const db = new Database(GOLDEN_DB);

for (const t of [
    'Ranch_Records',
    'Field_Records',
    'Job_Records',
    'Crew_Records',
    'Employee_Records',
    'TimeCard_Records',
    'CrewIn_Records',
]) {
    try {
        db.prepare(`DELETE FROM ${t}`).run();
    } catch {
        console.warn(`table missing, skipped: ${t}`);
    }
}

db.prepare('INSERT INTO Ranch_Records (Code, Name) VALUES (?, ?)').run(F.ranch.code, F.ranch.name);

const insertField = db.prepare('INSERT INTO Field_Records (Code, Name, Ranch) VALUES (?, ?, ?)');
insertField.run(F.field.code, F.field.name, F.ranch.name);
// B2's destination field — a second record also stops the screen auto-filling,
// which is what makes the "move" explicit.
insertField.run(F.field2.code, F.field2.name, F.ranch.name);

const insertJob = db.prepare('INSERT INTO Job_Records (Code, Name, PaymentType) VALUES (?, ?, ?)');
insertJob.run(F.job.code, F.job.name, F.job.paymentType);
insertJob.run(F.job2.code, F.job2.name, F.job2.paymentType);

db.prepare('INSERT INTO Crew_Records (Code, Name) VALUES (?, ?)').run(F.crew.code, F.crew.name);

const insertEmployee = db.prepare(
    'INSERT INTO Employee_Records (Code, Name, Crew, WorkCrew) VALUES (?, ?, ?, ?)',
);
for (const e of [...F.present, F.absentee]) {
    insertEmployee.run(e.code, e.name, F.crew.name, F.crew.name);
}

db.close();
console.log(`Golden DB written: ${GOLDEN_DB}`);
