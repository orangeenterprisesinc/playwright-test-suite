/**
 * Pins the PET Tiger shell to the new experience (web-pet #1569, dev 2026-11-05).
 *
 * The choice lives only in localStorage (pt.userPreferences.v1.uxVersion) — nothing server-side — so it is seeded
 * before any app code runs; a replayed .auth/user.json from a classic run can never flip it. This branch
 * (feat/new-shell) is the new-shell suite; main pins 'classic' with the same helper.
 */
import type { BrowserContext, Page } from '@playwright/test';

export const SHELL_PREFERENCE_KEY = 'pt.userPreferences.v1';
export const SHELL_UX_VERSION = 'v2';

/** Seed the shell choice before the app loads: merges into an existing preference blob and always wins on uxVersion. */
export async function pinShellExperience(target: BrowserContext | Page): Promise<void> {
    await target.addInitScript(
        ({ key, uxVersion }) => {
            // Opaque-origin documents (about:blank, sandboxed frames) throw on any localStorage access; nothing to pin there.
            try {
                let prefs: Record<string, unknown> = {};
                try {
                    prefs = (JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>) ?? {};
                } catch {
                    prefs = {};
                }
                window.localStorage.setItem(key, JSON.stringify({ ...prefs, uxVersion, uxVersionChosen: true }));
            } catch {
                /* no storage in this document */
            }
        },
        { key: SHELL_PREFERENCE_KEY, uxVersion: SHELL_UX_VERSION },
    );
}
