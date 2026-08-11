import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import type { TransferToJobCardsPage } from '@pages/processing/TransferToJobCardsPage';
import {
    createUploadContext,
    importDeviceExport,
    isStorageUnavailable,
    NO_STORAGE_REASON,
} from './connectivityImportApi';
import {
    CARD_TYPE,
    deleteTimeCard,
    findByReferences,
    isoDay,
    referencesInExport,
    type OfficeTimeCard,
} from './timeCardsApi';
import { createCrewTimeIn, punchTime } from './crewTimeInApi';

/**
 * Collapse the expected cards into the distinct (field, job) contexts they use.
 * B1 has one; B2 has two — the movers' destination and the original the member
 * left behind kept — and a crew punch can only carry one context per call.
 */
function groupByContext(
    expected: ExpectedCard[],
): Array<{ fieldId: number; jobId: number; employeeIds: number[] }> {
    const groups = new Map<string, { fieldId: number; jobId: number; employeeIds: number[] }>();
    for (const card of expected) {
        const key = `${card.fieldId}:${card.jobId}`;
        const group = groups.get(key) ?? {
            fieldId: card.fieldId,
            jobId: card.jobId,
            employeeIds: [],
        };
        group.employeeIds.push(card.employeeId);
        groups.set(key, group);
    }
    return [...groups.values()];
}

/**
 * The office half of a Journey B run: import the envelope the device produced,
 * prove every punch linked to the seeded records, show it on Transfer to Job
 * Cards, then remove the punches again.
 *
 * Shared by B1 and B2 because only the *expectations* differ — B1 expects every
 * card in one field/job, B2 expects the movers in the destination and the member
 * left behind still in the original.
 */

/** What one imported card must look like, keyed by the device's employee code. */
export interface ExpectedCard {
    employeeCode: string;
    employeeId: number;
    fieldId: number;
    jobId: number;
}

export interface OfficeVerificationInput {
    sessionApi: APIRequestContext;
    transferPage: TransferToJobCardsPage;
    testInfo: TestInfo;
    /** The envelope captured from the device. */
    xml: string;
    crewId: number;
    ranchId: number;
    expected: ExpectedCard[];
    /** Employee ids that must NOT appear (e.g. someone who did not move). */
    absentEmployeeIds?: number[];
    label: string;
}

export interface OfficeVerificationResult {
    /** Which route actually put the punches in the office. */
    transport: 'device-import' | 'office-api';
    cards: OfficeTimeCard[];
}

