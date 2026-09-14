/**
 * Transfer to Job Cards — Multi-Edit dialog field matrix (webpet-multi-edit-field-matrix
 * plan). Two zero-mutation probes only — see the plan's "Implementation approach" for
 * the seeded round-trip persistence pass this deliberately leaves for later:
 *
 *   1. Contract matrix — every `multi-edit-field-select` option's label, and which
 *      Value control renders for it (plan Finding 1 + Finding 2).
 *   2. Guard behaviour — which fields let Continue stay enabled with a blank Value
 *      (the relaxed guard the plan's Finding 5 describes) vs. which still block it.
 *
 * Neither test seeds or deletes anything: they ride whatever the busiest existing Time
 * In day already has (mirroring time-in.spec.ts's `findPopulatedDay`), open the dialog,
 * read it, and Cancel. `multi-edit-submit` (Continue), the review stage's Apply, a real
 * transfer, and a job-card delete are never touched — see the Job Card mass-delete
 * incident note for why that line does not get crossed.
 */
import { apiUrl } from '@config/webpetEnv';
import { expect, test, type Page } from '@fixtures/webpet.fixture';
import { TransferToJobCardsPage } from '@pages/processing/TransferToJobCardsPage';
import type { MultiEditFieldValue } from '@components/webpet/WebpetMultiEditDialogComponent';

/**
 * A day carrying at least `min` Time In rows, discovered from the API — the same
 * approach time-in.spec.ts uses (`findPopulatedDay`, not exported from there, hence the
 * duplicate here) rather than seeding, since this pass has no `createTimeIn` factory
 * yet (plan's Implementation approach item 3, deliberately out of scope).
 */
