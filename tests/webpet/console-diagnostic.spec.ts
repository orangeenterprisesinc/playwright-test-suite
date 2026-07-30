/**
 * Console diagnostic harvest.
 *
 * Not a test in the usual sense: it navigates two representative routes,
 * collects every console error/warning, page error and failed request, prints
 * a report, and then asserts nothing meaningful (`expect(true).toBe(true)`).
 * It is always green by construction — its value is the log, read by a human
 * after a run.
 *
 * Framework-aligned (Batch 06): nothing to relocate. The file contains no
 * locators at all — only page event listeners — so the conversion is the
 * fixture import, the title, the tags and the runner annotation. Recorded here
 * so a future reader does not go looking for the page object.
 *
 * `page.waitForTimeout` is kept deliberately (R4): it gives late-firing console
 * output a window to arrive before the listeners are torn down.
 */
import { expect, test } from '@fixtures/webpet.fixture';
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

    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    return entries;
}

test.describe('Console diagnostics', { tag: ['@WebPet', '@wp-diagnostics', '@WPBatch06'] }, () => {

    test('[Diagnostics] Capture console output for the fields list and the profile page.', {
        tag: ['@wp-ui', '@wp-visual'],
        annotation: { type: 'testCaseId', description: 'WP-0084' },
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
