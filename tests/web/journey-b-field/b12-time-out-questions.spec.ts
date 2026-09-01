/**
 * Catalog workflow **B12 — Time-out questions to notification**.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → B12 |
 * | Plan | `test-plans/journey-b/b12-time-out-questions.md` |
 * | Recording | `docs/media/journey-b/b12-time-out-questions.mp4` |
 * | Jira | `PET-12650` (automation) / `WEBPET-1531` (manual test, read-only source) |
 * | Runner rows | `src/data/runner/journey-b.csv` → `B12-001` |
 *
 * Transport, not simulation, happy path only. Three workers clock out with a
 * clock-out question sheet and a signature: Raquel answers all three questions
 * outside the expected response, Miguel answers all three as expected, Sergio
 * flips only the lunch answer — the recording's own pattern. Answers ride as
 * `TimeCardQuestion` grid rows addressed to their parent Time Out by
 * `<Reference>` — a grid row mints no reference of its own and consumes no
 * sequence number.
 *
 * Proven: the answers import against the right card, joined by the parent's
 * `<Reference>`, with the unexpected values stored verbatim (R3–R6), and the
 * crew's notification user resolves to a real Users record with an email (R8).
 * NOT proven — each named as a gate, never silently skipped: the clock-out
 * answer flag detector never runs on the import path and the notification email
 * has no observable channel (both halves of R10), and the importer leaves the
 * Signature column unbound by design (R9) — so the signature is asserted on the
 * envelope only. No standalone `SignatureCard` row either: Amy's signature rides
 * on the Time Out card itself, which is why R7 is out of scope (see the plan).
 */
import { expect, test } from '@fixtures/base.fixture';
import { JOURNEY_B_FIXTURE as F, DAY_OFFSET, punchDay, B12_QUESTIONS, B12_SIGNATURE_PNG } from '@data/journey-b/fixture';
import {
    buildEnvelope,
    buildReference,
    DEVICE_SCHEMA,
    exportFileName,
    newRunPrefix,
    punchMoment,
    type DeviceRecord,
} from '@utils/relay/exportEnvelope';
import { sendToRelay } from '@utils/relay/relayClient';
import { seedOfficeFixture } from '@utils/api/officeFixture';
import { deliverAndVerifyCards, cleanupCards } from '@utils/api/officeVerification';
import { CARD_TYPE, getTimeOutDetail, type OfficeTimeCard } from '@utils/api/timeCardsApi';
import { ensureQuestion, unexpectedAnswer, type QuestionRecord } from '@utils/api/questionsApi';
import { getCrew, setCrewNotifyUser } from '@utils/api/crewsApi';
import { findNotifiableUser } from '@utils/api/usersApi';

