// spec: test-plans/screens/shared.md
// seed: tests/seed.spec.ts

/**
 * Console diagnostic harvest.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/shared.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-153` |
 *
 * Relocated from `tests/webpet/console-diagnostic.spec.ts` (WP-0084). Every
 * assertion below is the one that spec carried; what changed is the fixture
 * (`base.fixture`) and the id and tag vocabulary.
 *
 * Not a test in the usual sense: it navigates two representative routes,
 * collects every console error/warning, page error and failed request, prints
 * a report, and then asserts nothing meaningful (`expect(true).toBe(true)`).
 * It is always green by construction — its value is the log, read by a human
 * after a run.
 *
 * The file contains no locators at all — only page event listeners — so the
 * conversion is the fixture import, the title, the tags and the runner
 * annotation. Recorded here so a future reader does not go looking for the
 * page object.
 *
 * `page.waitForTimeout` is kept deliberately — it gives late-firing console
 * output a window to arrive before the listeners are torn down.
 */
import { expect, test } from '@fixtures/base.fixture';
import type { Page } from '@playwright/test';

type Entry = { route: string; kind: string; text: string; location?: string };

async function capture(page: Page, route: string): Promise<Entry[]> {
    const entries: Entry[] = [];

    page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
            const loc = msg.location();
            entries.push({
                route,
                kind: `console.${type}`,
                text: msg.text(),
                location: loc.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined,
            });
        }
    });

    page.on('pageerror', (err) => {
        entries.push({
            route,
            kind: 'pageerror',
            text: `${err.name}: ${err.message}`,
            location: err.stack?.split('\n').slice(0, 4).join('\n'),
        });
    });

    page.on('requestfailed', (req) => {
        entries.push({
            route,
            kind: 'requestfailed',
            text: `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`,
        });
    });

    // Relocated verbatim. This file is a diagnostic harvester: the networkidle
    // window plus its deliberate settle tail IS the capture period, so rewriting
    // the wait changes what gets harvested — and a relocation batch cannot
    // validate a rewritten wait.
    // eslint-disable-next-line playwright/no-networkidle
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    return entries;
}

test.describe('Console diagnostics', { tag: ['@Screens', '@Shared'] }, () => {

    test('[Diagnostics] Capture console output for the fields list and the profile page.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-153' },
            { type: 'requirement', description: 'SCR-R169' },
        ],
    }, async ({ page }) => {
        const all: Entry[] = [];
        all.push(...(await capture(page, '/setup/fields')));
        all.push(...(await capture(page, '/profile')));

        console.log('\n====== CONSOLE DIAGNOSTIC REPORT ======');
        if (all.length === 0) {
            console.log('(no console errors/warnings/pageerrors captured)');
        } else {
            for (const e of all) {
                console.log(`\n[${e.route}] ${e.kind}`);
                console.log(`  ${e.text}`);
                if (e.location) console.log(`  at ${e.location}`);
            }
        }
        console.log('\n====== END REPORT ======\n');

        // Deliberately unconditional: this file is a log harvester, not a check.
        expect(true).toBe(true);
    });

});
