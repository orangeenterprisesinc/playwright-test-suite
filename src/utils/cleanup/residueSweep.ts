/**
 * @fileoverview The residue sweep: delete what earlier runs left behind, by name
 * prefix, over the app's API — at the start of every run (other runs' leftovers)
 * and at the end (this run's own).
 *
 * Why a start-of-run sweep at all: a test that times out never reaches its
 * `finally`, and a cancelled or killed run reaches neither `afterAll` nor global
 * teardown. Whatever those leave behind is only ever cleared by a later run.
 *
 * Why an age gate: two runs can overlap on dev (cron vs a web-pet dispatch, a local
 * run vs CI). A row younger than `minAgeMinutes` may belong to a run still in
 * progress, so it is left alone unless it carries THIS run's id (end phase). Ages
 * come from the name's clock token (`runToken.ts`); an undecodable name is legacy
 * residue and treated as old.
 *
 * Never throws: setup and teardown call it, and a broken sweep must not fail a run.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { CLEANUP_TARGETS, isProtectedName, type CleanupTarget } from '../../data/static/shared/cleanupTargets';
import STRANDED_RESIDUE from '../../data/static/shared/strandedResidue.json';
import { createLoginRequestContext } from '../api/apiLogin';
import { Logger } from '../logger';
import { decodeNameAge } from './runToken';

export type SweepPhase = 'start' | 'end' | 'standalone';

export interface SweepOptions {
    phase: SweepPhase;
    /** Report only; RESIDUE_SWEEP=dry or RESIDUE_DRY_RUN=1 also set it. */
    dryRun?: boolean;
    /** RESIDUE_MIN_AGE_MIN, default 120. */
    minAgeMinutes?: number;
    /** RESIDUE_CAP_PER_ENTITY, default 250. */
    capPerEntity?: number;
    /** RESIDUE_SWEEP_BUDGET_MS, default 180 000. */
    budgetMs?: number;
    /** This run's id — its own rows are swept regardless of age (end phase). */
    ownRunId?: string;
    targets?: readonly CleanupTarget[];
    /** An already-authenticated context; otherwise the sweep logs in itself. */
    context?: APIRequestContext;
    /**
     * Employee ids the reconcile has just proven unclearable (a transferred card holds
     * them). Skipped without a DELETE attempt — the API and the UI both refuse, so
     * retrying only costs a round trip per run and buries the real 409s in noise.
     */
    blockedEmployeeIds?: readonly number[];
}

export interface EntitySummary {
    entity: string;
    listed: number;
    matched: number;
    skippedYoung: number;
    skippedProtected: number;
    candidates: number;
    deleted: number;
    notFound: number;
    conflict: number;
    other: number;
    /** Refused for a reason the product will never let us clear. Expected, not a failure. */
    stranded: number;
    capped: boolean;
    attempted: boolean;
    samples: string[];
    error?: string;
}

export interface SweepSummary {
    phase: SweepPhase;
    startedAt: string;
    durationMs: number;
    dryRun: boolean;
    minAgeMinutes: number;
    auth: 'ok' | 'failed' | 'skipped';
    budgetExhausted: boolean;
    entities: EntitySummary[];
    /** `carriedOver` = what this sweep tried and failed to remove, i.e. the next run's inheritance. */
    totals: { matched: number; candidates: number; deleted: number; conflict: number; other: number; notFound: number; skippedYoung: number; carriedOver: number; stranded: number };
    /** The refusal bodies. Previously only logged (and capped at 5), so they never reached the artifact. */
    conflictSamples: Array<{ entity: string; name: string; id: number; status: number; body: string }>;
}

export type DeleteOutcome =
    | { outcome: 'deleted' }
    | { outcome: 'notFound' }
    | { outcome: 'conflict'; status: number; body: string }
    | { outcome: 'other'; status: number; body: string };

type Row = Record<string, unknown>;

const SUMMARY_DIR = path.join('artifacts', 'results');

// A transferred time card cannot be deleted (record.transferred_delete) and the UI
// enforces the same rule, so a row held by one is stranded rather than merely in
// conflict. Reported separately so a genuine, clearable 409 stays visible.
const STRANDED_CODES = ['record.transferred_delete', 'record.used_by_time_card'];