export async function verifyImportInOffice({
    sessionApi,
    transferPage,
    testInfo,
    xml,
    crewId,
    ranchId,
    expected,
    absentEmployeeIds = [],
    label,
}: OfficeVerificationInput): Promise<OfficeVerificationResult> {
    const upload = await createUploadContext();
    let run;
    try {
        run = await importDeviceExport(upload, xml, {
            fileName: `FromDevice-${label}-${Date.now()}.xml`,
        });
    } finally {
        await upload.dispose();
    }
    await testInfo.attach(`import-run-${label}.json`, {
        body: JSON.stringify(run, null, 2),
        contentType: 'application/json',
    });

    // No object storage (dev staging, WEBPET-1830) means the import run records
    // "could not store uploaded file" and never leaves `received`. That FAILS the
    // test by default: a green run must mean the device→office import was actually
    // proven. OFFICE_TRANSPORT_SUBSTITUTE=1 opts into the old fallback — the same
    // punches created through the office API so the landing and the Transfer to
    // Job Cards screen are still exercised (transport substituted, every assertion
    // below unchanged, the annotation + `transport` keep the report honest).
    // The trigger is the exact storage signature, so a real import regression
    // still fails either way.
    let transport: OfficeVerificationResult['transport'] = 'device-import';
    let references: string[];

    if (isStorageUnavailable(run) && process.env.OFFICE_TRANSPORT_SUBSTITUTE !== '1') {
        expect(
            run.status,
            `Web import is not available: the import run recorded "could not store uploaded ` +
                `file" and stayed '${run.status}'. ${NO_STORAGE_REASON} ` +
                'Set OFFICE_TRANSPORT_SUBSTITUTE=1 to exercise the office half via the API instead.',
        ).toBe('completed');
    }

    if (isStorageUnavailable(run)) {
        transport = 'office-api';
        testInfo.annotations.push({
            type: 'office-transport-substituted',
            description:
                `${NO_STORAGE_REASON} The punches were created through ` +
                'POST /time-cards/crew-time-in instead, so the office landing and the Transfer to ' +
                'Job Cards screen are verified, but the device→office import itself is NOT.',
        });

        const seeded: string[] = [];
        // One call per (field, job) pairing, because a crew punch carries a single
        // context — B2's movers and the member left behind need separate calls.
        for (const group of groupByContext(expected)) {
            const result = await createCrewTimeIn(sessionApi, {
                dateTime: punchTime(),
                crewCounter: crewId,
                employeeIds: group.employeeIds,
                ranchCounter: ranchId,
                fieldCounter: group.fieldId,
                jobCounter: group.jobId,
            });
            seeded.push(...result.references);
        }
        references = seeded;
    } else {
        expect(run.status, `import run ${run.runId}: ${JSON.stringify(run.files)}`).toBe('completed');
        references = referencesInExport(xml);
    }

    expect(references, `one reference per punch (${transport})`).toHaveLength(expected.length);

    const today = isoDay();
    const cards = await findByReferences(sessionApi, references, {
        from: today,
        to: today,
        cardType: CARD_TYPE.timeIn,
    });

    // Everything from here is wrapped so the punches are deleted even when an
    // assertion throws — a failed run that leaves rows behind pollutes the next
    // run's grid and the shared dev database (observed: two failed runs left 14
    // punches, and the Transfer screen showed them all as blockers).
    try {
        expect(cards, `office cards for ${label} via ${transport}`).toHaveLength(expected.length);

        const byEmployee = new Map(cards.map((c) => [Number(c.employeeCounter), c]));
        for (const want of expected) {
        // Compare ids, never merely "not null": an unresolved employee code walks a
        // nine-rung fallback ladder that can land on a same-named employee or the
        // "Undefined Employee" row, which passes a non-null check while pointing at
        // the wrong person.
            const card = byEmployee.get(want.employeeId);
            expect(card, `no imported card linked to employee ${want.employeeCode}`).toBeDefined();
            expect(card!.fieldCounter).toBe(want.fieldId);
            expect(card!.jobCounter).toBe(want.jobId);
            expect(card!.crewCounter).toBe(crewId);
            expect(card!.ranchCounter).toBe(ranchId);
            // `programCreated` distinguishes the two routes — the import mapper
            // stamps it true, an office-API write leaves it false. Asserting it per
            // transport proves the rows came from the route this run actually used,
            // so a silent fallback can never masquerade as a successful import.
            expect(
                card!.programCreated,
                `${transport} rows should have programCreated=${transport === 'device-import'}`,
            ).toBe(transport === 'device-import');
        }
        for (const absent of absentEmployeeIds) {
            expect(cards.map((c) => Number(c.employeeCounter))).not.toContain(absent);
        }

        // ── The screen Amy's recording ends on ────────────────────────────────
        // Always runs, whichever transport delivered the punches: this is the half
        // of the journey the recording finishes on, and it is what makes the web
        // app visible in the report alongside the emulator.
        await transferPage.goto();
        await expect(transferPage.pageRoot).toBeVisible();

        if (await transferPage.analyzeEnabled()) {
            // Nothing renders until a date range is committed — the step Amy performs.
            await transferPage.applyDateRange();
            // Polls until the analyze response lands; asserts the count itself.
            await transferPage.waitForCandidates(cards.length);
            for (const card of cards) {
                await expect(transferPage.rowFor(card.timeCardCounter)).toHaveText(
                    String(card.reference),
                );
            }
        } else {
            // The grid is fed by an endpoint behind a server flag; without it no
            // row can ever render, so asserting one would test the flag, not the data.
            testInfo.annotations.push({
                type: 'transfer-grid-not-asserted',
                description:
                    'The Transfer to Job Cards grid is populated by POST /transfer-to-job-cards/analyze, ' +
                    'which is disabled on this server (PT_TRANSFER_ANALYZE_ENABLED). The API-level link ' +
                    'assertions above still ran.',
            });
        }
        await testInfo.attach(`transfer-to-job-cards-${label}.png`, {
            body: await transferPage.screenshot(),
            contentType: 'image/png',
        });
    } finally {
        // ── Cleanup: never leave punches on shared dev data, pass or fail ──────
        for (const card of cards) {
            const { deleted, status } = await deleteTimeCard(sessionApi, card.timeCardCounter);
            if (!deleted) {
                await testInfo.attach(`cleanup-warning-${card.timeCardCounter}`, {
                    body: `DELETE time-cards/${card.timeCardCounter} returned ${status}`,
                    contentType: 'text/plain',
                });
            }
        }
    }

    return { transport, cards };
}
