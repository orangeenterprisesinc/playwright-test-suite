import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
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
    sweepFixtureCards,
    type OfficeTimeCard,
} from './timeCardsApi';
import { createCrewTimeIn, punchTime } from './crewTimeInApi';

/**
 * The office half of a Journey B run, the way Amy's recording shows it: the
 * envelope reaches the office (her relay ingests automatically — our UI
 * equivalent is Connectivity ▸ Import ▸ Internet), every punch links to the
 * seeded records, and the rows appear on Transfer to Job Cards after the date
 * range is applied. Cleanup removes the punches again.
 *
 * Transports, selected by IMPORT_TRANSPORT:
 * - `internet` (default) — drive the web UI through the sidebar menus and the
 *   Internet pull screen, so a headed run and its video look like the
 *   recording. Blocked on dev by the relay gates: the test goes red on that
 *   screen with the server's real reason quoted.
 * - `single-folder` — POST the envelope to connectivity/import/single-folder
 *   directly; the importer-contract path, and the shortest route to a proven
 *   import since it needs no relay configuration.
 *
 * Neither can pass on dev today: storage works (WEBPET-1830, fixed 2026-08-12)
 * but the import worker is switched off (`PT_IMPORT_WORKER_DISABLED=true` —
 * WEBPET-2137), so an uploaded file is stored and then never parsed. Both routes
 * feed that one worker, which is why fixing it unblocks both.
 *
 * OFFICE_TRANSPORT_SUBSTITUTE=1 keeps the demo fallback: when the import cannot
 * run, create identical punches via the office API and continue, with an
 * annotation keeping the report honest. That route writes through
 * POST /time-cards/crew-time-in and has never touched storage or the worker, so
 * it behaves identically before and after either fix — it proves Amy's screens,
 * never the pipe into them.
 */

/** What one imported card must look like, keyed by the device's employee code. */
export interface ExpectedCard {
    employeeCode: string;
    employeeId: number;
    fieldId: number;
    jobId: number;
    /**
     * Display values asserted in the Time In side panel. Optional — only the
     * one card {@link verifyImportInOffice} opens a panel for needs them.
     */
    ranchName?: string;
    fieldName?: string;
    /** The panel's "Phase" field, which displays the job's name. */
    jobName?: string;
    employeeName?: string;
    crewName?: string;
    /**
     * The GPS fix text, meaningful only when the import actually ran through
     * the device (`transport === 'device-import'`) — an office-API punch
     * (the OFFICE_TRANSPORT_SUBSTITUTE fallback) carries no GPS.
     */
    gps?: string;
}

export interface OfficeVerificationInput {
    sessionApi: APIRequestContext;
    pages: PageObjects;
    testInfo: TestInfo;
    /** The export envelope being delivered. */
    xml: string;
    crewId: number;
    ranchId: number;
    expected: ExpectedCard[];
    /** Employee ids that must NOT appear (e.g. someone who did not move). */
    absentEmployeeIds?: number[];
    label: string;
    /**
     * The day the punches belong to (defaults to today). B1 and B2 share
     * employees and run in parallel workers against the same tenant, so a spec
     * that punched the same day as its sibling would trip the office's
     * duplicate-Time-In rule and flip its rows from Warning to Blocking — B2
     * therefore punches yesterday.
     */
    punchDate?: Date;
}

export interface OfficeVerificationResult {
    /** Which route actually put the punches in the office. */
    transport: 'device-import' | 'office-api';
    cards: OfficeTimeCard[];
}

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