function isStranded(body: string): boolean {
    return STRANDED_CODES.some((code) => body.includes(code));
}

// Rows a 409 cannot self-describe: `fk_in_use` reports only a count, so whether the
// blocker is clearable has to be established once, by hand, and recorded. Same shape
// as tests/webpet/skip-allowlist.json — an explicit burn-down list, not a silent skip.
const STRANDED_ROWS: ReadonlySet<string> = new Set(
    (STRANDED_RESIDUE.rows as Array<{ entity: string; name: string }>).map((r) => `${r.entity}::${r.name}`),
);

// A kind whose rows the API cannot delete at all today (crew tables: the detail GET 500s, so
// no rowversion) — the names are run-unique, so the burn-down entry is per entity, not per row.
const STRANDED_ENTITIES: ReadonlySet<string> = new Set(
    ((STRANDED_RESIDUE as { entities?: Array<{ entity: string }> }).entities ?? []).map((e) => e.entity),
);

function isKnownStranded(entity: string, name: string): boolean {
    return STRANDED_ENTITIES.has(entity) || STRANDED_ROWS.has(`${entity}::${name.trim()}`);
}

export function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    const parsed = raw === undefined || raw === '' ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function asRows(body: unknown): Row[] {
    if (Array.isArray(body)) return body as Row[];
    const wrapped = body as { items?: Row[]; data?: Row[] } | null;
    return wrapped?.items ?? wrapped?.data ?? [];
}

/** `GET <listPath>` as rows, throwing on a non-2xx so the caller can account for it. */
export async function listRows(context: APIRequestContext, target: CleanupTarget): Promise<Row[]> {
    const res = await context.get(target.listPath);
    if (!res.ok()) {
        throw new Error(`GET ${target.listPath} returned ${String(res.status())}: ${(await res.text()).slice(0, 200)}`);
    }
    return asRows(await res.json());
}

/**
 * The rowversion-guarded soft-delete every setup entity shares: read `version`,
 * then DELETE with it. 429 is retried once — dev rate-limits bursts.
 */
export async function deleteById(context: APIRequestContext, target: CleanupTarget, id: number): Promise<DeleteOutcome> {
    const detail = await context.get(`${target.listPath}/${String(id)}`);
    if (detail.status() === 404) return { outcome: 'notFound' };
    if (!detail.ok()) return { outcome: 'other', status: detail.status(), body: (await detail.text()).slice(0, 200) };
    const { version } = (await detail.json()) as { version?: string };
    if (!version) return { outcome: 'other', status: detail.status(), body: 'detail carries no version' };

    let res = await context.delete(`${target.listPath}/${String(id)}`, { data: { rowversion: version } });
    if (res.status() === 429) {
        await new Promise((r) => setTimeout(r, 2_000));
        res = await context.delete(`${target.listPath}/${String(id)}`, { data: { rowversion: version } });
    }
    if (res.status() === 204 || res.status() === 200) return { outcome: 'deleted' };
    if (res.status() === 404) return { outcome: 'notFound' };
    const body = (await res.text()).slice(0, 200);
    return { outcome: res.status() === 409 ? 'conflict' : 'other', status: res.status(), body };
}

function nameOf(row: Row, target: CleanupTarget): string {
    return String(row[target.nameKey ?? 'name'] ?? '');
}

function emptySummary(entity: string): EntitySummary {
    return {
        entity,
        listed: 0,
        matched: 0,
        skippedYoung: 0,
        skippedProtected: 0,
        candidates: 0,
        deleted: 0,
        notFound: 0,
        conflict: 0,
        other: 0,
        stranded: 0,
        capped: false,
        attempted: false,
        samples: [],
    };
}

