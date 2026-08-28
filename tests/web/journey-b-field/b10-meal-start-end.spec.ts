/**
 * Catalog workflow **B10 — Meal start and end (field)**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B10 |
 * | Plan | `test-plans/journey-b/b10-meal-start-end.md` |
 * | Recording | `docs/media/journey-b/b10-meal-start-end.mp4` |
 * | Jira | `PET-12648` (automation) / `WEBPET-1529` (manual test, read-only source) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B10-001` |
 *
 * Transport, not simulation, happy path only. A meal punch is an ordinary Time
 * In whose Job is the meal job — the master plan's `UnpaidBreakCard` guess is
 * superseded by the recording, which shows both the meal start and its return
 * landing as plain `TimeCard`/`TI` records, never on the `BreakCard` table. The
 * 30-minute minimum is enforced on the device only and blocks there before any
 * record exists, so it is not automatable via XML.
 */
import { expect, test } from '@fixtures/base.fixture';
import { JOURNEY_B_FIXTURE as F, DAY_OFFSET, punchDay } from '@data/journey-b/fixture';
import {
    buildEnvelope,
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

test.describe('B10 · Meal start and end (field)', { tag: ['@JourneyB', '@B10'] }, () => {
    test('[Meal] Deliver a meal start on the meal job and its return on the work job, and verify both punches.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B10-001' },
            { type: 'requirement', description: 'B10-R1|B10-R2|B10-R3|B10-R4|B10-R5|B10-R6|B10-R7' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        const office = await seedOfficeFixture(sessionApi);

        const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        const prefix = newRunPrefix();
        // B10 owns day -3; sharing an employee-day with a sibling under
        // `workers=2` would trip the office's duplicate-Time-In rule.
        const punchDate = punchDay(DAY_OFFSET.B10);
        const employee = F.present[0];
        // Only the meal-return record carries a fix, as the plan specifies.
        const gpsFix = '(36.80767,-119.8348178)';

        // ── Clock-in, meal start (meal job), meal return (work job) ──
        const records: DeviceRecord[] = [
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: employee.code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(7, 15, punchDate),
            },
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: employee.code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.mealJob.code,
                at: punchMoment(12, 0, punchDate),
            },
            {
                node: 'TimeCard',
                part: DEVICE_SCHEMA.referenceParts.timeIn,
                employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                employeeCode: employee.code,
                crewCode: F.crew.code,
                ranchCode: F.ranch.code,
                fieldCode: F.field.code,
                jobCode: F.job.code,
                at: punchMoment(12, 35, punchDate),
                gps: gpsFix,
            },
        ];

        const { xml, references } = buildEnvelope({ deviceAddress, prefix, records });

        expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
        const barcodeSourceTag =
            `<${DEVICE_SCHEMA.tags.employeeSource}>${DEVICE_SCHEMA.employeeSource.barcodeBadge}` +
            `</${DEVICE_SCHEMA.tags.employeeSource}>`;
        expect(xml.split(barcodeSourceTag).length - 1, 'three BarcodeBadge sources').toBe(3);
        const jobTag = (code: string) => `<${DEVICE_SCHEMA.tags.job}>${code}</${DEVICE_SCHEMA.tags.job}>`;
        expect(xml.split(jobTag(F.mealJob.code)).length - 1, 'the meal job appears once').toBe(1);
        expect(xml.split(jobTag(F.job.code)).length - 1, 'the work job appears twice').toBe(2);
        // The recording's finding: nothing reaches the break-card table, so a
        // future refactor that reintroduces it should fail this assertion.
        expect(xml).not.toContain(`<${DEVICE_SCHEMA.nodes.UnpaidBreakCard}${DEVICE_SCHEMA.recordsSuffix}`);
        expect(xml).not.toContain(`<${DEVICE_SCHEMA.nodes.BreakCard}${DEVICE_SCHEMA.recordsSuffix}`);
        for (const reference of references) {
            expect(reference).toContain(`-${DEVICE_SCHEMA.referenceParts.timeIn}-`);
        }
        expect(references).toHaveLength(records.length);
        const gpsCount = xml.split(`<${DEVICE_SCHEMA.tags.gpsReading}>`).length - 1;
        expect(gpsCount, 'only the meal-return record carries a GPS fix').toBe(1);
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

        // ── The office: import, then verify by id (API half — B10-R1/R2/R3/R5) ──
        const employeeId = office.employees.get(employee.code)!.id;
        const { cards } = await deliverAndVerifyCards({
            sessionApi,
            pages,
            testInfo,
            xml,
            label: 'B10',
            crewId: office.crew.id,
            ranchId: office.ranch.id,
            punchDate,
            expected: [
                {
                    employeeCode: employee.code,
                    employeeId,
                    reference: references[0],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                },
                {
                    employeeCode: employee.code,
                    employeeId,
                    reference: references[1],
                    fieldId: office.field.id,
                    jobId: office.mealJob.id,
                },
                {
                    employeeCode: employee.code,
                    employeeId,
                    reference: references[2],
                    fieldId: office.field.id,
                    jobId: office.job.id,
                    ranchName: F.ranch.name,
                    fieldName: F.field.name,
                    jobName: F.job.name,
                    employeeName: employee.name,
                    crewName: F.crew.name,
                    gps: gpsFix,
                },
            ],
        });

        try {
            const clockInCard = cards.find((c) => c.reference === references[0])!;
            const mealStartCard = cards.find((c) => c.reference === references[1])!;
            const mealReturnCard = cards.find((c) => c.reference === references[2])!;

            // B10-R1/R2
            expect(mealStartCard.jobCounter).toBe(office.mealJob.id);
            expect(mealReturnCard.jobCounter).toBe(office.job.id);
            expect(mealReturnCard.timeCardCounter).not.toBe(mealStartCard.timeCardCounter);

            // B10-R3
            for (const card of [clockInCard, mealStartCard, mealReturnCard]) {
                expect(card.employeeCounter).toBe(employeeId);
                expect(card.cardType).toBe(CARD_TYPE.timeIn);
            }

            // B10-R4: a real sync has the device stamp its own seconds, but this
            // envelope controls them exactly, so the stored instant matches what
            // was sent verbatim.
            const sentMealStart = punchMoment(12, 0, punchDate);
            const sentMealReturn = punchMoment(12, 35, punchDate);
            const storedMealStart = new Date(mealStartCard.dateTime!);
            const storedMealReturn = new Date(mealReturnCard.dateTime!);
            expect(storedMealStart.getTime()).toBe(sentMealStart.getTime());
            expect(storedMealReturn.getTime()).toBe(sentMealReturn.getTime());
            expect(storedMealReturn.getTime() - storedMealStart.getTime()).toBe(35 * 60_000);

            // ── B10-R6: Transfer to Job Cards (B1/B2/B3 pattern) ──
            await pages.leftNav.navigate();
            await pages.leftNav.openViaMenu(['Transfer to Job Cards'], '/transfer-to-job-cards');
            const transferPage = pages.transferToJobCards;
            await transferPage.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });

            if (await transferPage.analyzeEnabled()) {
                await transferPage.applyDateRange(punchDate);
                await transferPage.waitForCandidates(cards.length);
                for (const card of cards) {
                    await expect(transferPage.rowFor(card.timeCardCounter)).toHaveText(String(card.reference));
                }

                // The meal-return row's Time In panel — Phase reads the work job,
                // the worker having been returned to it, not to the lunch job.
                await transferPage.openRow(mealReturnCard.timeCardCounter);
                await expect(transferPage.panelRanchValue).toContainText(F.ranch.name);
                await expect(transferPage.panelFieldValue).toHaveValue(F.field.name);
                await expect(transferPage.panelPhaseValue).toHaveValue(F.job.name);
                await expect(transferPage.panelEmployeeValue).toHaveValue(employee.name);
                await expect(transferPage.panelWorkCrewValue).toHaveValue(F.crew.name);
                // Same posture as verifyImportInOffice: absence is annotated, not
                // failed — the card-level GPS assertion above is authoritative.
                if ((await transferPage.panelGpsValue.count()) > 0) {
                    await expect(transferPage.panelGpsValue).toHaveValue(gpsFix);
                } else {
                    testInfo.annotations.push({
                        type: 'gps-not-rendered-in-panel',
                        description:
                            'The Time In panel rendered no GPS Reading field for the meal-return card, ' +
                            'which carries a fix. The value itself was asserted on the card via the API.',
                    });
                }
                await transferPage.cancelPanel();

                // B10-R7: no meal/lunch/break issue group ever appears.
                const groups = await transferPage.issueGroupTexts();
                for (const group of groups) {
                    expect(group).not.toMatch(/meal|lunch|break/i);
                }
            } else {
                testInfo.annotations.push({
                    type: 'transfer-grid-not-asserted',
                    description:
                        'The Transfer to Job Cards grid is populated by POST /transfer-to-job-cards/analyze, ' +
                        'which is disabled on this server (PT_TRANSFER_ANALYZE_ENABLED). The API-level link ' +
                        'assertions above still ran.',
                });
            }

            await testInfo.attach('transfer-to-job-cards-B10.png', {
                body: await transferPage.screenshot(),
                contentType: 'image/png',
            });
        } finally {
            await cleanupCards(sessionApi, cards, testInfo);
        }
    });
});