/** The OFFICE_TRANSPORT_SUBSTITUTE fallback: same punches, office API route. */
async function substituteTransport(
    input: OfficeVerificationInput,
    reason: string,
): Promise<string[]> {
    input.testInfo.annotations.push({
        type: 'office-transport-substituted',
        description:
            `${reason} The punches were created through POST /time-cards/crew-time-in instead, ` +
            'so the office landing and the Transfer to Job Cards screen are verified, but the ' +
            'device→office import itself is NOT.',
    });
    const seeded: string[] = [];
    for (const group of groupByContext(input.expected)) {
        const result = await createCrewTimeIn(input.sessionApi, {
            dateTime: punchTime(7, 15, input.punchDate ?? new Date()),
            crewCounter: input.crewId,
            employeeIds: group.employeeIds,
            ranchCounter: input.ranchId,
            fieldCounter: group.fieldId,
            jobCounter: group.jobId,
        });
        seeded.push(...result.references);
    }
    return seeded;
}

/** The importer-contract path: upload the file, follow the run. */
async function importViaSingleFolder(
    input: OfficeVerificationInput,
): Promise<{ transport: OfficeVerificationResult['transport']; references: string[] }> {
    const upload = await createUploadContext();
    let run;
    try {
        run = await importDeviceExport(upload, input.xml, {
            fileName: `FromDevice-${input.label}-${Date.now()}.xml`,
        });
    } finally {
        await upload.dispose();
    }
    await input.testInfo.attach(`import-run-${input.label}.json`, {
        body: JSON.stringify(run, null, 2),
        contentType: 'application/json',
    });

    if (isStorageUnavailable(run)) {
        if (process.env.OFFICE_TRANSPORT_SUBSTITUTE === '1') {
            return { transport: 'office-api', references: await substituteTransport(input, NO_STORAGE_REASON) };
        }
        expect(
            run.status,
            `Web import is not available: the import run recorded "could not store uploaded ` +
                `file" and stayed '${run.status}'. ${NO_STORAGE_REASON} ` +
                'Set OFFICE_TRANSPORT_SUBSTITUTE=1 to exercise the office half via the API instead.',
        ).toBe('completed');
    }
    expect(run.status, `import run ${run.runId}: ${JSON.stringify(run.files)}`).toBe('completed');
    return { transport: 'device-import', references: referencesInExport(input.xml) };
}

/**
 * Amy's path: sidebar menus → Connectivity ▸ Import ▸ Internet → Trigger
 * Import. The pull drains the office mailbox the envelope was delivered to.
 */
async function importViaInternetUi(
    input: OfficeVerificationInput,
): Promise<{ transport: OfficeVerificationResult['transport']; references: string[] }> {
    const { pages, testInfo, label } = input;

    await pages.leftNav.navigate();
    await pages.leftNav.openViaMenu(
        ['Connectivity', 'Import', 'Internet'],
        '/connectivity/import/internet',
    );
    await pages.importInternet.heading.waitFor({ state: 'visible', timeout: 15_000 });

    const outcome = await pages.importInternet.triggerImport();
    await testInfo.attach(`internet-import-${label}.json`, {
        body: JSON.stringify(outcome, null, 2),
        contentType: 'application/json',
    });
    await testInfo.attach(`internet-import-${label}.png`, {
        body: await pages.importInternet.screenshot(),
        contentType: 'image/png',
    });

    const pulled = outcome.api.status === 'ok' && outcome.api.filesPulled >= 1;
    // 'no-data' with our envelope already delivered is NOT a config failure when
    // specs run in parallel: every worker shares the one office mailbox, so
    // whichever test triggers first drains BOTH envelopes into its own run. The
    // punches still land in the same client DB either way — the reference
    // matching below proves ownership. Only a 'warning' means the pull could not
    // run at all (a closed relay gate), which stays a hard, diagnostic failure.
    const peerDrained = outcome.api.status === 'no-data';
    if (!pulled && !peerDrained && process.env.OFFICE_TRANSPORT_SUBSTITUTE === '1') {
        const reason =
            `The Internet pull could not run (screen: "${outcome.headingText}"; ` +
            `server: "${outcome.api.message || 'no message'}").`;
        return { transport: 'office-api', references: await substituteTransport(input, reason) };
    }
    expect(
        pulled || peerDrained,
        `Web import is not available: Connectivity ▸ Import ▸ Internet showed ` +
            `"${outcome.headingText}" and the server said "${outcome.api.message || 'no message'}". ` +
            `Amy's office ingests from the relay automatically; on this environment the pull needs ` +
            `WEBMAIL_LIVE_SEND_ENABLED=true on the API task, plus a ClientRelayRegistration row ` +
            `with LiveSendEnabled=1 and either a SendPassword (SQL-only) or CopyNumber > 0 — the ` +
            `latter is settable via PUT admin/tm/clients/{id}/relay-registration, so the SQL may ` +
            `be avoidable. These gate the PULL only; everything downstream already works — ` +
            `object storage (WEBPET-1830) and the import worker (WEBPET-2137 / PET-12482) are ` +
            `both fixed, so IMPORT_TRANSPORT=single-folder proves the import today. ` +
            'OFFICE_TRANSPORT_SUBSTITUTE=1 verifies only the office screens, never the import.',
    ).toBe(true);

    if (pulled) {
        // The mailbox can hold envelopes from earlier runs too — wait for every
        // pulled file to finish importing, then rely on reference matching below.
        await pages.importInternet.waitForTerminalFiles(outcome.api.filesPulled);
    } else {
        // A parallel worker's trigger got there first and is importing our
        // envelope in its own run; the reference poll below waits it out.
        testInfo.annotations.push({
            type: 'peer-drained-mailbox',
            description:
                `Trigger Import found the mailbox empty ("${outcome.headingText}") — a concurrent ` +
                'spec drained our envelope into its run. Falling through to reference polling.',
        });
    }
    return { transport: 'device-import', references: referencesInExport(input.xml) };
}

