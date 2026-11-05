/**
 * Pins the PET Tiger shell to the classic experience.
 *
 * Since web-pet #1569 (dev 2026-11-05) a fresh browser opens the "new experience" (uxVersion 'v2'). The choice lives
 * only in localStorage (pt.userPreferences.v1) — nothing server-side — so it is seeded before any app code runs. This
 * suite stays on the classic shell; the new-shell suite lives on the feat/new-shell branch.
 */
import type { BrowserContext, Page } from '@playwright/test';

export const SHELL_PREFERENCE_KEY = 'pt.userPreferences.v1';
export const SHELL_UX_VERSION = 'classic';

/** Seed the shell choice before the app loads: merges into an existing preference blob and always wins on uxVersion. */
export async function pinShellExperience(target: BrowserContext | Page): Promise<void> {
    await target.addInitScript(
        ({ key, uxVersion }) => {
            let prefs: Record<string, unknown> = {};
            try {
                prefs = (JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>) ?? {};
            } catch {
                prefs = {};
            }
            window.localStorage.setItem(key, JSON.stringify({ ...prefs, uxVersion, uxVersionChosen: true }));
        },
        { key: SHELL_PREFERENCE_KEY, uxVersion: SHELL_UX_VERSION },
    );
}
