import type { APIRequestContext } from '@playwright/test';

/**
 * Discover-or-create for the clock-out questions a `TimeCardQuestion` grid row
 * links against (B12).
 *
 * Two rules from the app make this narrower than the other setup helpers:
 *
 *  - The importer resolves `<Question>` by **`Name`**, not by a code
 *    (`importmap/specs_inbound_grid.go:64`) — so the name in the envelope and the
 *    name here have to be the same string, and names are the identity.
 *  - Once any `TimeCardQuestion` row references a question, **only `Active` may
 *    change** — `PUT /questions/{id}` otherwise answers *"This question is in use
 *    by a time card and cannot be modified."* (`setup/question.go:394-406`). So a
 *    question whose stored values differ from what the caller wants can never be
 *    corrected; this module reports that instead of pretending to fix it.
 *
 * Why the fixture names are prefixed: dev already holds a question literally named
 * `Break` which is referenced and has a **null** `requiredResponse` (probed
 * 2026-08-27). A null required response is never flagged at all
 * (`clockout_answer_flag.go:72`), so reusing that name would silently bind B12's
 * answers to a question that cannot express the workflow.
 *
 * Nothing is deleted: a referenced question cannot be removed cleanly, so these
 * become stable QA fixture data exactly like `officeFixture`'s records.
 */

export interface QuestionRecord {
    questionCounter: number;
    name: string;
    questionText?: string | null;
    allowedResponses?: string | null;
    requiredResponse?: string | null;
    questionType?: string;
    active?: boolean;
    /** True once a `TimeCardQuestion` row points at it — makes it immutable but for `active`. */
    isReferenced?: boolean;
    version?: string;
}

export interface QuestionSpec {
    name: string;
    requiredResponse: string;
    allowedResponses: string;
    questionText: string;
}

export async function listQuestions(request: APIRequestContext): Promise<QuestionRecord[]> {
    const res = await request.get('questions');
    if (!res.ok()) {
        throw new Error(`GET questions failed with ${res.status()}: ${(await res.text()).slice(0, 300)}`);
    }
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as QuestionRecord[]) : [];
}

/**
 * The question named `spec.name`, created with `spec`'s values when missing.
 *
 * Throws when an existing question carries a different `requiredResponse`: it is
 * either referenced (and so uncorrectable) or it belongs to someone else's
 * fixture, and binding B12's answers to it would assert against the wrong rule.
 */
export async function ensureQuestion(
    request: APIRequestContext,
    spec: QuestionSpec,
): Promise<QuestionRecord> {
    const existing = (await listQuestions(request)).find((q) => q.name === spec.name);
    if (existing) {
        const stored = existing.requiredResponse ?? '';
        if (stored !== spec.requiredResponse) {
            throw new Error(
                `Question '${spec.name}' already exists with requiredResponse '${stored}' ` +
                    `instead of '${spec.requiredResponse}'` +
                    (existing.isReferenced
                        ? ' — and it is referenced by a time card, so only Active can be changed. ' +
                          'Pick a different fixture name.'
                        : ' — reconcile it by hand before running.'),
            );
        }
        // A stored row can carry no allowed-response list (dev's own questions do
        // not always). The required response already matched, so the caller's
        // list is the usable one for deriving an answer outside it.
        return {
            ...existing,
            allowedResponses: existing.allowedResponses?.trim() ? existing.allowedResponses : spec.allowedResponses,
        };
    }

    const res = await request.post('questions', {
        data: {
            name: spec.name,
            questionText: spec.questionText,
            allowedResponses: spec.allowedResponses,
            requiredResponse: spec.requiredResponse,
            active: true,
        },
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(`POST questions failed with ${res.status()}: ${(await res.text()).slice(0, 400)}`);
    }
    const body = (await res.json()) as QuestionRecord;
    // The create response does not echo every column back, so the values we just
    // sent are layered over it — otherwise the returned record looks like a
    // question with no allowed responses at all.
    return {
        ...body,
        name: spec.name,
        questionText: spec.questionText,
        allowedResponses: spec.allowedResponses,
        requiredResponse: spec.requiredResponse,
    };
}

/**
 * An answer that is guaranteed NOT to satisfy `requiredResponse`.
 *
 * Derived rather than hard-coded because `requiredResponse` is a comma-separated
 * list of acceptable answers, compared with no whitespace trimming
 * (`clockout_answer_flag.go:129-139`) — and because the stored value is whatever
 * the environment holds, which a referenced question makes impossible to change.
 * Prefers another value from `allowedResponses` so the answer stays one a device
 * could really have sent.
 */
export function unexpectedAnswer(question: QuestionRecord): string {
    const required = (question.requiredResponse ?? '').split(',');
    const allowed = (question.allowedResponses ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    const other = allowed.find((v) => !required.includes(v));
    if (other) return other;
    throw new Error(
        `Question '${question.name}' offers no allowed response outside its required ` +
            `'${question.requiredResponse}' — cannot build an unexpected answer.`,
    );
}
