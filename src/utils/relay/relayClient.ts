/**
 * Talks to the Post Office relay exactly as PET Pocket does — the transport half
 * of Journey B, without a device.
 *
 * Ported from AndroidPET's `net/OrangeRESTClient.java` and corroborated by
 * web-pet's own client (`internal/connectivity/webmail/rest.go`), which speaks
 * the same three endpoints off the service URL:
 *   POST /UploadFile        push a file into a mailbox
 *   POST /File              pull the next queued message for the caller
 *   POST /Retrieved?id=N    acknowledge it, removing it from the queue
 *
 * The relay has no accounts: an address is a queue key created on first use, and
 * on the test relay the password is the account name. Nothing here provisions
 * anything.
 *
 * Note the asymmetry the wire format has: on send, `<Address>` is the
 * DESTINATION; on pull, `Address` is the SENDER.
 */
import { request as playwrightRequest, type APIRequestContext } from '@playwright/test';
import { DEVICE_VERSION, deviceIso } from './exportEnvelope';

/** The app's hard-coded token; the relay only checks it is present. */
const DEVICE_TOKEN = '7F6F87E4-FD6E-4B1C-9A3D-6B8F46F4ACAB';
const TIME_ZONE_ID = 'Pacific Standard Time';

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function unesc(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/** `yyyy-MM-dd HH:mm:ss` UTC — a space, not a T, exactly as the app sends it. */
function utcStamp(d = new Date()): string {
    return d.toISOString().replace('T', ' ').slice(0, 19);
}

function headers(mailbox: string, password?: string): Record<string, string> {
    return {
        'Content-Type': 'application/xml',
        'User-Agent': 'Android PET',
        Username: mailbox,
        Password: password ?? mailbox,
        DeviceToken: DEVICE_TOKEN,
        DeviceVersion: DEVICE_VERSION,
        TimeZoneId: TIME_ZONE_ID,
        DeviceTimeZone: TIME_ZONE_ID,
        TimeOnDevice: deviceIso(new Date()),
        UtcTimeOnDevice: utcStamp(),
    };
}

function tagText(xml: string, tag: string): string {
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
    return match ? match[1] : '';
}

/**
 * Both pull operations authenticate TWICE: the headers carry the credentials and
 * so does this body. Sending an empty body instead gets a bare WCF 400 with an
 * HTML error page — verified against the live relay. Password precedes UserName,
 * matching the legacy XmlDocument the service deserializes.
 */
function credentialsBody(mailbox: string, password?: string): string {
    return (
        '<Credentials>' +
        `<Password>${esc(password ?? mailbox)}</Password>` +
        `<UserName>${esc(mailbox)}</UserName>` +
        '</Credentials>'
    );
}

async function relayContext(url: string): Promise<APIRequestContext> {
    return playwrightRequest.newContext({ baseURL: url.endsWith('/') ? url : `${url}/` });
}

export interface SendInput {
    /** The service URL, e.g. https://…/webmail/v6/OrangeMailService.svc */
    url: string;
    /** Sender mailbox — also the Username header. */
    from: string;
    /** Destination mailbox. */
    to: string;
    xml: string;
    subject?: string;
    fileName: string;
    password?: string;
}

export interface SendResult {
    success: boolean;
    status: number;
    body: string;
}

/**
 * Push an envelope into a mailbox.
 *
 * Success is NOT the HTTP status: the WCF service answers 200 with a
 * `<boolean>` body, and the app treats only the literal `true` as sent — which
 * is what its "is push file success" log line reports.
 */
export async function sendToRelay({
    url,
    from,
    to,
    xml,
    subject = 'Export',
    fileName,
    password,
}: SendInput): Promise<SendResult> {
    const body =
        '<Send>' +
        `<userDetails><Password>${esc(password ?? from)}</Password><UserName>${esc(from)}</UserName></userDetails>` +
        '<msg>' +
        `<Address>${esc(to)}</Address>` +
        `<Attachment>${esc(xml)}</Attachment>` +
        `<Body>${esc(fileName)}</Body>` +
        '<MessageID>1</MessageID>' +
        `<Subject>${esc(subject)}</Subject>` +
        '<Type>Input</Type>' +
        '</msg>' +
        '</Send>';

    const ctx = await relayContext(url);
    try {
        const res = await ctx.post('UploadFile', { headers: headers(from, password), data: body });
        const text = await res.text();
        return { success: />\s*true\s*</i.test(text) || text.trim() === 'true', status: res.status(), body: text };
    } finally {
        await ctx.dispose();
    }
}

export interface PulledMessage {
    messageId: number;
    subject: string;
    /** The SENDER's mailbox on this side of the wire. */
    address: string;
    /** The stored file name — the relay carries it in `Body`, not `Subject`. */
    fileName: string;
    /** The envelope, un-escaped back to its original bytes. */
    attachment: string;
}

/** Pull the next queued message, or null when the mailbox is empty. */
export async function pullFromRelay(
    url: string,
    mailbox: string,
    password?: string,
): Promise<PulledMessage | null> {
    const ctx = await relayContext(url);
    try {
        const res = await ctx.post('File', {
            headers: headers(mailbox, password),
            data: credentialsBody(mailbox, password),
        });
        const text = await res.text();
        const id = Number(tagText(text, 'MessageID'));
        if (!Number.isFinite(id) || id <= 0) return null;
        return {
            messageId: id,
            subject: unesc(tagText(text, 'Subject')),
            address: unesc(tagText(text, 'Address')),
            fileName: unesc(tagText(text, 'Body')),
            attachment: unesc(tagText(text, 'Attachment')),
        };
    } finally {
        await ctx.dispose();
    }
}

/** Acknowledge a pulled message so the relay stops serving it. */
export async function ackRetrieved(
    url: string,
    mailbox: string,
    messageId: number,
    password?: string,
): Promise<boolean> {
    const ctx = await relayContext(url);
    try {
        const res = await ctx.post(`Retrieved?id=${messageId}`, {
            headers: headers(mailbox, password),
            data: credentialsBody(mailbox, password),
        });
        return res.ok();
    } finally {
        await ctx.dispose();
    }
}

/** Pull-and-ack until empty. Returns how many messages were cleared. */
export async function drainMailbox(
    url: string,
    mailbox: string,
    password?: string,
    max = 25,
): Promise<number> {
    let cleared = 0;
    for (let i = 0; i < max; i += 1) {
        const msg = await pullFromRelay(url, mailbox, password);
        if (!msg) break;
        await ackRetrieved(url, mailbox, msg.messageId, password);
        cleared += 1;
    }
    return cleared;
}
