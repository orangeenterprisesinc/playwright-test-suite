import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { z } from 'zod';
import type { CleanupStepSchema } from '../../data/schemas/cleanupStep';
import { punchDay } from '../../data/journey-b/fixture';
import { cleanupTarget } from '../../data/static/shared/cleanupTargets';
import { getCrew, setCrewNotifyUser } from '../api/crewsApi';
import { getPreferences, putPreferences } from '../api/preferencesApi';
import type { OfficeFixture } from '../api/officeFixture';
import { cleanupCards } from '../api/officeVerification';
import { isoDay, sweepFixtureCards, type OfficeTimeCard } from '../api/timeCardsApi';
import { deleteByName } from './cleanupRegistry';

// One cleanup format, declared in the scenario JSON, executed here — API only.
//   delete      → deleteByName over cleanupTargets, children first (residue sweep is the backstop)
//   timeCards   → sweepFixtureCards BEFORE the import; cleanupCards(the cards found) AFTER the test
//   restore     → snapshot before / restore after through a named restorer (RESTORERS below)
//   unremovable → annotate `cleanup-not-possible`, never fail
//   ui-delete   → rule only — an entity with a UI delete and no API delete; zero instances today
// 'after' never throws (a failed delete must not mask the test result); 'before' throws on a
// data error (unknown employee code) so a typo fails before anything is imported.

export type CleanupStep = z.infer<typeof CleanupStepSchema>;
export type CleanupPhase = 'before' | 'after';

export interface CleanupContext {
    phase: CleanupPhase;
    office?: OfficeFixture;
    /** The cards the run found — deleted by the `timeCards` step in the 'after' phase. */
    cards?: OfficeTimeCard[];
    /** Shared between the two phases so `restore` finds its snapshot. */
    snapshots?: Map<string, unknown>;
}

interface Restorer {
    snapshot(api: APIRequestContext, ctx: CleanupContext): Promise<unknown>;
    restore(api: APIRequestContext, snapshot: unknown, ctx: CleanupContext): Promise<void>;
}

// `restore` targets — the JSON names one, this table owns the code.
//   crewNotifyUser        → the fixture crew's userToNotifyBreakAndMeal (B12 points it at a notifiable user)
//   stickerStartLocations → the two label-tracking preferences B7 arranges for its own extraction
const RESTORERS: Record<string, Restorer> = {
    crewNotifyUser: {
        snapshot: async (api, ctx) => (await getCrew(api, fixtureCrewId(ctx))).userToNotifyBreakAndMeal ?? null,
        restore: async (api, snapshot, ctx) => {
            await setCrewNotifyUser(api, fixtureCrewId(ctx), snapshot as number | null);
        },
    },
    stickerStartLocations: {
        snapshot: async (api) => {
            const preferences = await getPreferences(api);
            return {
                employeeCodeStartLocation: preferences.employeeCodeStartLocation,
                rollCodeStartLocation: preferences.rollCodeStartLocation,
            };
        },
        restore: async (api, snapshot) => {
            // Leaving them changed would alter sticker extraction for every other client user.
            await putPreferences(api, snapshot as Record<string, unknown>);
        },
    },
};

function fixtureCrewId(ctx: CleanupContext): number {
    if (!ctx.office) throw new Error("restore 'crewNotifyUser' needs the seeded office fixture in the cleanup context");
    return ctx.office.crew.id;
}

export async function runCleanup(steps: CleanupStep[], api: APIRequestContext, testInfo: TestInfo, ctx: CleanupContext): Promise<void> {
    const ordered = ctx.phase === 'before' ? steps : [...steps].sort((a, b) => rank(a) - rank(b));
    for (const step of ordered) {
        try {
            await runStep(step, api, testInfo, ctx);
        } catch (error) {
            if (ctx.phase === 'before') throw error;
            await testInfo.attach(`cleanup-warning-${step.kind}`, {
                body: error instanceof Error ? error.message : String(error),
                contentType: 'text/plain',
            });
        }
    }
}

// After the test: cards first (they reference setup rows), setup rows children-first, restores last.
function rank(step: CleanupStep): number {
    switch (step.kind) {
        case 'timeCards': return 0;
        case 'delete': return 100 + cleanupTarget(step.entity).order;
        case 'ui-delete': return 500;
        case 'restore': return 900;
        case 'unremovable': return 1000;
    }
}

async function runStep(step: CleanupStep, api: APIRequestContext, testInfo: TestInfo, ctx: CleanupContext): Promise<void> {
    switch (step.kind) {
        case 'timeCards':
            if (ctx.phase === 'before') await sweepBefore(step, api, testInfo, ctx);
            else await cleanupCards(api, ctx.cards ?? [], testInfo);
            return;
        case 'delete':
            if (ctx.phase === 'after') await deleteByName(api, cleanupTarget(step.entity), step.name);
            return;
        case 'restore': {
            const restorer = RESTORERS[step.target];
            if (!restorer) throw new Error(`no restorer registered for '${step.target}'`);
            if (ctx.phase === 'before') ctx.snapshots?.set(step.target, await restorer.snapshot(api, ctx));
            else if (ctx.snapshots?.has(step.target)) await restorer.restore(api, ctx.snapshots.get(step.target), ctx);
            return;
        }
        case 'unremovable':
            if (ctx.phase === 'after') {
                testInfo.annotations.push({
                    type: 'cleanup-not-possible',
                    description: `${step.entity}: ${step.reason}${step.ticket ? ` (${step.ticket})` : ''}`,
                });
            }
            return;
        case 'ui-delete':
            throw new Error(`ui-delete '${step.page}.${step.action}' has no runner yet — the rule exists, no instance does`);
    }
}

async function sweepBefore(
    step: Extract<CleanupStep, { kind: 'timeCards' }>,
    api: APIRequestContext,
    testInfo: TestInfo,
    ctx: CleanupContext,
): Promise<void> {
    const employeeIds = step.employeeCodes.map((code) => {
        const id = ctx.office?.employees.get(code)?.id;
        if (id === undefined) throw new Error(`timeCards cleanup: employee code '${code}' is not in the seeded office fixture`);
        return id;
    });
    const day = isoDay(punchDay(step.dayOffset));
    const swept = await sweepFixtureCards(api, { employeeIds, day, ...(step.cardTypes ? { cardTypes: step.cardTypes } : {}) });
    if (swept.removed || swept.failed) {
        testInfo.annotations.push({
            type: 'pre-run-sweep',
            description:
                `Removed ${swept.removed} leftover punch(es) for this fixture on ${day} ` +
                `(${swept.failed} could not be deleted) — orphans from an earlier run whose ` +
                'import landed after its poll timed out.',
        });
    }
}