async function findPopulatedDay(
    request: { get: (url: string) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> },
    min = 2,
): Promise<string | null> {
    const res = await request.get(apiUrl('/api/time-cards/time-in'));
    if (!res.ok()) return null;
    const rows = (await res.json()) as Array<{ dateTime?: string | null }>;
    const perDay = new Map<string, number>();
    for (const r of Array.isArray(rows) ? rows : []) {
        const day = (r.dateTime ?? '').slice(0, 10);
        if (day) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    const best = [...perDay.entries()].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
}

/**
 * Parses a `YYYY-MM-DD` day into a local-time `Date` — avoids the UTC-midnight shift a
 * bare `new Date(day)` would apply before `applyDateRange`'s local
 * getFullYear/getMonth/getDate comparisons.
 */
function localDate(day: string): Date {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Opens the Transfer grid on the busiest available day, selects its first two data
 * rows, and opens Multi-Edit on them. Returns null (never opens the UI) when no day on
 * this environment carries 2+ analyzable candidates — the caller turns that into a skip
 * rather than a false failure, exactly like time-in.spec.ts's populated-day guard.
 */
async function openMultiEditOnPopulatedDay(
    page: Page,
    transfer: TransferToJobCardsPage,
    request: { get: (url: string) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }> },
): Promise<boolean> {
    const day = await findPopulatedDay(request, 2);
    if (day === null) return false;

    await transfer.goto();
    await transfer.applyDateRange(localDate(day));
    await transfer.analyze();

    let candidateCount = 0;
    try {
        candidateCount = await transfer.waitForCandidates(2, 45_000);
    } catch {
        candidateCount = 0;
    }
    if (candidateCount < 2) return false;

    // Data rows only (header/filter rows carry no `role="cell"`) — same structural
    // filter WebpetDataGridComponent.dataRows uses.
    const dataRows = transfer.rows.filter({ has: page.getByRole('cell') });
    const rowA = dataRows.nth(0);
    const rowB = dataRows.nth(1);

    // Reference is column index 12 (plan Finding 3) — read it back rather than assume a
    // counter, then select through the page object's own by-reference lookup.
    const referenceA = ((await transfer.cellAt(rowA, 12).textContent()) ?? '').trim();
    const referenceB = ((await transfer.cellAt(rowB, 12).textContent()) ?? '').trim();
    await transfer.selectRowByReference(referenceA);
    await transfer.selectRowByReference(referenceB);

    await transfer.openMultiEdit();
    return true;
}

/** Plan Finding 1 + Finding 2 — every field's option value, exact label, and Value-control kind. */
const FIELD_MATRIX: {
    value: MultiEditFieldValue;
    label: string;
    kind: 'fk' | 'dateTime' | 'dateOnly' | 'timeOnly' | 'text' | 'choice' | 'number';
}[] = [
    { value: 'jobCounter', label: 'Job', kind: 'fk' },
    { value: 'crewCounter', label: 'Crew', kind: 'fk' },
    { value: 'ranchCounter', label: 'Ranch', kind: 'fk' },
    { value: 'fieldCounter', label: 'Field', kind: 'fk' },
    { value: 'workOrderCounter', label: 'Work Order', kind: 'fk' },
    { value: 'varietyCounter', label: 'Variety', kind: 'fk' },
    { value: 'runCounter', label: 'Run', kind: 'fk' },
    { value: 'agRowCounter', label: 'Row', kind: 'fk' },
    { value: 'employeeCounter', label: 'Employee', kind: 'fk' },
    { value: 'dateTime', label: 'Date, Time', kind: 'dateTime' },
    { value: 'dateOnly', label: 'Date', kind: 'dateOnly' },
    { value: 'timeOnly', label: 'Time', kind: 'timeOnly' },
    { value: 'traceabilityCode', label: 'Traceability', kind: 'text' },
    { value: 'memo', label: 'Memo', kind: 'text' },
    { value: 'cardType', label: 'Type', kind: 'choice' },
    { value: 'transferred', label: 'Transferred', kind: 'choice' },
    { value: 'numOfPieces', label: 'Number of Pieces', kind: 'number' },
    { value: 'breakTime', label: 'Meal Length', kind: 'number' },
];

/** The 8 non-Employee fk fields plus the four other clearable fields — the relaxed guard (plan Finding 5). */
const BLANK_ENABLED_FIELDS: MultiEditFieldValue[] = [
    'jobCounter',
    'crewCounter',
    'ranchCounter',
    'fieldCounter',
    'workOrderCounter',
    'varietyCounter',
    'runCounter',
    'agRowCounter',
    'traceabilityCode',
    'memo',
    'numOfPieces',
    'breakTime',
];

/** Employee (never clearable) plus the fields whose guard never relaxed. */
const BLANK_DISABLED_FIELDS: MultiEditFieldValue[] = [
    'employeeCounter',
    'dateTime',
    'dateOnly',
    'timeOnly',
    'cardType',
    'transferred',
];

const SKIP_REASON =
    'no day on this environment carries 2+ analyzable transfer candidates — dev data insufficient for this zero-mutation probe';

test.describe('Transfer to Job Cards — Multi-Edit field matrix', { tag: ['@WebPet', '@wp-input', '@wp-transfer', '@WPBatch15'] }, () => {

    test('[Transfer] Verify that the Multi-Edit dialog offers every licensed field with its exact label and value control.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0412' },
    }, async ({ page, request }) => {
        // Date-range + Analyze + an 18-way field walk comfortably exceeds the parity
        // project's 30s test budget (plan's Implementation approach item 1).
        test.setTimeout(90_000);

        const transfer = new TransferToJobCardsPage(page);
        const opened = await openMultiEditOnPopulatedDay(page, transfer, request);
        test.skip(!opened, SKIP_REASON);

        const multiEdit = transfer.multiEdit;
        await expect(multiEdit.dialog).toBeVisible();

        const options = await multiEdit.fieldOptions();
        const gpsPresent = options.some((o) => o.label === 'GPS Reading');
        if (!gpsPresent) {
            test.info().annotations.push({
                type: 'gps-module-gate',
                description:
                    "GPS Reading is absent — useModule('GPS') is off (dev reads PT_MODULES; the admin panel cannot enable it). The label assertion below self-enables if it is ever licensed.",
            });
        }
        const actualLabels = options.map((o) => o.label).filter((label) => label !== 'GPS Reading');
        expect(actualLabels).toEqual(FIELD_MATRIX.map((f) => f.label));

        for (const entry of FIELD_MATRIX) {
            await multiEdit.selectField(entry.value);

            switch (entry.kind) {
                case 'fk':
                    await expect(multiEdit.fkCombobox(entry.value)).toBeVisible();
                    break;
                case 'dateTime':
                    await expect(multiEdit.dateTimeModeSelect).toBeVisible();
                    await expect(multiEdit.dateTimeExactInput).toBeVisible();
                    await multiEdit.dateTimeModeSelect.selectOption({ label: 'Interval' });
                    await expect(multiEdit.dateTimeIntervalFromInput).toBeVisible();
                    await expect(multiEdit.dateTimeIntervalToInput).toBeVisible();
                    break;
                case 'dateOnly':
                    await expect(multiEdit.dateInput).toBeVisible();
                    await expect(multiEdit.dateInput).toHaveAttribute('type', 'date');
                    break;
                case 'timeOnly':
                    await expect(multiEdit.timeInput).toBeVisible();
                    await expect(multiEdit.timeInput).toHaveAttribute('type', 'time');
                    break;
                case 'text':
                    if (entry.value === 'traceabilityCode') {
                        await expect(multiEdit.textInputControl).toBeVisible();
                        await expect(multiEdit.textInputControl).toHaveAttribute('maxlength', '100');
                    } else {
                        await expect(multiEdit.textAreaControl).toBeVisible();
                        await expect(multiEdit.textAreaControl).toHaveAttribute('maxlength', '4000');
                    }
                    break;
                case 'choice': {
                    await expect(multiEdit.choiceSelect).toBeVisible();
                    const choiceLabels = await multiEdit.choiceSelect.locator('option').allTextContents();
                    // The native select leads with a placeholder option; the plan's
                    // transcription dropped it and spelled Non-Labor unhyphenated.
                    if (entry.value === 'cardType') {
                        expect(choiceLabels).toEqual([
                            'Select a value…',
                            'Time Out',
                            'Time In',
                            'Signature',
                            'Non-Labor',
                        ]);
                    } else {
                        expect(choiceLabels).toEqual(['Select a value…', 'Yes', 'No']);
                    }
                    break;
                }
                case 'number':
                    await expect(multiEdit.numberInput).toBeVisible();
                    await expect(multiEdit.numberInput).toHaveAttribute('type', 'number');
                    await expect(multiEdit.numberInput).toHaveAttribute('min', '0');
                    break;
            }
        }

        // Never Continue/Apply — see the file header and the plan's hard constraints.
        await multiEdit.cancel();
    });

    test('[Transfer] Verify that the relaxed guard lets a blank value through for every clearable field and still blocks the rest.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0413' },
    }, async ({ page, request }) => {
        test.setTimeout(60_000);

        const transfer = new TransferToJobCardsPage(page);
        const opened = await openMultiEditOnPopulatedDay(page, transfer, request);
        test.skip(!opened, SKIP_REASON);

        const multiEdit = transfer.multiEdit;

        for (const field of BLANK_ENABLED_FIELDS) {
            await multiEdit.selectField(field);
            await expect(multiEdit.continueButton, `${field} should allow a blank value (relaxed guard)`).toBeEnabled();
        }
        for (const field of BLANK_DISABLED_FIELDS) {
            await multiEdit.selectField(field);
            await expect(multiEdit.continueButton, `${field} should still block a blank value`).toBeDisabled();
        }

        await multiEdit.cancel();
    });

});