export async function verifyImportInOffice(input: OfficeVerificationInput): Promise<OfficeVerificationResult> {
    const { sessionApi, pages, testInfo, expected, absentEmployeeIds = [], label, crewId, ranchId } = input;

    // Clear this fixture's punches for the target day BEFORE importing. The import
    // is asynchronous on a per-client cadence, so a run whose poll times out still
    // gets its rows minutes later — rows no test ever cleaned up. A leftover punch
    // gives the next run a second one for the same employee on the same day, which
    // the office flags as a duplicate Time In and renders **Blocking** instead of
    // Warning, failing every later run until someone clears it by hand.
    const punchDate = input.punchDate ?? new Date();
    const punchDay = isoDay(punchDate);
    const swept = await sweepFixtureCards(sessionApi, {
        employeeIds: [...expected.map((c) => c.employeeId), ...absentEmployeeIds],
        day: punchDay,
    });
    if (swept.removed || swept.failed) {
        testInfo.annotations.push({
            type: 'pre-run-sweep',
            description:
                `Removed ${swept.removed} leftover punch(es) for this fixture on ${punchDay} ` +
                `(${swept.failed} could not be deleted) — orphans from an earlier run whose ` +
                'import landed after its poll timed out.',
        });
    }

    const { transport, references } =
        process.env.IMPORT_TRANSPORT === 'single-folder'
            ? await importViaSingleFolder(input)
            : await importViaInternetUi(input);

    expect(references, `one reference per punch (${transport})`).toHaveLength(expected.length);

    // Must outlast the import worker's per-client cadence (1 minute on dev):
    // after a peer-drained trigger, our rows only appear once the worker
    // processes the PEER's run, so the default 30s poll is too short.
    const cards = await findByReferences(sessionApi, references, {
        from: punchDay,
        to: punchDay,
        cardType: CARD_TYPE.timeIn,
        timeoutMs: Number(process.env.IMPORT_POLL_TIMEOUT_MS ?? '') || 120_000,
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
            // The device's GPS fix, proven to survive the import. Asserted on the
            // card rather than in the Time In panel: the deployed office build
            // renders no GPS Reading field at all (verified against a card that
            // definitely has one), so the API is the only place the value is
            // observable. Only a real import carries it — an office-API punch has none.
            if (want.gps && transport === 'device-import') {
                expect(
                    String(card!.gpsReading ?? ''),
                    `the device's GpsReading must survive the import for ${want.employeeCode}`,
                ).toBe(want.gps);
            }
            expect(
                card!.programCreated,
                `${transport} rows should have programCreated=${transport === 'device-import'}`,
            ).toBe(transport === 'device-import');
        }
        for (const absent of absentEmployeeIds) {
            expect(cards.map((c) => Number(c.employeeCounter))).not.toContain(absent);
        }

        // ── The screen Amy's recording ends on, reached the way she reaches it ──
        await pages.leftNav.navigate();
        await pages.leftNav.openViaMenu(['Transfer to Job Cards'], '/transfer-to-job-cards');
        const transferPage = pages.transferToJobCards;
        await transferPage.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });

        if (await transferPage.analyzeEnabled()) {
            // Nothing renders until a date range is committed — the step Amy performs.
            await transferPage.applyDateRange(punchDate);
            // Polls until the analyze response lands; asserts the count itself.
            await transferPage.waitForCandidates(cards.length);
            for (const card of cards) {
                await expect(transferPage.rowFor(card.timeCardCounter)).toHaveText(
                    String(card.reference),
                );
            }

            // ── One row's Time In panel: display fields, GPS only on a real import ──
            const panelExpected = expected[0];
            const panelCard = byEmployee.get(panelExpected.employeeId);
            expect(panelCard, 'panel candidate must have a matching office card').toBeDefined();
            await transferPage.openRow(panelCard!.timeCardCounter);
            // Ranch is a custom lookup widget — its displayed name is a real
            // child text node. Field/Phase/Employee/Work Crew/GPS are plain
            // Autocomplete inputs, so the display text lives in `value`, not
            // text content.
            if (panelExpected.ranchName) {
                await expect(transferPage.panelRanchValue).toContainText(panelExpected.ranchName);
            }
            if (panelExpected.fieldName) {
                await expect(transferPage.panelFieldValue).toHaveValue(panelExpected.fieldName);
            }
            if (panelExpected.jobName) {
                await expect(transferPage.panelPhaseValue).toHaveValue(panelExpected.jobName);
            }
            if (panelExpected.employeeName) {
                await expect(transferPage.panelEmployeeValue).toHaveValue(panelExpected.employeeName);
            }
            if (panelExpected.crewName) {
                await expect(transferPage.panelWorkCrewValue).toHaveValue(panelExpected.crewName);
            }
            // Panel GPS, when the build renders it (Amy's recording shows the
            // field; dev's bundle carries the label yet has been seen omitting
            // the control). The card-level assertion above is the authoritative
            // proof either way, so absence is annotated, never failed — the same
            // posture as transfer-grid-not-asserted.
            if (panelExpected.gps && transport === 'device-import') {
                if ((await transferPage.panelGpsValue.count()) > 0) {
                    await expect(transferPage.panelGpsValue).toHaveValue(panelExpected.gps);
                } else {
                    testInfo.annotations.push({
                        type: 'gps-not-rendered-in-panel',
                        description:
                            'The Time In panel rendered no GPS Reading field for a card that ' +
                            'carries a fix (the recording shows one, and the deployed bundle ' +
                            'contains the label). The value itself was asserted on the card ' +
                            'via the API.',
                    });
                }
            }
            await transferPage.cancelPanel();

            // ── Every row is a Time-In-only punch, so each carries the same warning ──
            for (const card of cards) {
                await expect(transferPage.rowStatus(card.timeCardCounter)).toHaveText(/Warning/i);
            }
            const affected = await transferPage.issueGroupAffectedCount(
                'No corresponding Time-Out/Piece-Out',
            );
            // ≥, not ==: dev is a shared tenant, so the day can legitimately
            // hold open punches from other suites or leftover data.
            expect(
                affected,
                'issue group must count at least every imported row',
            ).toBeGreaterThanOrEqual(cards.length);
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
