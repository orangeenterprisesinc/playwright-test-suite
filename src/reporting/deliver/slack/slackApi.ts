/**
 * @fileoverview Minimal Slack transport: Incoming Webhook, chat.postMessage and
 * the file-upload flow.
 *
 * `files.upload` was retired in 2025 — uploading now takes three calls: get an
 * upload URL, POST the bytes to it, then complete the upload against a channel.
 *
 * Uses node:https with `agent: false` rather than global fetch: undici pools a
 * keep-alive socket that trips a libuv `UV_HANDLE_CLOSING` assertion on process
 * exit on Windows, turning a green run into a non-zero exit code.
 */
import fs from 'node:fs';
import https from 'node:https';

/**
 * A Block Kit message. Blocks live inside the attachment (that is what carries
 * the green/red side bar), and the notification text is the attachment's
 * `fallback` — a top-level `text` would render as a duplicate line above it.
 */
export interface SlackMessage {
    attachments: unknown[];
}

interface SlackResult {
    ok: boolean;
    error?: string;
    [key: string]: unknown;
}

interface HttpResponse {
    status: number;
    body: string;
}

function httpRequest(
    url: string,
    options: { method: string; headers: Record<string, string> },
    body: Buffer | string,
): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
        const req = https.request(
            url,
            {
                method: options.method,
                agent: false,
                headers: { ...options.headers, 'Content-Length': payload.length, Connection: 'close' },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () =>
                    resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }),
                );
            },
        );
        req.on('error', reject);
        req.end(payload);
    });
}

/**
 * Calls a Slack Web API method. Slack answers 200 with `ok: false` on logical
 * failures (bad scope, unknown channel), so both layers are checked here and
 * collapsed into one thrown Error.
 */
async function callApi(
    method: string,
    token: string,
    body: Record<string, unknown>,
    form = false,
): Promise<SlackResult> {
    const encoded = form
        ? new URLSearchParams(body as Record<string, string>).toString()
        : JSON.stringify(body);

    const { status, body: raw } = await httpRequest(
        `https://slack.com/api/${method}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': form
                    ? 'application/x-www-form-urlencoded; charset=utf-8'
                    : 'application/json; charset=utf-8',
            },
        },
        encoded,
    );

    if (status < 200 || status >= 300) throw new Error(`${method} → HTTP ${status} ${raw}`);

    let result: SlackResult;
    try {
        result = JSON.parse(raw) as SlackResult;
    } catch {
        throw new Error(`${method} → unparseable response: ${raw.slice(0, 200)}`);
    }
    if (!result.ok) throw new Error(`${method} → ${result.error ?? 'unknown error'}`);
    return result;
}

/** Posts the message and returns its `ts`, the thread key for {@link uploadFile}. */
export async function postMessage(token: string, channel: string, message: SlackMessage): Promise<string> {
    const result = await callApi('chat.postMessage', token, { channel, ...message });
    return String(result.ts ?? '');
}

/** Replaces an already-posted message in place. Same `chat:write` scope as {@link postMessage}. */
export async function updateMessage(
    token: string,
    channel: string,
    ts: string,
    message: SlackMessage,
): Promise<void> {
    await callApi('chat.update', token, { channel, ts, ...message });
}

/**
 * Posts to an Incoming Webhook. Webhooks answer with the literal body `ok`
 * rather than JSON and cannot carry files, so this is the summary-only route.
 */
export async function postWebhook(url: string, message: SlackMessage): Promise<void> {
    const { status, body } = await httpRequest(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
        JSON.stringify(message),
    );
    if (status < 200 || status >= 300) throw new Error(`webhook → HTTP ${status} ${body.slice(0, 200)}`);
}

function multipartBody(boundary: string, filename: string, content: Buffer): Buffer {
    return Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
                'Content-Type: application/octet-stream\r\n\r\n',
            'utf8',
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
}

/**
 * Uploads `filePath` to `channel`, optionally inside the thread of `threadTs`.
 * Requires the `files:write` scope. Returns the file's permalink, or `''` if
 * Slack did not report one — the bytes are stored either way, so a missing
 * permalink must not read as a failed upload.
 */
export async function uploadFile(
    token: string,
    options: { channel: string; filePath: string; filename: string; title: string; threadTs?: string; comment?: string },
): Promise<string> {
    const content = fs.readFileSync(options.filePath);

    const upload = await callApi(
        'files.getUploadURLExternal',
        token,
        { filename: options.filename, length: String(content.length) },
        true,
    );
    const uploadUrl = String(upload.upload_url ?? '');
    const fileId = String(upload.file_id ?? '');
    if (!uploadUrl || !fileId) throw new Error('files.getUploadURLExternal returned no upload_url/file_id');

    const boundary = `----slackreporter${fileId}`;
    const { status, body } = await httpRequest(
        uploadUrl,
        { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` } },
        multipartBody(boundary, options.filename, content),
    );
    if (status < 200 || status >= 300) throw new Error(`file upload → HTTP ${status} ${body.slice(0, 200)}`);

    const completed = await callApi('files.completeUploadExternal', token, {
        files: [{ id: fileId, title: options.title }],
        channel_id: options.channel,
        ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
        ...(options.comment ? { initial_comment: options.comment } : {}),
    });

    const files = Array.isArray(completed.files) ? (completed.files as { permalink?: string }[]) : [];
    return files[0]?.permalink ?? '';
}
