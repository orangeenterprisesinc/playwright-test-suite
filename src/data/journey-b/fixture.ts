/**
 * Deterministic Journey B fixture — no random data. Codes follow the catalog
 * barcode rule (≥4 digits, no leading zero, unique). These records exist on
 * dev staging (discovered-not-recreated by officeFixture) and are the codes
 * the XML import tests reference in their envelopes.
 *
 * B2 (crew move) needs a destination, hence the second field/job.
 */
export const JOURNEY_B_FIXTURE = {
    ranch: { code: '4001', name: 'B1 RANCH' },
    field: { code: '4101', name: 'B1 FIELD' },
    job: { code: '4201', name: 'B1 HARVEST', paymentType: 'Time' },
    // B2 destinations
    field2: { code: '4102', name: 'B2 FIELD EAST' },
    job2: { code: '4202', name: 'B2 PRUNING', paymentType: 'Time' },
    // B10's meal job — a meal punch is an ordinary Time In whose Job is this
    // one, which is the only thing distinguishing it from a work punch
    // (Amy's device shows it as "0 - LUNCH").
    mealJob: { code: '4203', name: 'B10 LUNCH', paymentType: 'Time' },
    crew: { code: '5001', name: 'B1 CREW' },
    present: [
        { code: '6001', name: 'B1 PRESENT ONE' },
        { code: '6002', name: 'B1 PRESENT TWO' },
        { code: '6003', name: 'B1 PRESENT THREE' },
    ],
    absentee: { code: '6004', name: 'B1 ABSENTEE FOUR' },
    // B5 (sticker piece-out)
    sticker: [
        { code: '6005', name: 'B5 STICKER FIVE' },
        { code: '6006', name: 'B5 STICKER SIX' },
    ],
} as const;

/**
 * Days back from B1's punch day, one per workflow — keeps every workflow's
 * fixture punches on a distinct day so parallel workers (`workers=2`) never
 * collide on the office's duplicate-Time-In rule.
 */
export const DAY_OFFSET = {
    B1: 0,
    B2: -1,
    B3: -2,
    B10: -3,
    B11: -4,
    B12: -5,
    B6: -6,
    B5: -7,
    B4: -8,
    B7: -9,
} as const;

/** `base` shifted by `offset` days (negative moves the punch into the past). */
export function punchDay(offset: number, base = new Date()): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + offset);
    return d;
}

/**
 * B12's clock-out question set, mirroring the three questions in Amy's recording.
 *
 * The `B12 ` prefix is load-bearing. Dev already holds a question named literally
 * `Break` which is referenced by a time card and has a **null**
 * `requiredResponse` — and a null required response is never flagged
 * (`clockout_answer_flag.go:72`), while a referenced question can no longer be
 * corrected (`setup/question.go:394-406`). Because the importer resolves
 * `<Question>` by **Name**, reusing Amy's literal names would bind B12's answers
 * to a question that cannot express the workflow.
 *
 * `questionText` is the bilingual prompt the device shows — quoted from the
 * notification email in the B12 plan. It is the `QuestionText` column, not the
 * `Name`; the office grid displays the short name.
 */
export const B12_QUESTIONS = [
    {
        name: 'B12 Break',
        requiredResponse: 'Yes-Si',
        allowedResponses: 'Yes-Si, No',
        questionText:
            'Were you allowed to take all your 10 minutes paid breaks today Se le permitio ' +
            'tomar todos sus 10 minutos de descansos pagados hoy?',
    },
    {
        name: 'B12 Injury',
        requiredResponse: 'No',
        allowedResponses: 'Yes-Si, No',
        questionText: 'Have you been injured today Has sido lastimado hoy?',
    },
    {
        name: 'B12 Lunch',
        requiredResponse: 'Yes-Si',
        allowedResponses: 'Yes-Si, No',
        questionText: 'Today, did you take a 30 minute lunch? Tomaste un lonche de 30 minutos hoy?',
    },
] as const;

/**
 * A 1×1 transparent PNG, base64 — stands in for the handwriting Amy draws on the
 * device's signature pad. The assertion is that the bytes survive the import
 * verbatim, so the image only has to be small and stable.
 */
export const B12_SIGNATURE_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAX+d1zQAAAABJRU5ErkJggg==';

/**
 * B4 phase 2's pack-house-line assignment (`POST /scan/assign-barcode-roll`).
 * Unlike the device-side roll codes in B4-001 (run-unique — the import has no
 * delete endpoint for `EmployeeCodeHistory`), this one is deliberately FIXED:
 * the write is an upsert, so a fixed payload holds exactly one permanent
 * code-history row on employee `6006` across every run — see the B4 plan's
 * Cleanup section.
 */
export const B4_PACK_HOUSE_ROLL = {
    alternateCode: 'B7999900006',
    firstCode: 'B7999900006',
} as const;