export function formatSweepSummary(summary: SweepSummary): string {
    const header = `residue sweep [${summary.phase}] auth=${summary.auth} dryRun=${String(summary.dryRun)} minAge=${String(summary.minAgeMinutes)}m ${String(summary.durationMs)}ms${summary.budgetExhausted ? ' BUDGET EXHAUSTED' : ''}`;
    const rows = summary.entities
        .filter((e) => e.matched > 0 || e.error)
        .map(
            (e) =>
                `  ${e.entity.padEnd(14)} matched ${String(e.matched).padStart(4)}  candidates ${String(e.candidates).padStart(4)}  ` +
                `deleted ${String(e.deleted).padStart(4)}  young ${String(e.skippedYoung).padStart(3)}  409 ${String(e.conflict).padStart(3)}  ` +
                `stranded ${String(e.stranded).padStart(3)}  ` +
                `other ${String(e.other).padStart(3)}${e.capped ? '  CAPPED' : ''}${e.attempted ? '' : '  NOT ATTEMPTED'}${e.error ? `  ERROR ${e.error}` : ''}`,
        );
    const t = summary.totals;
    return [header, ...rows, `  totals: matched ${String(t.matched)} candidates ${String(t.candidates)} deleted ${String(t.deleted)} 409 ${String(t.conflict)} other ${String(t.other)} stranded ${String(t.stranded)} carried-over ${String(t.carriedOver)}`].join('\n');
}

