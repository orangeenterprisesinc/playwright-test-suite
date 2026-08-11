/**
 * Catalog workflow **B2 — Crew move and job change**: mid-day, the supervisor
 * moves the crew to a new field and job in one action, leaving behind anyone who
 * did not move.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → B2 |
 * | Plan | `test-plans/journey-b/b02-crew-move-and-job-change.md` |
 * | Recording | `docs/media/Journey B2 Crew Move and Job Change.mp4` |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B2-001` |
 *
 * There is **no crew-move screen on the device** — verified: no `CrewMove`
 * anywhere in AndroidPET. B2 is the Crew In screen driven a second time against a
 * new field/job (its `updateJobInEmployeeRecord` carries the field/job-change
 * cases), so this spec reuses `PetPocketCrewInPage`.
 *
 * **What a move does on the device — verified, and not what you would guess:** it
 * does not add a second punch and it does not write a time-out. Each mover's
 * existing Time In is **updated in place** to the new field and job — same row,
 * same reference — while anyone unchecked keeps their original record untouched.
 * The spec asserts exactly that, including the row count, because an extra Time In
 * per mover would be a double punch (and eventually double pay).
 *
 * Closing the previous *period* is office-side work (web-pet's own
 * `/time-cards/crew-move` composes an explicit time-out + time-in pair, and the D4
 * transfer builds periods from points in time), so it is not asserted here.
 */
import { expect, test } from '@fixtures/device.fixture';
import { DEVICE_FIXTURE as F } from '@data/device/petPocketFixture';
import { openDb, rows } from '@utils/device/deviceDb';
import { pullDb } from '@utils/device/deviceSeed';
import { attachAndAssertSendResult, clearExportLog, waitForExportedXml } from '@utils/device/exportCapture';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { verifyImportInOffice } from '@utils/api/officeVerification';
import path from 'node:path';

interface DeviceTimeCard {
    _id: number;
    Employee: string;
    Crew: string;
    Field: string;
    Job: string;
    Reference: string;
}

const SELECT_CARDS = 'SELECT * FROM TimeCard_Records ORDER BY _id';

/** Employee → its single time card, failing loudly on an unexpected duplicate. */
function cardsByEmployee(cards: DeviceTimeCard[]): Map<string, DeviceTimeCard> {
    const byEmployee = new Map<string, DeviceTimeCard>();
    for (const card of cards) {
        if (byEmployee.has(card.Employee)) {
            throw new Error(`Duplicate time card for ${card.Employee} — a move must not add a punch`);
        }
        byEmployee.set(card.Employee, card);
    }
    return byEmployee;
}

test.describe('B2 · Crew move and job change', { tag: ['@JourneyB', '@B2'] }, () => {
    test('[Crew Move] Move the crew to a new field and job, leaving one member behind.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B2-001' },
            { type: 'requirement', description: 'B2-R1|B2-R2|B2-R3|B2-R5|B2-R6|B2-R7' },
        ],
    }, async ({ device, sessionApi, pages }, testInfo) => {
        // The office needs the same records under the same codes, or the import
        // links nothing (its FKs are nullable) — see officeFixture.
        const office = await seedOfficeFixture(sessionApi);

        await device.prepare();
        await device.mainMenu.waitUntilShown();

        // ── First capture: the whole crew starts in the original field/job ──
        await device.mainMenu.openCrewTimeIn();
        await device.crewIn.waitUntilShown();
        await device.crewIn.selectFieldByBarcode(F.field.code, F.field.name);
        await device.crewIn.selectJobByBarcode(F.job.code, F.job.name);
        await device.crewIn.openRoster();
        await device.crewIn.confirmRoster(); // everyone in, absentee included
        await device.shot('initial crew time in');

        // Snapshot the punches so the move can be proven to update them in place.
        const beforeDb = openDb(pullDb(path.join(testInfo.outputDir, 'petdb-before-move.db')));
        let before: Map<string, DeviceTimeCard>;
        try {
            before = cardsByEmployee(rows<DeviceTimeCard>(beforeDb, SELECT_CARDS));
        } finally {
            beforeDb.close();
        }
        expect([...before.keys()].sort()).toEqual(
            [...F.present, F.absentee].map((e) => e.name).sort(),
        );
        for (const card of before.values()) {
            expect(card.Field).toBe(F.field.name);
            expect(card.Job).toBe(F.job.name);
        }

        // ── The move: same screen, new field and job, one member left behind ──
        await device.crewIn.selectFieldByBarcode(F.field2.code, F.field2.name);
        await device.crewIn.selectJobByBarcode(F.job2.code, F.job2.name);
        await device.shot('destination selected');

        await device.crewIn.openRoster();
        await device.crewIn.uncheck(F.absentee.name); // did not move
        await device.shot('mover roster');
        await device.crewIn.confirmRoster();
        await device.shot('after move');

        // ── Assert on the device ──
        const db = openDb(pullDb(path.join(testInfo.outputDir, 'petdb-after-b2.db')));
        try {
            const cards = rows<DeviceTimeCard>(db, SELECT_CARDS);

            // Still exactly one punch per crew member: a move reassigns, never adds.
            expect(cards).toHaveLength(before.size);
            const after = cardsByEmployee(cards);

            // Each mover's own record now carries the destination field and job.
            for (const mover of F.present) {
                const now = after.get(mover.name)!;
                const then = before.get(mover.name)!;
                expect(now.Field).toBe(F.field2.name);
                expect(now.Job).toBe(F.job2.name);
                expect(now.Crew).toBe(F.crew.name);
                // Same row, same reference — updated in place, not re-punched.
                expect(now._id).toBe(then._id);
                expect(now.Reference).toBe(then.Reference);
            }

            // The member left behind is untouched.
            const stayed = after.get(F.absentee.name)!;
            expect(stayed.Field).toBe(F.field.name);
            expect(stayed.Job).toBe(F.job.name);
            expect(stayed.Reference).toBe(before.get(F.absentee.name)!.Reference);
        } finally {
            db.close();
        }

        // ── Export: one export, after the move ────────────────────────────────
        // The app only exports records it has not sent, and a move rewrites the
        // existing rows rather than adding any — so a single export here carries the
        // four cards in their final state (movers in the destination, one left behind).
        await device.crewIn.backToMainMenu();
        await device.mainMenu.waitUntilShown();
        clearExportLog();
        const exportMessage = await device.mainMenu.exportRecords();
        const xml = await waitForExportedXml();
        await device.shot('after export');

        await attachAndAssertSendResult(testInfo, 'B2', exportMessage);

        expect(xml).toContain(`<Field>${F.field2.code}</Field>`);
        expect(xml).toContain(`<Job>${F.job2.code}</Job>`);
        await testInfo.attach('device-export.xml', { body: xml, contentType: 'application/xml' });

        // ── The office: the movers arrive in the destination, the other does not ──
        await verifyImportInOffice({
            sessionApi,
            transferPage: pages.transferToJobCards,
            testInfo,
            xml,
            label: 'B2',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            expected: [
                ...F.present.map((e) => ({
                    employeeCode: e.code,
                    employeeId: office.employees.get(e.code)!.id,
                    fieldId: office.field2.id,
                    jobId: office.job2.id,
                })),
                {
                    employeeCode: F.absentee.code,
                    employeeId: office.employees.get(F.absentee.code)!.id,
                    fieldId: office.field.id,
                    jobId: office.job.id,
                },
            ],
        });
    });
});
