/**
 * Catalog workflow **B11 — Crew-out to individual time-outs**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B11 |
 * | Plan | `test-plans/journey-b/b11-crew-out.md` |
 * | Recording | `docs/media/journey-b/b11-crew-out.mp4` |
 * | Jira | `PET-12649` (automation) / `WEBPET-1530` (manual test, read-only source) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B11-001` |
 *
 * Transport, not simulation, happy path only. One crew-out fans out, device-side,
 * into one `TimeOut` record per still-active crew member — the importer never
 * mints a `CO` reference itself, so the envelope supplies it explicitly, exactly
 * as B1's `CI` does. A time-out row (crew-out or individual) carries no Job,
 * Ranch or Field: the device's `LookupContents` for it is `Employee:Code|Crew:Code`
 * only. The early leaver already timed out individually (`TO`, `BarcodeBadge`)
 * before the crew-out, and stays untouched by it. No new page object — the
 * office UI this exercises is the relay pull `deliverAndVerifyCards` already
 * drives, and the one datum unique to `View ▸ Time Cards` (Employee Selection)
 * is asserted on the API as `employeeSource`.
 */
import { expect, test } from '@fixtures/base.fixture';
import { JOURNEY_B_FIXTURE as F, DAY_OFFSET, punchDay } from '@data/journey-b/fixture';
import {
    buildEnvelope,
    deviceIso,
    DEVICE_SCHEMA,
    exportFileName,
    newRunPrefix,
    punchMoment,
    type DeviceRecord,
} from '@utils/relay/exportEnvelope';
import { sendToRelay } from '@utils/relay/relayClient';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { deliverAndVerifyCards, cleanupCards } from '@utils/api/officeVerification';
import { CARD_TYPE } from '@utils/api/timeCardsApi';

