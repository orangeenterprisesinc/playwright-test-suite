import { expect, type APIRequestContext, type Locator, type TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import {
    annotateIfImportCircuitOpen,
    createUploadContext,
    importDeviceExport,
    isStorageUnavailable,
    newImportDeadline,
    NO_STORAGE_REASON,
    waitForImportFiles,
    type ImportDeadline,
    type ImportFileResult,
    type ImportRunResult,
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
    /**
     * Omit both for a punch the office links to no work context. A time-out row
     * ships `Employee` and `Crew` only (`LookupContents="Employee:Code|Crew:Code"`),
     * so the office stores null Field, Job *and* Ranch for it. Omitting them
     * skips those three asserts — it does not prove the nulls, so a spec whose
     * requirement is the nulls must assert them itself on the returned cards.
     */
    fieldId?: number | null;
    jobId?: number | null;
    /**
     * The ranch the office must have linked. `null` asserts none — a record that carried no
     * `<Ranch>` (B6's badge piece-out). Omitted keeps the derived rule below.
     */
    ranchId?: number | null;
    /**
     * The card's own `<Reference>`. Match by this when set instead of by
     * employee — needed when one employee has more than one expected card in
     * the same run (B3: two Time In records for the same person), where a
     * by-employee map would collapse them into one.
     */
    reference?: string;
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
    /**
     * The card's `TraceabilityCode` — a sticker roll's first code (B4).
     * Unlike GPS this is carried by both transports, so the assertion below
     * needs no `transport` guard.
     */
    traceabilityCode?: string;
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
     * The exact device filename this attempt sent (`exportFileName(prefix)` at
     * the call site, already computed there for `sendToRelay`). Drives the
     * this-attempt/sibling-attempt split in {@link importViaInternetUi} — a
     * retry sharing a lineage-stable prefix (`lineagePrefix`) can see an earlier
     * attempt's own envelope in the same mailbox drain.
     */
    fileName: string;
    /**
     * The day the punches belong to (defaults to today). B1 and B2 share
     * employees and run in parallel workers against the same tenant, so a spec
     * that punched the same day as its sibling would trip the office's
     * duplicate-Time-In rule and flip its rows from Warning to Blocking — B2
     * therefore punches yesterday.
     */
    punchDate?: Date;
    /**
     * cardType to query for. Defaults to `CARD_TYPE.timeIn`; pass `null` to
     * query every type, which one envelope mixing Time-Ins and Time-Outs (B11's
     * crew-out) needs — a single cardType would find only half its references.
     */
    cardType?: number | null;
}

/** {@link deliverAndVerifyCards}'s input — the office UI is optional there (only the Internet pull drives it). */
export type DeliverInput = Omit<OfficeVerificationInput, 'pages'> & {
    pages?: PageObjects;
    /** Pre-run sweep of leftover fixture punches. Defaults to true. */
    sweep?: boolean;
    /** Forces the import route for this call; without it IMPORT_TRANSPORT decides (internet by default). */
    via?: 'single-folder' | 'internet';
};

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
        // Unlinked punches (a time-out carries no field/job) have no context to
        // group by, and POST /time-cards/crew-time-in cannot create one anyway.
        if (card.fieldId == null || card.jobId == null) continue;
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
    input: DeliverInput,
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

/**
 * {@link deliverAndVerifyCards}'s transport result — a `thisAttemptFailures`
 * gate on top of the plain transport/references pair, so a rejected-but-benign
 * retry envelope (§C) can be asserted after the office read, not before it.
 */
interface TransportResult {
    transport: OfficeVerificationResult['transport'];
    references: string[];
    thisAttemptFailures: ImportFileResult[];
    /**
     * True when no pull ever returned a run carrying this attempt's file — a peer
     * importer drained it into its own run. The rows still land, but only once
     * that peer's run is processed, and the wait already spent belonged to the
     * peer's run, so the office read below needs a budget of its own.
     */
    peerDrained: boolean;
}

/** The importer-contract path: upload the file, follow the run. */
async function importViaSingleFolder(
    input: DeliverInput,
    deadline: ImportDeadline,
): Promise<TransportResult> {
    const upload = await createUploadContext();
    let run;
    try {
        run = await importDeviceExport(upload, input.xml, {
            fileName: `FromDevice-${input.label}-${Date.now()}.xml`,
            deadline,
            testInfo: input.testInfo,
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
            return {
                transport: 'office-api',
                references: await substituteTransport(input, NO_STORAGE_REASON),
                thisAttemptFailures: [],
                peerDrained: false,
            };
        }
        expect(
            run.status,
            `Web import is not available: the import run recorded "could not store uploaded ` +
                `file" and stayed '${run.status}'. ${NO_STORAGE_REASON} ` +
                'Set OFFICE_TRANSPORT_SUBSTITUTE=1 to exercise the office half via the API instead.',
        ).toBe('completed');
    }
    expect(run.status, `import run ${run.runId}: ${JSON.stringify(run.files)}`).toBe('completed');
    return {
        transport: 'device-import',
        references: referencesInExport(input.xml),
        thisAttemptFailures: [],
        peerDrained: false,
    };
}

/**
 * Split one run's failed files into the three buckets `importViaInternetUi`
 * needs: not our lineage (existing `stale-envelopes-failed`, never asserted),
 * our lineage but an earlier attempt (`sibling-attempt-envelope-failed`, never
 * asserted — a retry under a lineage-stable prefix can see its own earlier
 * attempt in the same mailbox drain), and this attempt (returned, asserted by
 * the caller only after the office read).
 */
function collectFailures(
    run: ImportRunResult,
    isOurLineage: (f: ImportFileResult) => boolean,
    isThisAttempt: (f: ImportFileResult) => boolean,
    testInfo: TestInfo,
): ImportFileResult[] {
    const fileNameOf = (f: ImportFileResult) => String((f as { filename?: string }).filename ?? f.fileName ?? '');
    const failedFiles = run.files.filter((f) => String(f.status) === 'failed');
    const stale = failedFiles.filter((f) => !isOurLineage(f));
    if (stale.length) {
        testInfo.annotations.push({
            type: 'stale-envelopes-failed',
            description:
                `The drain also pulled ${stale.length} older envelope(s) that failed to import — not this ` +
                `run's, so not asserted: ${stale.map((f) => `${fileNameOf(f)}: ${String(f.message ?? '').slice(0, 160)}`).join(' | ')}`,
        });
    }
    const ourLineageFailures = failedFiles.filter(isOurLineage);
    const siblingAttempt = ourLineageFailures.filter((f) => !isThisAttempt(f));
    if (siblingAttempt.length) {
        testInfo.annotations.push({
            type: 'sibling-attempt-envelope-failed',
            description:
                'An earlier attempt of this same test failed to import (not this attempt\'s own file, ' +
                `so not asserted): ${siblingAttempt.map((f) => `${fileNameOf(f)}: ${String(f.message ?? '').slice(0, 160)}`).join(' | ')}`,
        });
    }
    return ourLineageFailures.filter(isThisAttempt);
}

/**
 * Amy's path: sidebar menus → Connectivity ▸ Import ▸ Internet → Trigger
 * Import. The pull drains the office mailbox the envelope was delivered to.
 */
async function importViaInternetUi(
    input: DeliverInput,
    deadline: ImportDeadline,
): Promise<TransportResult> {
    const { pages, testInfo, label, fileName, sessionApi } = input;
    if (!pages) {
        throw new Error(`${label}: the Internet pull drives Connectivity ▸ Import ▸ Internet — pass pages or set IMPORT_TRANSPORT=single-folder`);
    }

    await pages.leftNav.navigate();
    await pages.leftNav.openViaMenu(
        ['Connectivity', 'Import', 'Internet'],
        '/connectivity/import/internet',
    );
    await pages.importInternet.heading.waitFor({ state: 'visible', timeout: 15_000 });

    const references = referencesInExport(input.xml);
    const prefix = references[0]?.split('-')[3] ?? '';
    const fileNameOf = (f: ImportFileResult) => String((f as { filename?: string }).filename ?? f.fileName ?? '');
    // Drives WAITING: stable across retries of one test under `lineagePrefix()`,
    // so an earlier attempt's late envelope still counts as ours for that purpose.
    const isOurLineage = (f: ImportFileResult) =>
        (prefix !== '' && fileNameOf(f).endsWith(`-${prefix}.xml`)) ||
        references.some((r) => String(f.message ?? '').includes(r));
    // Drives the FAILURE assertion: only the exact file this attempt uploaded.
    const isThisAttempt = (f: ImportFileResult) => fileNameOf(f) === fileName;

    let outcome = await pages.importInternet.triggerImport();
    await testInfo.attach(`internet-import-${label}.json`, {
        body: JSON.stringify(outcome, null, 2),
        contentType: 'application/json',
    });
    await testInfo.attach(`internet-import-${label}.png`, {
        body: await pages.importInternet.screenshot(),
        contentType: 'image/png',
    });

    let pulled = outcome.api.status === 'ok' && outcome.api.filesPulled >= 1;
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
        return {
            transport: 'office-api',
            references: await substituteTransport(input, reason),
            thisAttemptFailures: [],
            peerDrained: false,
        };
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

    let thisAttemptFailures: ImportFileResult[] = [];
    // Cleared as soon as any pull returns a run carrying this attempt's file.
    let ourFileNeverPulled = true;

    // Up to two pulls: the trigger above, and one re-trigger when the run we got
    // holds none of our files — a peer's concurrent trigger can drain our
    // envelope into its own run before ours ever sees it (2026-09-16).
    for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!pulled) {
            testInfo.annotations.push({
                type: 'peer-drained-mailbox',
                description:
                    attempt === 0
                        ? `Trigger Import found the mailbox empty ("${outcome.headingText}") — a concurrent ` +
                          'spec drained our envelope into its run. Falling through to reference polling.'
                        : `Re-trigger pulled ${outcome.api.filesPulled} file(s), none this attempt's ` +
                          `("${outcome.headingText}") — falling through to reference polling.`,
            });
            break;
        }
        // The mailbox can hold envelopes from earlier runs too — the screen lists
        // one row per pulled file, but only OUR file's outcome matters here.
        await pages.importInternet.waitForFileRows(outcome.api.filesPulled);
        // A `Failed` badge is terminal too, and the screen never shows why. Read
        // the run so a failed file fails here with the worker's own message
        // (e.g. "could not read stored file") instead of surfacing three minutes
        // later as a bare "0 cards" from the reference poll.
        const run = await waitForImportFiles(sessionApi, outcome.api.runId, isOurLineage, deadline, testInfo);
        await testInfo.attach(`internet-import-run-${label}-${attempt}.json`, {
            body: JSON.stringify(run, null, 2),
            contentType: 'application/json',
        });
        if (run.oursPresent) {
            ourFileNeverPulled = false;
            thisAttemptFailures = collectFailures(run, isOurLineage, isThisAttempt, testInfo);
            break;
        }
        if (attempt === 0) {
            // A no-data answer from this re-trigger is peer-drained, not a config
            // failure — do not re-run the pulled || peerDrained expect against it.
            outcome = await pages.importInternet.triggerImport();
            await testInfo.attach(`internet-import-retrigger-${label}.json`, {
                body: JSON.stringify(outcome, null, 2),
                contentType: 'application/json',
            });
            pulled = outcome.api.status === 'ok' && outcome.api.filesPulled >= 1;
        } else {
            testInfo.annotations.push({
                type: 'peer-drained-mailbox',
                description:
                    `Both pulls returned runs holding none of this attempt's file — a concurrent ` +
                    'importer drained it. Falling through to reference polling.',
            });
        }
    }

    return { transport: 'device-import', references, thisAttemptFailures, peerDrained: ourFileNeverPulled };
}

