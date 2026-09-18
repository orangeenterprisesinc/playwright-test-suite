import type { APIRequestContext } from '@playwright/test';

/**
 * `POST transfer-to-job-cards/analyze` — the endpoint that feeds both the Transfer screen and the
 * Time Cards Exceptions panel. Never throws on a non-2xx: B5 asserts the status itself, with the
 * body in the message. Exceptions are reported in a top-level `exceptions[]`, each with a `code`,
 * a legacy-parity `message` and the `sourceTimeCardCounter` it flags (WEBPET-2657 retired the
 * interim "JobCounter is required…" text).
 */
export interface AnalyzeException {
    code?: string;
    severity?: string;
    message?: string;
    sourceTimeCardCounter?: number;
}

export interface AnalyzeResult {
    ok: boolean;
    status: number;
    exceptions: AnalyzeException[];
    /** The whole body, for the caller's failure message. */
    raw: unknown;
}

export async function analyzeTransfer(request: APIRequestContext, opts: { from: string; to: string }): Promise<AnalyzeResult> {
    const res = await request.post('transfer-to-job-cards/analyze', { data: { from: opts.from, to: opts.to } });
    const raw = (await res.json().catch(() => ({}))) as { exceptions?: AnalyzeException[] };
    return { ok: res.ok(), status: res.status(), exceptions: raw.exceptions ?? [], raw };
}