test.describe('B11 · Crew-out to individual time-outs', { tag: ['@JourneyB', '@B11'] }, () => {
    test('[Crew Out] Record one crew-out for the crew and verify an individual time-out per still-active member, leaving the early leaver untouched.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B11-001' },
            { type: 'requirement', description: 'B11-R4|B11-R5|B11-R6|B11-R7|B11-R8|B11-R9' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        const office = await seedOfficeFixture(sessionApi);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        const punchDate = punchDay(DAY_OFFSET.B11);
        const gpsFix = '(36.8076576,-119.8347626)';

        const employeeId1 = office.employees.get(F.present[0].code)!.id;
        const employeeId2 = office.employees.get(F.present[1].code)!.id;
        const employeeId3 = office.employees.get(F.present[2].code)!.id;

        // ── One envelope, six records: the morning crew-in, the early leaver's
        // individual time-out, then the crew-out fanned out into two rows ──
        const records: DeviceRecord[] = [
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.crewIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.crew,
                employeeCode: F.present[0].code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(7, 15, punchDate),
            },
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.crewIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.crew,
                employeeCode: F.present[1].code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(7, 15, punchDate),
            },
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.crewIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.crew,
                employeeCode: F.present[2].code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(7, 15, punchDate),
            },
            // The early leaver's individual time-out — crew only, no work context.
            {
                node: 'TimeOut',
                part: DEVICE_SCHEMA.referenceParts.timeOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: F.present[2].code,
                crewCode: F.crew.code,
                at: punchMoment(15, 9, punchDate),
                gps: gpsFix,
            },
            // The crew-out, fanned out into one row per still-active member —
            // both at the same instant, both crew only.
            {
                node: 'TimeOut',
                part: DEVICE_SCHEMA.referenceParts.crewOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.crew,
                employeeCode: F.present[0].code,
                crewCode: F.crew.code,
                at: punchMoment(15, 10, punchDate),
                gps: gpsFix,
            },
            {
                node: 'TimeOut',
                part: DEVICE_SCHEMA.referenceParts.crewOut,
                employeeSource: DEVICE_SCHEMA.employeeSource.crew,
                employeeCode: F.present[1].code,
                crewCode: F.crew.code,
                at: punchMoment(15, 10, punchDate),
                gps: gpsFix,
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix, records });

        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeOut}${DEVICE_SCHEMA.recordsSuffix}`);
        expect(references).toHaveLength(6);
        expect(
            references.filter((r) => r.includes(`-${DEVICE_SCHEMA.referenceParts.crewOut}-`)),
            'two crew-out references',
        ).toHaveLength(2);
        expect(
            references.filter((r) => r.includes(`-${DEVICE_SCHEMA.referenceParts.timeOut}-`)),
            'one individual time-out reference',
        ).toHaveLength(1);
        expect(
            references.filter((r) => r.includes(`-${DEVICE_SCHEMA.referenceParts.crewIn}-`)),
            'three crew-in references',
        ).toHaveLength(3);

        // ── Sample fidelity: no work-context element on any time-out row ──
        const timeOutRecordsTag = `${DEVICE_SCHEMA.nodes.TimeOut}${DEVICE_SCHEMA.recordsSuffix}`;
        const timeOutSection =
            xml.match(new RegExp(`<${timeOutRecordsTag}[\\s\\S]*?</${timeOutRecordsTag}>`))?.[0] ?? '';
        expect(timeOutSection).not.toContain(`<${DEVICE_SCHEMA.tags.job}>`);
        expect(timeOutSection).not.toContain(`<${DEVICE_SCHEMA.tags.ranch}>`);
        expect(timeOutSection).not.toContain(`<${DEVICE_SCHEMA.tags.field}>`);
        await testInfo.attach('device-export.xml', { body: xml, contentType: 'application/xml' });

        // ── Delivery: the same POST /UploadFile the app makes ──
        const fileName = exportFileName(prefix);
        const sent = await sendToRelay({
            url: process.env.DEVICE_RELAY_URL ?? '',
            from: deviceAddress,
            to: process.env.DEVICE_RELAY_SERVER ?? '',
            xml,
            fileName,
        });
        await testInfo.attach('relay-send.txt', {
            body: `file: ${fileName}\nsuccess: ${sent.success}\nstatus: ${sent.status}\n${sent.body}`,
            contentType: 'text/plain',
        });
        expect(sent.success, `relay rejected the export: ${sent.body}`).toBe(true);

        // ── The office: import, then verify every card links by id ──
        const { cards } = await deliverAndVerifyCards({
            sessionApi,
            pages,
            testInfo,
            xml,
            label: 'B11',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            punchDate,
            cardType: null, // the envelope mixes cardType 1 (crew-in) and 0 (time-out)
            absentEmployeeIds: [office.employees.get(F.absentee.code)!.id],
            expected: [
                {
                    employeeCode: F.present[0].code,
                    employeeId: employeeId1,
                    reference: references[0],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                },
                {
                    employeeCode: F.present[1].code,
                    employeeId: employeeId2,
                    reference: references[1],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                },
                {
                    employeeCode: F.present[2].code,
                    employeeId: employeeId3,
                    reference: references[2],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                },
                // The three time-outs omit fieldId/jobId — the helper skips the
                // work-context asserts for them; B11-R6 asserts the nulls below.
                { employeeCode: F.present[2].code, employeeId: employeeId3, reference: references[3] },
                { employeeCode: F.present[0].code, employeeId: employeeId1, reference: references[4] },
                { employeeCode: F.present[1].code, employeeId: employeeId2, reference: references[5] },
            ],
        });

        try {
            const byReference = new Map(cards.map((c) => [String(c.reference ?? ''), c]));
            const toCard = byReference.get(references[3])!;
            const coCard1 = byReference.get(references[4])!;
            const coCard2 = byReference.get(references[5])!;

            // ── B11-R4 ──
            expect(coCard1.cardType).toBe(CARD_TYPE.timeOut);
            expect(coCard2.cardType).toBe(CARD_TYPE.timeOut);
            expect(coCard1.employeeCounter).toBe(employeeId1);
            expect(coCard2.employeeCounter).toBe(employeeId2);
            expect(coCard1.crewCounter).toBe(office.crew.id);
            expect(coCard2.crewCounter).toBe(office.crew.id);
            expect(coCard1.programCreated).toBe(true);
            expect(coCard2.programCreated).toBe(true);

            // ── B11-R5 ──
            expect(String(coCard1.reference)).toContain(`-${DEVICE_SCHEMA.referenceParts.crewOut}-`);
            expect(String(coCard2.reference)).toContain(`-${DEVICE_SCHEMA.referenceParts.crewOut}-`);

            // ── B11-R6 — assert the nulls explicitly; the helper only skipped them ──
            for (const card of [toCard, coCard1, coCard2]) {
                expect(card.jobCounter).toBeNull();
                expect(card.ranchCounter).toBeNull();
                expect(card.fieldCounter).toBeNull();
            }

            // ── B11-R7 ──
            expect(String(toCard.reference)).toContain(`-${DEVICE_SCHEMA.referenceParts.timeOut}-`);
            expect(toCard.dateTime).toBe(deviceIso(punchMoment(15, 9, punchDate)));
            expect(new Date(toCard.dateTime!).getTime()).toBeLessThan(new Date(coCard1.dateTime!).getTime());
            expect(new Date(toCard.dateTime!).getTime()).toBeLessThan(new Date(coCard2.dateTime!).getTime());

            // ── B11-R8 ──
            const crewOutMoment = deviceIso(punchMoment(15, 10, punchDate));
            expect(coCard1.dateTime).toBe(crewOutMoment);
            expect(coCard2.dateTime).toBe(crewOutMoment);

            // ── B11-R9 — employeeSource is on the API response but not on the
            // named OfficeTimeCard fields, so read it through the index signature.
            // Residual risk (Planner-flagged): value 2 (BarcodeBadge) has no live
            // precedent on dev — report, don't delete, if only this assert fails.
            expect(Number(coCard1.employeeSource)).toBe(13);
            expect(Number(coCard2.employeeSource)).toBe(13);
            expect(Number(toCard.employeeSource)).toBe(2);
        } finally {
            await cleanupCards(sessionApi, cards, testInfo);
        }
    });
});