/**
 * Deliver the envelope through the configured transport and confirm the office
 * cards it produced link by id to every expected record — the API-level half of
 * a Journey B run, with no UI and no cleanup. {@link verifyImportInOffice} wraps
 * this with the Transfer to Job Cards screen and teardown.
 */
export async function deliverAndVerifyCards(input: DeliverInput): Promise<OfficeVerificationResult> {
    const { sessionApi, testInfo, expected, absentEmployeeIds = [], crewId, ranchId, label, sweep = true } = input;
    const cardType = input.cardType === undefined ? CARD_TYPE.timeIn : input.cardType;
    const punchDate = input.punchDate ?? new Date();
    const punchDay = isoDay(punchDate);

    // Clear this fixture's punches for the target day BEFORE importing. The import
    // is asynchronous on a per-client cadence, so a run whose poll times out still
    // gets its rows minutes later — rows no test ever cleaned up. A leftover punch
    // gives the next run a second one for the same employee on the same day, which
    // the office flags as a duplicate Time In and renders **Blocking** instead of
    // Warning, failing every later run until someone clears it by hand.
    //
    // All card types: a stray Time-Out for a fixture employee pairs with our
    // Time-In and silently removes the incomplete-time-in warning the grid
    // assertions depend on.
    if (sweep) {
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
    }

    // One budget for the whole delivery: transport wait and the office read below
    // share it instead of each getting a full deadline of its own.
    const deadline = newImportDeadline();
    annotateIfImportCircuitOpen(testInfo);

    // The scenario's own transport wins; without one IMPORT_TRANSPORT decides, as before.
    const via = input.via ?? (process.env.IMPORT_TRANSPORT === 'single-folder' ? 'single-folder' : 'internet');
    const { transport, references, thisAttemptFailures, peerDrained } =
        via === 'single-folder' ? await importViaSingleFolder(input, deadline) : await importViaInternetUi(input, deadline);

    expect(references, `one reference per punch (${transport})`).toHaveLength(expected.length);

    // Must outlast the import worker's per-client cadence (1 minute on dev):
    // after a peer-drained trigger, our rows only appear once the worker
    // processes the PEER's run, so the default 30s poll is too short.
    const cards = await findByReferences(sessionApi, references, {
        from: punchDay,
        to: punchDay,
        // `null` means every type — listTimeCards omits the filter on undefined.
        cardType: cardType ?? undefined,
        // A peer-drained envelope spent the wait above on someone ELSE's run, so
        // the rows are still coming and this read would otherwise start with an
        // exhausted budget — observed 2026-09-16, B4 read 0 cards instantly.
        deadline: peerDrained ? newImportDeadline() : deadline,
        testInfo,
    });

    // Deferred this-attempt assertion: correct whether the importer upserts
    // duplicate rows or rejects them outright — either is benign under a
    // lineage-stable prefix, so this must not assume which happened.
    if (thisAttemptFailures.length) {
        if (cards.length >= expected.length) {
            testInfo.annotations.push({
                type: 'this-attempt-file-rejected-rows-preexisting',
                description:
                    "This attempt's own envelope was rejected by the importer " +
                    `(${thisAttemptFailures.map((f) => String(f.message ?? '').slice(0, 160)).join(' | ')}), but every ` +
                    'expected row is already present — a sibling attempt under the same lineage-stable ' +
                    'prefix delivered identical rows first.',
            });
        } else {
            expect(
                thisAttemptFailures,
                `this attempt's own envelope failed to import: ${JSON.stringify(thisAttemptFailures)}`,
            ).toHaveLength(0);
        }
    }

    expect(cards, `office cards for ${label} via ${transport}`).toHaveLength(expected.length);

    const byReference = new Map(cards.map((c) => [String(c.reference ?? ''), c]));
    const byEmployee = new Map(cards.map((c) => [Number(c.employeeCounter), c]));
    for (const want of expected) {
        // Compare ids, never merely "not null": an unresolved employee code walks a
        // nine-rung fallback ladder that can land on a same-named employee or the
        // "Undefined Employee" row, which passes a non-null check while pointing at
        // the wrong person.
        const card = want.reference ? byReference.get(want.reference) : byEmployee.get(want.employeeId);
        expect(card, `no imported card linked to employee ${want.employeeCode}`).toBeDefined();
        expect(card!.employeeCounter).toBe(want.employeeId);
        expect(card!.crewCounter).toBe(crewId);
        // A card that declares no field/job is an unlinked punch (a time-out):
        // the device sends no work context for it, so Ranch is null too and the
        // call-level ranchId does not apply.
        if (want.fieldId !== undefined) {
            expect(card!.fieldCounter).toBe(want.fieldId);
        }
        if (want.jobId !== undefined) {
            expect(card!.jobCounter).toBe(want.jobId);
        }
        // A stated ranch wins (null = the record carried none); otherwise a card with a work
        // context carries the call's ranch, as every caller before B6 assumed.
        const hasContext = (want.fieldId ?? undefined) !== undefined || (want.jobId ?? undefined) !== undefined;
        const wantRanchId = want.ranchId === undefined ? (hasContext ? ranchId : undefined) : want.ranchId;
        if (wantRanchId !== undefined) {
            expect(card!.ranchCounter).toBe(wantRanchId);
        }
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
        // The roll's first sticker code (B4), proven to survive the import
        // verbatim — carried by both transports, unlike GPS, so no transport guard.
        if (want.traceabilityCode) {
            expect(
                String(card!.traceabilityCode ?? ''),
                `the device's TraceabilityCode must survive the import verbatim for ${want.employeeCode}`,
            ).toBe(want.traceabilityCode);
        }
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

    return { transport, cards };
}

/**
 * Best-effort teardown of imported cards. Never lets a delete failure turn a
 * green assertion red — it only records what could not be removed.
 */
export async function cleanupCards(
    sessionApi: APIRequestContext,
    cards: OfficeTimeCard[],
    testInfo: TestInfo,
): Promise<void> {
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

export interface TransferGridInput {
    pages: PageObjects;
    testInfo: TestInfo;
    cards: OfficeTimeCard[];
    expected: ExpectedCard[];
    transport: OfficeVerificationResult['transport'];
    punchDate: Date;
    label: string;
    /** Row status pattern and issue-group title; defaults are the Time-In-only values every caller asserted so far. */
    grid?: { status?: string; issueGroup?: string };
}

export interface TransferGridResult {
    /** Every issue group's text, or null when the grid could not be asserted (analyze flag off, or the analyze job lost). */
    issueGroups: string[] | null;
}

/** The Transfer to Job Cards half of {@link verifyImportInOffice}: menus → date range → analyze → rows, panel, statuses, issue group, screenshot. */
export async function assertTransferGrid(input: TransferGridInput): Promise<TransferGridResult> {
    const { pages, testInfo, cards, expected, transport, punchDate, label } = input;
    const statusPattern = new RegExp(input.grid?.status ?? 'Warning', 'i');
    const issueGroupTitle = input.grid?.issueGroup ?? 'Time-In has no closing punch';
    let issueGroups: string[] | null = null;

    // ── The screen Amy's recording ends on, reached the way she reaches it ──
    await pages.leftNav.navigate();
    await pages.leftNav.openViaMenu(['Transfer to Job Cards'], '/transfer-to-job-cards');
    const transferPage = pages.transferToJobCards;
    await transferPage.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });

    if (await transferPage.analyzeEnabled()) {
        // Nothing renders until a date range is committed and analyzed — the
        // two steps Amy performs.
        await transferPage.applyDateRange(punchDate);
        await transferPage.analyze();
        // Null means the analyze job was lost between processes (a 404
        // not_found on GET .../analyze/{jobId}, WEBPET-1907 class) and every
        // retry the page object attempted still lost it. Gate the whole grid
        // block on it, exactly as the analyzeEnabled() === false branch does.
        const candidateCount = await transferPage.tryWaitForCandidates(cards.length);
        if (candidateCount === null) {
            testInfo.annotations.push({
                type: 'transfer-grid-not-asserted',
                description:
                    `analyze job lost between processes ×${transferPage.analyzeRetryCount} — ` +
                    'GET …/transfer-to-job-cards/analyze/{jobId} → 404 not_found, per-process job ' +
                    'store, WEBPET-1907 class; the API-level link assertions above still ran.',
            });
        } else {
            for (const card of cards) {
                await expect(transferPage.rowFor(card.timeCardCounter)).toHaveText(
                    String(card.reference),
                );
            }

            // ── One row's Time In panel: display fields, GPS only on a real import ──
            // The card whose display names the scenario bound (`panel: true`); the first card when none did.
            const panelExpected = expected.find((c) => c.ranchName || c.fieldName || c.jobName || c.employeeName || c.crewName) ?? expected[0];
            const byEmployee = new Map(cards.map((c) => [Number(c.employeeCounter), c]));
            const byReference = new Map(cards.map((c) => [String(c.reference ?? ''), c]));
            const panelCard = panelExpected.reference
                ? byReference.get(panelExpected.reference)
                : byEmployee.get(panelExpected.employeeId);
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
                await expect(transferPage.rowStatus(card.timeCardCounter)).toHaveText(statusPattern);
            }
            // The group carries the exception resolver's short title (the legacy
            // "No corresponding Time-Out/Piece-Out…" text is now the detail message).
            const affected = await transferPage.issueGroupAffectedCount(issueGroupTitle);
            // ≥, not ==: dev is a shared tenant, so the day can legitimately
            // hold open punches from other suites or leftover data. The group
            // counts affected EMPLOYEES, not rows — B3 imports two cards for one
            // person and the panel reports 1 (observed 2026-08-26).
            const affectedEmployees = new Set(cards.map((c) => Number(c.employeeCounter))).size;
            expect(
                affected,
                'issue group must count at least every imported employee',
            ).toBeGreaterThanOrEqual(affectedEmployees);
            issueGroups = await transferPage.issueGroupTexts();
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
    return { issueGroups };
}

export interface TransferGridRowInput {
    pages: PageObjects;
    testInfo: TestInfo;
    cards: OfficeTimeCard[];
    /** The card whose row the caller asserts on. */
    card: OfficeTimeCard;
    punchDate: Date;
    label: string;
}

/**
 * The narrow Transfer to Job Cards read: menus → date range → analyze → one card's row, returned
 * for the caller to assert its cells on. `null` when the analyze flag is off (annotated exactly as
 * {@link assertTransferGrid} does), so a caller can skip its row assertions without a second guard.
 */
export async function transferGridRowFor(input: TransferGridRowInput): Promise<Locator | null> {
    const { pages, testInfo, cards, card, punchDate, label } = input;
    await pages.leftNav.navigate();
    await pages.leftNav.openViaMenu(['Transfer to Job Cards'], '/transfer-to-job-cards');
    const transferPage = pages.transferToJobCards;
    await transferPage.pageRoot.waitFor({ state: 'visible', timeout: 30_000 });

    let row: Locator | null = null;
    if (await transferPage.analyzeEnabled()) {
        await transferPage.applyDateRange(punchDate);
        await transferPage.analyze();
        await transferPage.waitForCandidates(cards.length);
        row = transferPage.rowCells(card.timeCardCounter);
    } else {
        testInfo.annotations.push({
            type: 'transfer-grid-not-asserted',
            description:
                'The Transfer to Job Cards grid is populated by POST /transfer-to-job-cards/analyze, ' +
                'which is disabled on this server (PT_TRANSFER_ANALYZE_ENABLED). The API-level ' +
                'assertions above still ran.',
        });
    }
    await testInfo.attach(`transfer-to-job-cards-${label}.png`, { body: await transferPage.screenshot(), contentType: 'image/png' });
    return row;
}

export async function verifyImportInOffice(input: OfficeVerificationInput): Promise<OfficeVerificationResult> {
    const { pages, testInfo, expected, label } = input;
    const punchDate = input.punchDate ?? new Date();

    const { transport, cards } = await deliverAndVerifyCards(input);

    // Everything from here is wrapped so the punches are deleted even when an
    // assertion throws — a failed run that leaves rows behind pollutes the next
    // run's grid and the shared dev database (observed: two failed runs left 14
    // punches, and the Transfer screen showed them all as blockers).
    try {
        await assertTransferGrid({ pages, testInfo, cards, expected, transport, punchDate, label });
    } finally {
        // ── Cleanup: never leave punches on shared dev data, pass or fail ──────
        await cleanupCards(input.sessionApi, cards, testInfo);
    }

    return { transport, cards };
}
