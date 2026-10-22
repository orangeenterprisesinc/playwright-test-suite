import { writeFile } from 'node:fs/promises';
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import type { CandidateWaitResult } from '@pages/processing/TransferToJobCardsPage';
import {
    annotateIfImportCircuitOpen,
    isStorageUnavailable,
    newImportDeadline,
    NO_STORAGE_REASON,
    waitForImportFiles,
    waitForImportRun,
    type ImportDeadline,
    type ImportFileResult,
    type ImportRunResult,
    type InternetPullResult,
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
 * - `single-folder` — Connectivity ▸ Import ▸ Single Folder on screen: the
 *   envelope is written to a file and uploaded through Browse Files / Import,
 *   the shortest route to a proven import since it needs no relay configuration.
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

/** What one imported card must show on the Transfer grid, keyed by the device's own Reference. */
export interface ExpectedCard {
    employeeCode: string | null;
    /** The card's own `<Reference>` — the grid row's aria-label. */
    reference: string;
    /** The Type cell: "Time In", "Time Out" or "Piece Out". */
    typeText: string;
    /**
     * Display names the grid cells must contain. `null` asserts the cell is blank (a crew
     * piece-out has no employee; B6's badge piece-out no ranch or field); omitted skips the
     * cell — a time-out ships no work context, and omitting does not prove the nulls.
     */
    employeeName?: string | null;
    /** `null` = the device sent no crew code, so the Crew cell must be blank. */
    crewName?: string | null;
    ranchName?: string | null;
    fieldName?: string | null;
    /** The side panel's "Phase" field displays the job's name too. */
    jobName?: string | null;
    /** The one card whose Time In side panel {@link assertTransferGrid} opens. */
    panel?: boolean;
    /**
     * Office ids for plumbing only: the pre-run sweep, the code-history hooks and the
     * OFFICE_TRANSPORT_SUBSTITUTE punches. Never an assertion — the grid proves the fields.
     */
    officeIds?: { employeeId: number | null; fieldId?: number | null; jobId?: number | null };
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
    /** Employee ids swept before the import (e.g. someone who did not move); their absence is proven on the crew-scoped Transfer grid. */
    absentEmployeeIds?: number[];
    label: string;
    /**
     * The exact device filename this attempt sent (`exportFileName(prefix)` at
     * the call site, already computed there for `sendToRelay`). Drives the
     * this-attempt/sibling-attempt split in {@link importViaInternetUi} — with
     * `lineagePrefixes` widening lineage detection to every earlier attempt's own
     * (now distinct) prefix, a retry can still see an earlier attempt's late
     * envelope in the same mailbox drain and bucket it correctly.
     */
    fileName: string;
    /**
     * Every prefix an earlier attempt of this same test could have minted
     * (`lineagePrefixesThroughAttempt`) — widens {@link importViaInternetUi}'s
     * lineage match beyond this attempt's own prefix, since each attempt now mints
     * its own. Optional: a caller outside `runJourneyBScenario` (a single envelope,
     * attempt 0 only) falls back to the file's own prefix.
     */
    lineagePrefixes?: string[];
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
    via?: 'single-folder-ui' | 'internet';
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
        const ids = card.officeIds;
        // Unlinked punches (a time-out carries no field/job) have no context to
        // group by, and POST /time-cards/crew-time-in cannot create one anyway.
        if (!ids || ids.fieldId == null || ids.jobId == null || ids.employeeId === null) continue;
        const key = `${ids.fieldId}:${ids.jobId}`;
        const group = groups.get(key) ?? { fieldId: ids.fieldId, jobId: ids.jobId, employeeIds: [] };
        group.employeeIds.push(ids.employeeId);
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

/** Connectivity ▸ Import ▸ Single Folder, driven as A6 does; the run it starts is then followed to a terminal status. */
async function importViaSingleFolderUi(
    input: DeliverInput,
    deadline: ImportDeadline,
): Promise<TransportResult> {
    const { pages, testInfo, label, sessionApi } = input;
    if (!pages) {
        throw new Error(`${label}: the Single Folder import drives Connectivity ▸ Import ▸ Single Folder — pass pages`);
    }
    const fileName = `FromDevice-${label}-${Date.now()}.xml`;
    const filePath = testInfo.outputPath(fileName);
    await writeFile(filePath, input.xml, 'utf8');
    await testInfo.attach(fileName, { path: filePath, contentType: 'application/xml' });

    const folder = pages.importSingleFolder;
    await folder.goto();
    await folder.selectFiles([filePath]);
    await expect(folder.importButton).toBeEnabled();
    const { runId } = await folder.importSelected();
    // The run poll is the sync point; the file this attempt uploaded is the only one in its run.
    const fileNameOf = (f: ImportFileResult) => String((f as { filename?: string }).filename ?? f.fileName ?? '');
    const run = await waitForImportFiles(sessionApi, runId, (f) => fileNameOf(f) === fileName, deadline, testInfo);
    await testInfo.attach(`import-run-${label}.json`, {
        body: JSON.stringify(run, null, 2),
        contentType: 'application/json',
    });
    expect(run.oursPresent, `import run ${runId} does not list ${fileName}: ${JSON.stringify(run.files)}`).toBe(true);
    await folder.waitForResult(fileName, 60_000);

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
 * asserted — each attempt now mints its own prefix, so an earlier attempt's
 * envelope is recognised as ours only because `lineagePrefixes` widens the match;
 * it inserts, or fails, against its own rows and never this attempt's), and this
 * attempt (returned, asserted by the caller only after the office read).
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
/** A pull that found nothing because a peer worker's drain got there first — or still holds the lease. */
function isPeerDrained(api: { status: string; reason?: string }): boolean {
    return api.status === 'no-data' || (api.status === 'warning' && api.reason === 'already-running');
}

async function importViaInternetUi(
    input: DeliverInput,
    deadline: ImportDeadline,
): Promise<TransportResult> {
    const { pages, testInfo, label, fileName, sessionApi } = input;
    if (!pages) {
        throw new Error(`${label}: the Internet pull drives Connectivity ▸ Import ▸ Internet — pass pages`);
    }

    await pages.leftNav.openScreen(['Connectivity', 'Import', 'Internet'], '/connectivity/import/internet');
    await pages.importInternet.heading.waitFor({ state: 'visible', timeout: 15_000 });

    const references = referencesInExport(input.xml);
    const prefix = references[0]?.split('-')[3] ?? '';
    const prefixes = input.lineagePrefixes?.length ? input.lineagePrefixes : [prefix];
    const fileNameOf = (f: ImportFileResult) => String((f as { filename?: string }).filename ?? f.fileName ?? '');
    // Drives WAITING: each retry mints its own prefix, so this widens to every
    // prefix any attempt through this one could have minted — an earlier attempt's
    // late envelope still counts as ours for that purpose.
    const isOurLineage = (f: ImportFileResult) =>
        prefixes.some((p) => p !== '' && fileNameOf(f).endsWith(`-${p}.xml`)) ||
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
    // matching below proves ownership. Since WEBPET-2996 the peer's drain can
    // also still hold the client's drain lease when we click, which answers
    // `warning` + `already-running` — same situation, same fall-through. Any
    // other 'warning' means the pull could not run at all (a closed relay gate),
    // which stays a hard, diagnostic failure.
    const peerDrained = isPeerDrained(outcome.api);
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
            `"${outcome.headingText}" and the server said "${outcome.api.message || 'no message'}" ` +
            `(status ${outcome.api.status || 'none'}${outcome.api.reason ? `, reason ${outcome.api.reason}` : ''}). ` +
            (outcome.api.status === 'running'
                ? `The background drain (WEBPET-2996) never left "running" within INTERNET_DRAIN_SETTLE_MS — ` +
                  `check run ${outcome.api.runId} in the Internet Import Log. `
                : '') +
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
 * Connectivity ▸ Import ▸ Internet ▸ Trigger Import on screen, then follow the run it started. The
 * caller judges `pull.status` and the files: a peer worker's drain can take our envelope into its own run.
 */
export async function pullFromRelayInternetUi(
    pages: PageObjects,
    sessionApi: APIRequestContext,
    opts: { deadline: ImportDeadline; testInfo: TestInfo; label?: string },
): Promise<{ pull: InternetPullResult; run?: ImportRunResult }> {
    const { deadline, testInfo, label = 'pull' } = opts;
    await pages.leftNav.openScreen(['Connectivity', 'Import', 'Internet'], '/connectivity/import/internet');
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

    const pull: InternetPullResult = outcome.api;
    const run = pull.runId > 0 ? await waitForImportRun(sessionApi, pull.runId, deadline, {}, testInfo) : undefined;
    return { pull, run };
}

/**
 * Deliver the envelope through the configured transport and wait until the office
 * holds one card per expected record — the sync point and id capture of a Journey B
 * run, with no cleanup. The fields are proven on the Transfer grid by the caller
 * (journeyBFlow.assertImportedRows), never from this read. {@link verifyImportInOffice}
 * wraps this with the Transfer to Job Cards screen and teardown.
 */
export async function deliverAndVerifyCards(input: DeliverInput): Promise<OfficeVerificationResult> {
    const { sessionApi, testInfo, expected, absentEmployeeIds = [], label, sweep = true } = input;
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
            employeeIds: [...expected.flatMap((c) => (c.officeIds?.employeeId == null ? [] : [c.officeIds.employeeId])), ...absentEmployeeIds],
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
    const via = input.via ?? (process.env.IMPORT_TRANSPORT === 'single-folder' ? 'single-folder-ui' : 'internet');
    const { transport, references, thisAttemptFailures, peerDrained } =
        via === 'single-folder-ui' ? await importViaSingleFolderUi(input, deadline) : await importViaInternetUi(input, deadline);

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

    // Deferred this-attempt assertion: each attempt mints its own prefix, so a
    // rejection of THIS attempt's own file for a row that already exists means the
    // file was delivered twice — e.g. a peer-drained re-trigger pulled it into two
    // import runs — never a sibling attempt converging on this Reference. Still
    // benign; the branch stays to guard that case.
    if (thisAttemptFailures.length) {
        if (cards.length >= expected.length) {
            testInfo.annotations.push({
                type: 'this-attempt-file-rejected-rows-preexisting',
                description:
                    "This attempt's own envelope was rejected by the importer " +
                    `(${thisAttemptFailures.map((f) => String(f.message ?? '').slice(0, 160)).join(' | ')}), but every ` +
                    'expected row is already present — this file reached two import runs ' +
                    '(e.g. a peer-drained re-trigger), not a sibling attempt sharing this prefix.',
            });
        } else {
            expect(
                thisAttemptFailures,
                `this attempt's own envelope failed to import: ${JSON.stringify(thisAttemptFailures)}`,
            ).toHaveLength(0);
        }
    }

    // The sync assertion only. The fields, the employee links and the absentees are read off the
    // Transfer grid by the caller (journeyBFlow.assertImportedRows), never proved from this API read.
    expect(cards, `office cards for ${label} via ${transport}`).toHaveLength(expected.length);

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
    punchDate: Date;
    label: string;
    /** Row status pattern and issue-group title; defaults are the Time-In-only values every caller asserted so far. */
    grid?: { status?: string; issueGroup?: string };
}

export interface TransferGridResult {
    /** Every issue group's text the grid showed. */
    issueGroups: string[];
}

/** The Transfer to Job Cards half of {@link verifyImportInOffice}: menus → date range → analyze → rows, panel, statuses, issue group, screenshot. */
/** Why the grid never listed the imported cards — the screen is the only proof, so this is thrown, never annotated. */
function gridMissMessage(label: string, wanted: number, result: Extract<CandidateWaitResult, { ok: false }>, retries: number): string {
    const why = result.sawAnalyze404
        ? `analyze job lost between processes (${result.reason}) after "Try again" ×${retries}: GET …/transfer-to-job-cards/analyze/{jobId} → 404 not_found, per-process job store, WEBPET-1907 class`
        : result.reason === 'timeout'
          ? 'neither the grid caption nor a retry button appeared within the wait window, and no analyze 404 was seen'
          : `saw only ${result.count}, with no analyze 404`;
    return `${label}: the Transfer grid never showed the ${wanted} imported card(s) — ${why}.`;
}

export async function assertTransferGrid(input: TransferGridInput): Promise<TransferGridResult> {
    const { pages, testInfo, cards, expected, punchDate, label } = input;
    const statusPattern = new RegExp(input.grid?.status ?? 'Warning', 'i');
    const issueGroupTitle = input.grid?.issueGroup ?? 'Time-In has no closing punch';
    let issueGroups: string[] = [];

    // ── The screen Amy's recording ends on, reached the way she reaches it ──
    await pages.transferToJobCards.openFromMenu();
    const transferPage = pages.transferToJobCards;

    if (await transferPage.analyzeEnabled()) {
        // Nothing renders until a date range is committed and analyzed — the
        // two steps Amy performs.
        await transferPage.applyDateRange(punchDate);
        await transferPage.analyze();
        // waitForCandidatesResult has already clicked "Try again" up to five times on the WEBPET-1907
        // signature. Past that the grid is the only proof of the import, so a miss fails by name.
        const result = await transferPage.waitForCandidatesResult(cards.length);
        if (!result.ok) {
            throw new Error(gridMissMessage(label, cards.length, result, transferPage.analyzeRetryCount));
        } else {
            for (const card of cards) {
                await expect(transferPage.rowFor(card.timeCardCounter)).toHaveText(
                    String(card.reference),
                );
            }

            // ── One row's Time In panel: the display fields (the GPS fix is read by assertImportedRows) ──
            // The card the scenario flagged `panel: true`; the first card when none did.
            const panelExpected = expected.find((c) => c.panel) ?? expected[0];
            const panelCard = cards.find((c) => String(c.reference ?? '') === panelExpected.reference);
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
                // The employee lookup renders whatever the tenant-wide
                // `employeeLookupContents` preference says: the bare name,
                // `<exportIdentifier> : <name>`, or `<name> : <exportIdentifier>`.
                // Someone flipped it to ExportID_Name on dev on 2026-09-22 and b04 failed
                // all three attempts on an employee that had carried an export identifier
                // all along. The identifier is not what this asserts — the employee is —
                // so compare the parts. A different employee still fails.
                await expect
                    .poll(async () => (await transferPage.panelEmployeeValue.inputValue()).split(' : ').map((part) => part.trim()), {
                        message: 'panel Employee lookup should name the expected employee, whatever employeeLookupContents decorates it with',
                    })
                    .toContain(panelExpected.employeeName);
            }
            if (panelExpected.crewName) {
                await expect(transferPage.panelWorkCrewValue).toHaveValue(panelExpected.crewName);
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
        // The grid is fed by an endpoint behind a server flag. It is the only proof of the import now,
        // so a server without it fails by name instead of passing on the API half.
        throw new Error(`${label}: the Transfer to Job Cards grid is populated by POST /transfer-to-job-cards/analyze, which is disabled on this server (PT_TRANSFER_ANALYZE_ENABLED)`);
    }
    await testInfo.attach(`transfer-to-job-cards-${label}.png`, {
        body: await transferPage.screenshot(),
        contentType: 'image/png',
    });
    return { issueGroups };
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
        await assertTransferGrid({ pages, testInfo, cards, expected, punchDate, label });
    } finally {
        // ── Cleanup: never leave punches on shared dev data, pass or fail ──────
        await cleanupCards(input.sessionApi, cards, testInfo);
    }

    return { transport, cards };
}