/** Remove other runs' (start) or this run's (end) residue. Never throws. */
export async function runResidueSweep(opts: SweepOptions): Promise<SweepSummary> {
    const logger = new Logger('ResidueSweep');
    const startedAt = new Date();
    const dryRun = opts.dryRun ?? (process.env.RESIDUE_SWEEP === 'dry' || process.env.RESIDUE_DRY_RUN === '1');
    const minAgeMinutes = opts.minAgeMinutes ?? envNumber('RESIDUE_MIN_AGE_MIN', 120);
    const capPerEntity = opts.capPerEntity ?? envNumber('RESIDUE_CAP_PER_ENTITY', 250);
    const budgetMs = opts.budgetMs ?? envNumber('RESIDUE_SWEEP_BUDGET_MS', 180_000);
    const targets = opts.targets ?? CLEANUP_TARGETS;
    const ownRunId = (opts.ownRunId ?? process.env.RESIDUE_RUN_ID ?? '').toUpperCase();

    const summary: SweepSummary = {
        phase: opts.phase,
        startedAt: startedAt.toISOString(),
        durationMs: 0,
        dryRun,
        minAgeMinutes,
        auth: 'skipped',
        budgetExhausted: false,
        entities: targets.map((t) => emptySummary(t.entity)),
        totals: { matched: 0, candidates: 0, deleted: 0, conflict: 0, other: 0, notFound: 0, skippedYoung: 0, carriedOver: 0, stranded: 0 },
        conflictSamples: [],
    };
    const finish = (): SweepSummary => {
        summary.durationMs = Date.now() - startedAt.getTime();
        for (const e of summary.entities) {
            summary.totals.matched += e.matched;
            summary.totals.candidates += e.candidates;
            summary.totals.deleted += e.deleted;
            summary.totals.conflict += e.conflict;
            summary.totals.other += e.other;
            summary.totals.notFound += e.notFound;
            summary.totals.skippedYoung += e.skippedYoung;
            summary.totals.stranded += e.stranded;
        }
        // What the NEXT run inherits — stranded rows are excluded: nothing can clear them.
        summary.totals.carriedOver = summary.totals.candidates - summary.totals.deleted - summary.totals.stranded;
        logger.info(formatSweepSummary(summary));
        try {
            fs.mkdirSync(SUMMARY_DIR, { recursive: true });
            fs.writeFileSync(path.join(SUMMARY_DIR, `residue-sweep-${opts.phase}.json`), JSON.stringify(summary, null, 2));
        } catch (error) {
            logger.warn(`Could not write the sweep summary: ${error instanceof Error ? error.message : String(error)}`);
        }
        return summary;
    };

    if (process.env.RESIDUE_SWEEP === '0') {
        logger.info(`residue sweep [${opts.phase}] disabled by RESIDUE_SWEEP=0`);
        return finish();
    }

    let context = opts.context ?? null;
    const ownsContext = !opts.context;
    try {
        context ??= await createLoginRequestContext({ label: `residue sweep (${opts.phase})` });
        if (!context) {
            summary.auth = 'failed';
            logger.warn(`residue sweep [${opts.phase}]: no authenticated API context — nothing swept`);
            return finish();
        }
        summary.auth = 'ok';
        const deadline = startedAt.getTime() + budgetMs;
        const minAgeMs = minAgeMinutes * 60_000;
        const now = Date.now();

        for (const target of targets) {
            const entry = summary.entities.find((e) => e.entity === target.entity)!;
            if (Date.now() > deadline) {
                summary.budgetExhausted = true;
                break;
            }
            entry.attempted = true;
            try {
                const rows = await listRows(context, target);
                entry.listed = rows.length;

                const matched = rows
                    .map((row) => {
                        const name = nameOf(row, target);
                        const hit = target.prefixes.find((p) => name.startsWith(p.prefix));
                        return hit ? { row, name, prefix: hit } : null;
                    })
                    .filter((m): m is NonNullable<typeof m> => m !== null);
                entry.matched = matched.length;
                if (!matched.length) continue;

                if (matched[0].row[target.idKey] === undefined) {
                    entry.error = `idKey '${target.idKey}' absent; row keys: ${Object.keys(matched[0].row).slice(0, 12).join(',')}`;
                    logger.warn(`residue sweep: ${target.entity} skipped — ${entry.error}`);
                    continue;
                }

                const eligible: Array<{ id: number; name: string; ageMs: number }> = [];
                for (const { row, name, prefix } of matched) {
                    if (isProtectedName(name)) {
                        entry.skippedProtected += 1;
                        continue;
                    }
                    const age = decodeNameAge(name, prefix.prefix, prefix.token, now);
                    const ours = opts.phase === 'end' && ownRunId !== '' && age.runId === ownRunId;
                    const old = !age.decodable || (age.ageMs ?? 0) >= minAgeMs;
                    if (!ours && !old) {
                        entry.skippedYoung += 1;
                        continue;
                    }
                    eligible.push({ id: Number(row[target.idKey]), name, ageMs: age.decodable ? age.ageMs ?? 0 : Number.MAX_SAFE_INTEGER });
                }
                eligible.sort((a, b) => b.ageMs - a.ageMs);
                const batch = eligible.slice(0, capPerEntity);
                entry.capped = eligible.length > batch.length;
                entry.candidates = batch.length;
                entry.samples = batch.slice(0, 3).map((c) => c.name);
                if (dryRun) continue;

                const blocked = new Set(target.entity === 'employee' ? (opts.blockedEmployeeIds ?? []) : []);
                for (const candidate of batch) {
                    if (Date.now() > deadline) {
                        summary.budgetExhausted = true;
                        break;
                    }
                    if (blocked.has(candidate.id) || isKnownStranded(target.entity, candidate.name)) {
                        entry.stranded += 1;
                        continue;
                    }
                    const result = await deleteById(context, target, candidate.id);
                    if (result.outcome === 'deleted') entry.deleted += 1;
                    else if (result.outcome === 'notFound') entry.notFound += 1;
                    else if (result.outcome === 'conflict' && isStranded(result.body)) {
                        entry.stranded += 1;
                    } else {
                        entry[result.outcome] += 1;
                        if (summary.conflictSamples.length < 20) {
                            summary.conflictSamples.push({
                                entity: target.entity,
                                name: candidate.name,
                                id: candidate.id,
                                status: result.status,
                                body: result.body,
                            });
                        }
                        if (entry.conflict + entry.other <= 5) {
                            logger.warn(
                                `residue sweep: ${target.entity} '${candidate.name}' #${String(candidate.id)} → ${String(result.status)} ${result.body}`,
                            );
                        }
                    }
                }
            } catch (error) {
                entry.error = error instanceof Error ? error.message : String(error);
                logger.warn(`residue sweep: ${target.entity} failed — ${entry.error}`);
            }
        }
        return finish();
    } catch (error) {
        logger.warn(`residue sweep [${opts.phase}] aborted: ${error instanceof Error ? error.message : String(error)}`);
        return finish();
    } finally {
        if (ownsContext && context) await context.dispose().catch(() => undefined);
    }
}