test.describe('B12 · Time-out questions to notification', { tag: ['@JourneyB', '@B12'] }, () => {
    test('[Time-Out Questions] Clock three crew members out with their clock-out question answers and a signature, and verify every answer — including the ones outside the expected response — imports against the right time-out card.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B12-001' },
            { type: 'requirement', description: 'B12-R3|B12-R4|B12-R5|B12-R6|B12-R8' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        test.slow();

        const office = await seedOfficeFixture(sessionApi);

        const questions = new Map<string, QuestionRecord>();
        for (const spec of B12_QUESTIONS) {
            questions.set(spec.name, await ensureQuestion(sessionApi, spec));
        }

        const notifyUser = await findNotifiableUser(sessionApi);
        const previousNotifyUser = await setCrewNotifyUser(sessionApi, office.crew.id, notifyUser.usersCounter);

        let cards: OfficeTimeCard[] = [];
        try {
            const punchDate = punchDay(DAY_OFFSET.B12);
            const prefix = newRunPrefix();
            const deviceAddress = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
            const gpsFix = '(36.8076963, -119.8348286)';

            const employeeId1 = office.employees.get(F.present[0].code)!.id; // Raquel — 6001
            const employeeId2 = office.employees.get(F.present[1].code)!.id; // Miguel — 6002
            const employeeId3 = office.employees.get(F.present[2].code)!.id; // Sergio — 6003

            const timeInAt = punchMoment(7, 15, punchDate);

            // ── Three workers, mirroring the recording's answer patterns ──
            const raquel = {
                code: F.present[0].code,
                id: employeeId1,
                timeOutAt: punchMoment(10, 40, punchDate),
                answers: {
                    [B12_QUESTIONS[0].name]: unexpectedAnswer(questions.get(B12_QUESTIONS[0].name)!),
                    [B12_QUESTIONS[1].name]: unexpectedAnswer(questions.get(B12_QUESTIONS[1].name)!),
                    [B12_QUESTIONS[2].name]: unexpectedAnswer(questions.get(B12_QUESTIONS[2].name)!),
                },
            };
            const miguel = {
                code: F.present[1].code,
                id: employeeId2,
                timeOutAt: punchMoment(10, 39, punchDate),
                answers: {
                    [B12_QUESTIONS[0].name]: questions.get(B12_QUESTIONS[0].name)!.requiredResponse!,
                    [B12_QUESTIONS[1].name]: questions.get(B12_QUESTIONS[1].name)!.requiredResponse!,
                    [B12_QUESTIONS[2].name]: questions.get(B12_QUESTIONS[2].name)!.requiredResponse!,
                },
            };
            const sergio = {
                code: F.present[2].code,
                id: employeeId3,
                timeOutAt: punchMoment(10, 40, punchDate),
                answers: {
                    [B12_QUESTIONS[0].name]: questions.get(B12_QUESTIONS[0].name)!.requiredResponse!,
                    [B12_QUESTIONS[1].name]: questions.get(B12_QUESTIONS[1].name)!.requiredResponse!,
                    [B12_QUESTIONS[2].name]: unexpectedAnswer(questions.get(B12_QUESTIONS[2].name)!),
                },
            };

            // ── Precompute all six card references up front, so the grid rows
            // can name their parent by Reference before the envelope is built.
            // Time-Ins keep F.present's own order; Time-Outs follow the
            // recording's order (Miguel 10:39, Raquel 10:40, Sergio 10:40). ──
            const refTimeIn1 = buildReference(1, timeInAt, prefix, DEVICE_SCHEMA.referenceParts.timeIn);
            const refTimeIn2 = buildReference(2, timeInAt, prefix, DEVICE_SCHEMA.referenceParts.timeIn);
            const refTimeIn3 = buildReference(3, timeInAt, prefix, DEVICE_SCHEMA.referenceParts.timeIn);
            const refTimeOutMiguel = buildReference(4, miguel.timeOutAt, prefix, DEVICE_SCHEMA.referenceParts.timeOut);
            const refTimeOutRaquel = buildReference(5, raquel.timeOutAt, prefix, DEVICE_SCHEMA.referenceParts.timeOut);
            const refTimeOutSergio = buildReference(6, sergio.timeOutAt, prefix, DEVICE_SCHEMA.referenceParts.timeOut);

            const timeOutOrder = [
                { worker: miguel, reference: refTimeOutMiguel },
                { worker: raquel, reference: refTimeOutRaquel },
                { worker: sergio, reference: refTimeOutSergio },
            ];

            const records: DeviceRecord[] = [
                // Amy's morning Time Ins — work context, Barcode Badge.
                {
                    node: 'TimeCard',
                    part: DEVICE_SCHEMA.referenceParts.timeIn,
                    employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                    employeeCode: raquel.code,
                    crewCode: F.crew.code,
                    ranchCode: F.ranch.code,
                    fieldCode: F.field.code,
                    jobCode: F.job.code,
                    at: timeInAt,
                    reference: refTimeIn1,
                },
                {
                    node: 'TimeCard',
                    part: DEVICE_SCHEMA.referenceParts.timeIn,
                    employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                    employeeCode: miguel.code,
                    crewCode: F.crew.code,
                    ranchCode: F.ranch.code,
                    fieldCode: F.field.code,
                    jobCode: F.job.code,
                    at: timeInAt,
                    reference: refTimeIn2,
                },
                {
                    node: 'TimeCard',
                    part: DEVICE_SCHEMA.referenceParts.timeIn,
                    employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                    employeeCode: sergio.code,
                    crewCode: F.crew.code,
                    ranchCode: F.ranch.code,
                    fieldCode: F.field.code,
                    jobCode: F.job.code,
                    at: timeInAt,
                    reference: refTimeIn3,
                },
                // Clock-outs — no Job/Ranch/Field, each carrying the signature.
                ...timeOutOrder.map(({ worker, reference }) => ({
                    node: 'TimeOut' as const,
                    part: DEVICE_SCHEMA.referenceParts.timeOut,
                    employeeSource: DEVICE_SCHEMA.employeeSource.barcodeBadge,
                    employeeCode: worker.code,
                    crewCode: F.crew.code,
                    at: worker.timeOutAt,
                    gps: gpsFix,
                    signature: B12_SIGNATURE_PNG,
                    reference,
                })),
                // The nine answer grid rows — one per worker per question, each
                // naming its parent Time Out by Reference, no reference of its own.
                ...timeOutOrder.flatMap(({ worker, reference }) =>
                    B12_QUESTIONS.map((q) => ({
                        node: 'TimeCardQuestion' as const,
                        part: '',
                        parentReference: reference,
                        question: q.name,
                        response: worker.answers[q.name],
                        at: worker.timeOutAt,
                    })),
                ),
            ];

            const { xml, references } = buildEnvelope({
                deviceAddress,
                prefix,
                at: timeInAt,
                records,
            });

            // ── XML shape asserts, kept lean ──
            expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCard}${DEVICE_SCHEMA.recordsSuffix}`);
            expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeOut}${DEVICE_SCHEMA.recordsSuffix}`);
            expect(xml).toContain(`<${DEVICE_SCHEMA.nodes.TimeCardQuestion}${DEVICE_SCHEMA.recordsSuffix}`);
            expect(references).toHaveLength(6);
            expect(
                references.filter((r) => r.includes(`-${DEVICE_SCHEMA.referenceParts.timeIn}-`)),
                'three time-in references',
            ).toHaveLength(3);
            expect(
                references.filter((r) => r.includes(`-${DEVICE_SCHEMA.referenceParts.timeOut}-`)),
                'three time-out references',
            ).toHaveLength(3);

            const timeOutRecordsTag = `${DEVICE_SCHEMA.nodes.TimeOut}${DEVICE_SCHEMA.recordsSuffix}`;
            const timeOutSection =
                xml.match(new RegExp(`<${timeOutRecordsTag}[\\s\\S]*?</${timeOutRecordsTag}>`))?.[0] ?? '';
            expect(timeOutSection).not.toContain(`<${DEVICE_SCHEMA.tags.job}>`);
            expect(timeOutSection).not.toContain(`<${DEVICE_SCHEMA.tags.ranch}>`);
            expect(timeOutSection).not.toContain(`<${DEVICE_SCHEMA.tags.field}>`);

            const questionRecordsTag = `${DEVICE_SCHEMA.nodes.TimeCardQuestion}${DEVICE_SCHEMA.recordsSuffix}`;
            const questionSection =
                xml.match(new RegExp(`<${questionRecordsTag}[\\s\\S]*?</${questionRecordsTag}>`))?.[0] ?? '';
            expect(questionSection).not.toContain(DEVICE_SCHEMA.attributes.lookupContents);
            expect(
                questionSection.match(new RegExp(`<${DEVICE_SCHEMA.tags.response}>`, 'g')) ?? [],
                'nine answer rows',
            ).toHaveLength(9);
            // Sample fidelity: every clock-out carries the signed acknowledgment the
            // device captures. Asserted on the envelope only — the importer leaves the
            // Signature column unbound on purpose, which B12-R9's annotation names.
            expect(
                timeOutSection.split(`<${DEVICE_SCHEMA.tags.signature}>${B12_SIGNATURE_PNG}`).length - 1,
                'three signed clock-outs',
            ).toBe(3);

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
            const result = await deliverAndVerifyCards({
                sessionApi,
                pages,
                testInfo,
                xml,
                label: 'B12',
                crewId: office.crew.id,
                ranchId: office.ranch.id,
                punchDate,
                cardType: null, // the envelope mixes cardType 1 (time-in) and 0 (time-out)
                absentEmployeeIds: [office.employees.get(F.absentee.code)!.id],
                expected: [
                    { employeeCode: raquel.code, employeeId: raquel.id, reference: refTimeIn1, fieldId: office.field.id, jobId: office.job.id },
                    { employeeCode: miguel.code, employeeId: miguel.id, reference: refTimeIn2, fieldId: office.field.id, jobId: office.job.id },
                    { employeeCode: sergio.code, employeeId: sergio.id, reference: refTimeIn3, fieldId: office.field.id, jobId: office.job.id },
                    // The three time-outs omit fieldId/jobId — the helper then
                    // skips the work-context asserts; B12-R4 asserts the nulls below.
                    { employeeCode: miguel.code, employeeId: miguel.id, reference: refTimeOutMiguel },
                    { employeeCode: raquel.code, employeeId: raquel.id, reference: refTimeOutRaquel },
                    { employeeCode: sergio.code, employeeId: sergio.id, reference: refTimeOutSergio },
                ],
            });
            cards = result.cards;

            // ── B12-R10 — a named gate, never a silent skip ──
            testInfo.annotations.push({
                type: 'clockout-flag-not-run-on-import',
                description:
                    'B12-R10 is not asserted: DetectAndFlagClockOutAnswers and sendClockOutFlagNotifications ' +
                    'are reachable only from POST/PUT /api/time-cards/time-out, never from the connectivity ' +
                    'import path, so an imported unexpected answer raises no TimeCardQuestionFlag row. ' +
                    'Verified manually in the legacy stack — see ' +
                    'docs/media/journey-b/b12-notification-email.png, transcribed in the B12 plan.',
            });
            testInfo.annotations.push({
                type: 'notification-email-not-observable',
                description:
                    "B12-R10's email half has no observable channel: the sender falls back to LogEmailSender, " +
                    'there is no outbox table or notification-log endpoint, and ' +
                    'TimeCardQuestionFlag.NotifiedAtUtc is exposed by no API. The email in the manual evidence ' +
                    'was produced by the legacy real-time service, not web-pet.',
            });
            testInfo.annotations.push({
                type: 'signature-not-bound-on-import',
                description:
                    'B12-R9 is not asserted: the importer leaves the Signature column unbound by design — ' +
                    '"their populated encoding is unverified, so they are left unbound (they will simply be ' +
                    'NULL) rather than guessing a decode" (importmap/timecard.go:80-83), and timeCardSpec ' +
                    'declares no Signature column. Confirmed live: a card whose envelope carried a signature ' +
                    'came back with signature: null. The envelope still sends it (asserted above as sample ' +
                    'fidelity), so this becomes assertable unchanged once the column is bound.',
            });

            const byReference = new Map(cards.map((c) => [String(c.reference ?? ''), c]));
            const timeOutCards = [
                { worker: raquel, card: byReference.get(refTimeOutRaquel)! },
                { worker: miguel, card: byReference.get(refTimeOutMiguel)! },
                { worker: sergio, card: byReference.get(refTimeOutSergio)! },
            ];

            // ── B12-R3 ──
            for (const { worker, card } of timeOutCards) {
                expect(card.cardType).toBe(CARD_TYPE.timeOut);
                expect(card.employeeCounter).toBe(worker.id);
                expect(card.crewCounter).toBe(office.crew.id);
                expect(card.programCreated).toBe(true);
                expect(String(card.reference)).toContain(`-${DEVICE_SCHEMA.referenceParts.timeOut}-`);
            }

            // ── B12-R4 — assert the nulls explicitly; the helper only skipped them ──
            for (const { card } of timeOutCards) {
                expect(card.jobCounter).toBeNull();
                expect(card.ranchCounter).toBeNull();
                expect(card.fieldCounter).toBeNull();
            }

            // ── B12-R5 ──
            const detailByCode = new Map<string, Awaited<ReturnType<typeof getTimeOutDetail>>>();
            for (const { worker, card } of timeOutCards) {
                const detail = await getTimeOutDetail(sessionApi, card.timeCardCounter);
                detailByCode.set(worker.code, detail);

                expect(detail.questions, `${worker.code}'s answers`).toHaveLength(3);
                const actual = [...(detail.questions ?? [])]
                    .map((q) => ({ questionName: q.questionName, response: q.response }))
                    .sort((a, b) => a.questionName.localeCompare(b.questionName));
                const expectedAnswers = B12_QUESTIONS
                    .map((q) => ({ questionName: q.name, response: worker.answers[q.name] }))
                    .sort((a, b) => a.questionName.localeCompare(b.questionName));
                expect(actual).toEqual(expectedAnswers);
            }

            // ── B12-R6 — Raquel's responses stored verbatim, not rejected or normalised ──
            const raquelDetail = detailByCode.get(raquel.code)!;
            for (const q of B12_QUESTIONS) {
                const answer = raquelDetail.questions!.find((a) => a.questionName === q.name)!;
                expect(answer.response).toBe(raquel.answers[q.name]);
            }

            // ── B12-R8 ──
            const crew = await getCrew(sessionApi, office.crew.id);
            expect(crew.userToNotifyBreakAndMeal).toBe(notifyUser.usersCounter);
            expect(notifyUser.emailAddress).toEqual(expect.any(String));
            expect(notifyUser.emailAddress).not.toBe('');
        } finally {
            await cleanupCards(sessionApi, cards, testInfo);
            await setCrewNotifyUser(sessionApi, office.crew.id, previousNotifyUser);
        }
    });
});
