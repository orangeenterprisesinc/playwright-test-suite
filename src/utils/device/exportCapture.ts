import { expect, type TestInfo } from '@playwright/test';
import { adb } from './adb';

/**
 * Captures the export payload PET Pocket produces, straight from the app's own
 * serializer.
 *
 * ## Why not intercept the upload?
 *
 * `OrangeRESTClient`'s constructor **force-upgrades the URL to HTTPS** — any
 * `http://` address is rewritten to `https://` (lines 70-74; the reverse only
 * happens on pre-API-23 devices after a TLS failure). The app also ships no
 * `network_security_config`, so on API 29 it trusts **system** CAs only. A local
 * HTTP stub is therefore unreachable, and an HTTPS stub needs its CA installed
 * into `/system` on a `-writable-system` emulator — real work, and only needed to
 * prove *delivery*.
 *
 * What the office actually consumes is the XML, and the app logs exactly what it
 * puts on the wire (`SyncManager.sendInputRecords`), so we read it from there:
 * the payload is the app's genuine output, no interception required.
 *
 * Delivery to a relay is deliberately **not** claimed by this path — that is a
 * separate, env-gated concern (a real relay mailbox, or the system-CA stub).
 */
const XML_PATTERN = /<OrangeExportFile>.*?<\/OrangeExportFile>/;

/** Drop buffered logs so a capture cannot pick up a previous run's export. */
export function clearExportLog(): void {
    adb(['logcat', '-c']);
}

/**
 * Read the most recent export envelope from the device log.
 * Returns '' when the app has not serialized one (e.g. nothing to export).
 */
export function readExportedXml(): string {
    const log = adb(['logcat', '-d', '-v', 'raw']).toString('utf-8');
    const matches = log.match(new RegExp(XML_PATTERN.source, 'g'));
    return matches?.length ? matches[matches.length - 1] : '';
}

/** Poll until an export envelope appears, or throw after `timeoutMs`. */
export async function waitForExportedXml(timeoutMs = 60_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const xml = readExportedXml();
        if (xml) return xml;
        if (Date.now() > deadline) {
            throw new Error(`No export envelope was serialized within ${timeoutMs}ms`);
        }
        await new Promise((r) => setTimeout(r, 500));
    }
}

/**
 * The app logs one line per upload attempt (`SyncManager`: "is push file
 * success: true|false"), and on failure the reason (`OrangeRESTClient`: "Error
 * from server: …"). This is the authoritative did-it-send signal — independent
 * of the on-screen dialog, which the app mistranslates for some failures.
 */
export interface SendResult {
    /** True only when at least one attempt was logged and every attempt succeeded. */
    sent: boolean;
    /** Per-attempt success flags, in log order (the app sends up to twice). */
    attempts: boolean[];
    /** The last server-error line, when a send failed (''. otherwise). */
    error: string;
}

function scanSendResult(): SendResult {
    const log = adb(['logcat', '-d', '-v', 'time']).toString('utf-8');
    const attempts = [...log.matchAll(/is push file success:\s*(true|false)/gi)].map(
        (m) => m[1].toLowerCase() === 'true',
    );
    const errors = [...log.matchAll(/Error from server:\s*(.+)/gi)].map((m) => m[1].trim());
    return {
        sent: attempts.length > 0 && attempts.every(Boolean),
        attempts,
        error: attempts.every(Boolean) ? '' : (errors[errors.length - 1] ?? ''),
    };
}

/**
 * Wait for the upload result to appear in the log, letting the attempt count
 * settle (the app posts up to twice a few hundred ms apart) so a two-call export
 * is not judged on its first line. Returns the last reading on timeout — callers
 * decide whether an empty result is a failure.
 */
export async function waitForSendResult(timeoutMs = 30_000): Promise<SendResult> {
    const deadline = Date.now() + timeoutMs;
    let last = scanSendResult();
    for (;;) {
        if (last.attempts.length > 0) {
            await new Promise((r) => setTimeout(r, 800));
            const again = scanSendResult();
            if (again.attempts.length === last.attempts.length) return again;
            last = again;
            continue;
        }
        if (Date.now() > deadline) return last;
        await new Promise((r) => setTimeout(r, 500));
        last = scanSendResult();
    }
}

/**
 * Attach the export outcome (on-screen dialog + the authoritative per-attempt
 * log result) to the report, and assert the send succeeded whenever a relay
 * destination is configured (DEVICE_RELAY_SERVER, set in .env.dev) — so a
 * regressed export goes red instead of passing silently. With the vars blanked
 * (offline run) the evidence is still attached, just not asserted.
 */
export async function attachAndAssertSendResult(
    testInfo: TestInfo,
    label: string,
    exportMessage = '',
): Promise<SendResult> {
    const sendResult = await waitForSendResult();
    const relayConfigured = Boolean(process.env.DEVICE_RELAY_SERVER);
    const summary =
        `dialog: ${exportMessage || '(none)'}\n` +
        `sent: ${sendResult.sent}  attempts: [${sendResult.attempts.join(', ')}]` +
        (sendResult.error ? `\nserver: ${sendResult.error}` : '') +
        `\nrelay configured: ${relayConfigured}`;
    console.log(`[${label} export] ${summary.replace(/\n/g, ' | ')}`);
    await testInfo.attach('export-result.txt', { body: summary, contentType: 'text/plain' });
    if (relayConfigured) {
        expect(sendResult.sent, `export did not send: ${sendResult.error}`).toBe(true);
    }
    return sendResult;
}
