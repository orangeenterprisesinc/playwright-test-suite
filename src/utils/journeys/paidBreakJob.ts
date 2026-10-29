import { expect } from '@playwright/test';
import type { APIRequestContext, TestInfo } from '@playwright/test';
import type { PageObjects } from '@fixtures/pages.fixture';
import { getPreferences, putPreferences } from '@utils/api/preferencesApi';
import { getJob, type EnsuredRecord } from '@utils/api/setupEntitiesApi';
import { allowApiWrites } from '@utils/api/writeGuard';
import { currentScope, type ScopeRegistration } from '@utils/cleanup/cleanupScope';
import { acquirePaidBreakJobLock, withPreferencesLock } from '@utils/sync/preferencesLock';

// A designation another person made (not a B/D suite job) is never overwritten; suite residue is.
const SUITE_JOB = /^[BD]\d{1,2} /;

export interface PaidBreakDesignation {
    /** Clears the designation and frees the lock; idempotent. `api` is the scope's untraced context when called from teardown. */
    restore(api?: APIRequestContext): Promise<void>;
}

/**
 * Designate `job` as the tenant's paid-break job on Preferences ▸ Job ▸ Job Assignments, under the
 * cross-worker paid-break-job lock (D10 and B9 each own a different job). The lock is released only
 * after the restore, so neither spec can clear the preference under the other. The restore is
 * registered with the cleanup scope as soon as the lock is held, so a failure or timeout still runs it.
 */
export async function designatePaidBreakJob(
    job: EnsuredRecord,
    opts: { sessionApi: APIRequestContext; pages: PageObjects; testInfo: TestInfo; label: string },
): Promise<PaidBreakDesignation> {
    const { sessionApi, pages, testInfo, label } = opts;
    const release = await acquirePaidBreakJobLock();

    const current = Number((await getPreferences(sessionApi).catch((error: unknown) => {
        release();
        throw error;
    })).paidBreakJob ?? 0);
    if (current > 0 && current !== job.id) {
        const name = String((await getJob(sessionApi, current).catch(() => ({ name: '' }))).name ?? '');
        if (!SUITE_JOB.test(name)) {
            release();
            throw new Error(`${label}: Paid Break Job is already set to '${name}' (id ${current}), which is not a suite fixture; refusing to overwrite someone else's configuration.`);
        }
    }

    let held = true;
    const restore = async (api: APIRequestContext = sessionApi): Promise<void> => {
        if (!held) return;
        try {
            // Under the preferences lock too: a concurrent whole-form save that loaded before this PUT could write the job back.
            await withPreferencesLock(async () => {
                // 0 clears the FK back to null; null would be ignored by the partial PUT.
                await allowApiWrites('cleanup', `${label} teardown: clear paidBreakJob`, () => putPreferences(api, { paidBreakJob: 0 }));
                const after = await getPreferences(api);
                if (after.paidBreakJob !== null && after.paidBreakJob !== undefined) throw new Error(`paidBreakJob still reads ${String(after.paidBreakJob)}`);
            });
        } catch (error) {
            await testInfo.attach('cleanup-warning-paidBreakJob', {
                body: error instanceof Error ? error.message : String(error),
                contentType: 'text/plain',
            });
            return;
        }
        held = false;
        release();
        registration?.complete();
    };
    const registration: ScopeRegistration | undefined = currentScope(testInfo)?.add(`${label} paid break job`, restore);

    await withPreferencesLock(async () => {
        const prefs = pages.preferences;
        await prefs.gotoPreferences();
        await prefs.gotoSection('Job');
        if ((await prefs.displayedValue('paidBreakJob').catch(() => '')) !== job.name) {
            await prefs.choose('paidBreakJob', job.name);
            await prefs.saveIfDirty();
        }
        await expect
            .poll(async () => Number((await getPreferences(sessionApi)).paidBreakJob), {
                message: `${label}: Preferences ▸ Job ▸ Paid Break Job must store ${job.name} (id ${job.id})`,
                timeout: 30_000,
            })
            .toBe(job.id);
        // Reopened from the menu (a fresh load): the value read is the stored one.
        await prefs.gotoPreferences();
        await prefs.gotoSection('Job');
        expect(await prefs.displayedValue('paidBreakJob'), `${label}: Preferences ▸ Job ▸ Job Assignments must show the paid-break job after the save`).toBe(job.name);
    });

    return { restore };
}
