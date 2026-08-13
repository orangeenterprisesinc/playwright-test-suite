/**
 * The Post Office relay leg of Journey B, on its own: an export envelope pushed
 * into a mailbox comes back out byte-identical.
 *
 * This is the one part of the device→office pipeline that can be proven today —
 * the office import needs object storage on dev (WEBPET-1830), so `B1-001` and
 * `B2-001` stop there. Delivery is the leg that actually broke in the field
 * (a missing destination made every export fail silently), which is why it is
 * worth a test of its own.
 *
 * Self-cleaning by construction: it drains its own scratch mailbox first, then
 * acknowledges what it pulled, so nothing accumulates on the relay. It uses a
 * mailbox of its own — never the office queue the B1/B2 exports land in.
 */
import { expect, test } from '@fixtures/api.fixture';
import { JOURNEY_B_FIXTURE as F } from '@data/journey-b/fixture';
import { buildCrewTimeInEnvelope, exportFileName, newRunPrefix } from '@utils/relay/exportEnvelope';
import { ackRetrieved, drainMailbox, pullFromRelay, sendToRelay } from '@utils/relay/relayClient';

const SMOKE_MAILBOX = 'b1smoke@petb1';

test.describe('B1 · Relay transport', { tag: ['@JourneyB', '@B1'] }, () => {
    test('[Relay] An export envelope pushed to a mailbox is returned unchanged.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B1-002' },
            { type: 'requirement', description: 'B1-R7' },
        ],
    }, async ({}, testInfo) => {
        const url = process.env.DEVICE_RELAY_URL;
        const from = process.env.DEVICE_RELAY_FROM ?? 'b1device@petb1';
        expect(url, 'DEVICE_RELAY_URL must be set (see .env.dev)').toBeTruthy();

        // Anything left by an interrupted run would be pulled instead of ours.
        const cleared = await drainMailbox(url!, SMOKE_MAILBOX);
        if (cleared) console.log(`[relay] drained ${cleared} stale message(s) from ${SMOKE_MAILBOX}`);

        const prefix = newRunPrefix();
        const { xml, references } = buildCrewTimeInEnvelope({
            deviceAddress: from,
            prefix,
            cards: [
                {
                    employeeCode: F.present[0].code,
                    crewCode: F.crew.code,
                    ranchCode: F.ranch.code,
                    fieldCode: F.field.code,
                    jobCode: F.job.code,
                },
            ],
        });
        const fileName = exportFileName(prefix);

        const sent = await sendToRelay({ url: url!, from, to: SMOKE_MAILBOX, xml, fileName });
        expect(sent.success, `relay rejected the push: ${sent.body}`).toBe(true);

        const pulled = await pullFromRelay(url!, SMOKE_MAILBOX);
        expect(pulled, 'nothing was queued for the smoke mailbox').not.toBeNull();

        try {
            // Byte fidelity: the relay stores the attachment verbatim, so a
            // difference here means the transport mangled the envelope.
            expect(pulled!.attachment).toBe(xml);
            expect(pulled!.attachment).toContain(references[0]);
            // The stored file name travels in `Body`, and `Address` on the pull
            // side is the SENDER — not the destination it was posted to.
            expect(pulled!.fileName).toBe(fileName);
            expect(pulled!.address).toBe(from);
            expect(pulled!.subject).toBe('Export');
        } finally {
            await ackRetrieved(url!, SMOKE_MAILBOX, pulled!.messageId);
        }

        await testInfo.attach('relay-roundtrip.txt', {
            body:
                `mailbox: ${SMOKE_MAILBOX}\nfrom: ${from}\nfile: ${fileName}\n` +
                `messageId: ${pulled!.messageId}\nbytes: ${xml.length}`,
            contentType: 'text/plain',
        });
    });
});
