/**
 * @fileoverview Cleanup that survives an interrupted process.
 *
 * `cleanupScope` handles a test that fails or times out, because Playwright still runs
 * fixture teardown. It cannot handle a run that is killed — Ctrl+C, a closed terminal,
 * a CI cancel, a machine going to sleep. Nothing in a dead process cleans up, and a
 * test that had already committed a transfer leaves rows that get harder to remove
 * with every run that follows (a transferred time card cannot be deleted until its
 * job card is).
 *
 * So a flow WRITES DOWN what it creates, as it creates it, in a file outside
 * `artifacts/results` (which every run wipes). The next live process — global
 * setup of the next run, or global teardown of this one, which Playwright still
 * runs on SIGINT — replays any journal it finds and deletes it on success. A journal
 * whose replay fails is kept and retried next time, so nothing is silently dropped.
 *
 * Entries are typed so the replayer needs no flow code: it only needs the API.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import { deleteJobCard, getJobCard } from '../api/jobCardsApi';
import { createSessionRequestContext } from '../api/sessionContext';
import { getJob, setJobRate } from '../api/setupEntitiesApi';
import { deleteTimeCard, listTimeCards } from '../api/timeCardsApi';
import { Logger } from '../logger';

export const JOURNAL_DIR = path.join('artifacts', 'cleanup-journal');

export type JournalEntry =
    /** Job cards by explicit id — first, because deleting one resets its source time cards. */
    | { kind: 'jobCards'; ids: number[] }
    /** Every time card a crew has on a day. Crew-scoped: the crew piece-out carries no employee. */
    | { kind: 'timeCardsByCrew'; day: string; crewCounter: number }
    /** Put a job's piece rate back to what it was before the run changed it. */
    | { kind: 'jobPieceRate'; jobCounter: number; pieceRate: number };

interface Journal {
    test: string;
    writtenAt: string;
    entries: JournalEntry[];
}

const logger = new Logger('CleanupJournal');

function fileFor(testInfo: TestInfo): string {
    const run = process.env.RESIDUE_RUN_ID ?? 'norun';
    const slug = testInfo.titlePath.join('-').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    return path.join(JOURNAL_DIR, `${run}-w${String(testInfo.workerIndex)}-${slug}.json`);
}

/** Record something the test has created (or is about to). Idempotent per entry. */
export function journalRecord(testInfo: TestInfo, entry: JournalEntry): void {
    mkdirSync(JOURNAL_DIR, { recursive: true });
    const file = fileFor(testInfo);
    const journal: Journal = existsSync(file)
        ? (JSON.parse(readFileSync(file, 'utf-8')) as Journal)
        : { test: testInfo.titlePath.join(' › '), writtenAt: new Date().toISOString(), entries: [] };
    const key = JSON.stringify(entry);
    if (!journal.entries.some((e) => JSON.stringify(e) === key)) journal.entries.push(entry);
    writeFileSync(file, JSON.stringify(journal, null, 2));
}

/** The test's own cleanup succeeded — nothing left for a later process to do. */
export function journalClear(testInfo: TestInfo): void {
    rmSync(fileFor(testInfo), { force: true });
}

async function replayEntry(api: APIRequestContext, entry: JournalEntry): Promise<string> {
    switch (entry.kind) {
        case 'jobCards': {
            let removed = 0;
            for (const id of entry.ids) {
                const card = await getJobCard(api, id).catch(() => null);
                if (!card) continue; // already gone
                const result = await deleteJobCard(api, id, card.version);
                if (result.deleted) removed += 1;
                else throw new Error(`DELETE job-cards/${String(id)} answered ${String(result.status)}`);
            }
            return `job cards ${String(removed)}/${String(entry.ids.length)} removed`;
        }
        case 'timeCardsByCrew': {
            const cards = (await listTimeCards(api, { from: entry.day, to: entry.day })).filter(
                (c) => Number(c.crewCounter) === entry.crewCounter,
            );
            for (const card of cards) await deleteTimeCard(api, card.timeCardCounter);
            return `time cards ${String(cards.length)} removed on ${entry.day}`;
        }
        case 'jobPieceRate': {
            const job = await getJob(api, entry.jobCounter);
            if (Number(job.pieceRate) === entry.pieceRate) return `job ${String(entry.jobCounter)} rate already ${String(entry.pieceRate)}`;
            await setJobRate(api, entry.jobCounter, entry.pieceRate);
            return `job ${String(entry.jobCounter)} rate restored to ${String(entry.pieceRate)}`;
        }
    }
}

/** Replay order — job cards must go before the time cards they lock. */
const ORDER: Record<JournalEntry['kind'], number> = { jobCards: 0, timeCardsByCrew: 1, jobPieceRate: 2 };

export interface ReplaySummary {
    files: number;
    replayed: number;
    kept: number;
    lines: string[];
}

/**
 * Replay every journal on disk against `api`. Never throws — this runs inside global
 * setup/teardown, which must not fail over residue. A journal is deleted only when every
 * entry in it succeeded; otherwise it stays for the next attempt.
 */
export async function replayJournals(api: APIRequestContext): Promise<ReplaySummary> {
    const summary: ReplaySummary = { files: 0, replayed: 0, kept: 0, lines: [] };
    if (!existsSync(JOURNAL_DIR)) return summary;

    for (const name of readdirSync(JOURNAL_DIR).filter((f) => f.endsWith('.json'))) {
        const file = path.join(JOURNAL_DIR, name);
        summary.files += 1;
        let journal: Journal;
        try {
            journal = JSON.parse(readFileSync(file, 'utf-8')) as Journal;
        } catch {
            summary.lines.push(`${name}: unreadable, removed`);
            rmSync(file, { force: true });
            continue;
        }

        let allOk = true;
        for (const entry of [...journal.entries].sort((a, b) => ORDER[a.kind] - ORDER[b.kind])) {
            try {
                summary.lines.push(`${name}: ${await replayEntry(api, entry)}`);
            } catch (error) {
                allOk = false;
                summary.lines.push(`${name}: ${entry.kind} FAILED — ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        if (allOk) {
            rmSync(file, { force: true });
            summary.replayed += 1;
        } else {
            summary.kept += 1;
        }
    }

    for (const line of summary.lines) logger.info(line);
    if (summary.files) logger.info(`journal replay: ${String(summary.replayed)} cleared, ${String(summary.kept)} kept for retry`);
    return summary;
}

/**
 * Entry point for global setup / teardown, which have no fixtures: opens its own untraced
 * context, replays, disposes. Never throws — residue must not fail a run's lifecycle hooks.
 */
export async function replayLeftoverJournals(): Promise<ReplaySummary | null> {
    if (!existsSync(JOURNAL_DIR) || !readdirSync(JOURNAL_DIR).some((f) => f.endsWith('.json'))) return null;
    const api = await createSessionRequestContext();
    if (!api) {
        logger.warn('journal replay skipped: no authenticated API session');
        return null;
    }
    try {
        return await replayJournals(api);
    } catch (error) {
        logger.warn(`journal replay failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    } finally {
        await api.dispose().catch(() => undefined);
    }
}
