/**
 * Catalog workflow R1 — Reports hub: listing, filtering, and favorites.
 * Data: src/data/journey-r/r01-reports-hub-listing-filtering-favorites.json · Plan: test-plans/journey-r/r01-reports-hub-listing-filtering-favorites.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { ReportsHubCaseSchema } from '@data/schemas/journeyRScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('R1 · Reports hub: listing, filtering, and favorites', { tag: ['@JourneyR', '@R1'] }, () => {
    test('End-to-end: load the hub, filter by name and module, star, persist and unstar favorites, sort, and see a Not available report without Run or Configure', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'R1' }],
    }, async ({ pages }, testInfo) => {
        test.setTimeout(180_000);

        const s = await loadScenario(ReportsHubCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const hub = pages.reportsHub;
        const byName = (a: string, b: string) => a.localeCompare(b);
        const noBlankNames = async (view: string) => {
            const names = await hub.renderedRowNames();
            expect(names.length, `${view}: no rows rendered`).toBeGreaterThan(0);
            expect(names.filter((n) => !n), `${view}: blank report names`).toEqual([]);
            return names;
        };

        // 1. Open Administration ▸ Reports; the list loads with rows and no load error.
        await hub.openFromMenu();
        await expect(hub.heading, 'the Reports heading').toBeVisible();
        await expect(hub.loadError, 'the load-failure message').toHaveCount(0);
        const total = await hub.totalRows();
        expect(total, 'the hub footer total').toBeGreaterThan(0);
        await noBlankNames('unfiltered hub');

        // 2. Name filter narrows the list; clearing restores it.
        await hub.filterByName(s.nameFilter.text);
        const byNameCount = await hub.totalRows();
        expect(byNameCount, 'name filter narrows the list').toBeLessThan(total);
        expect(byNameCount).toBeGreaterThan(0);
        for (const name of await noBlankNames('name filter')) {
            expect(name.toLowerCase(), `'${name}' must match the name filter`).toContain(s.nameFilter.text.toLowerCase());
        }
        await hub.clearNameFilter();
        expect(await hub.totalRows(), 'clearing the name filter restores the total').toBe(total);

        // 3. Module filter keeps only that module's reports.
        await hub.filterByModule(s.moduleFilter.module);
        const byModuleCount = await hub.totalRows();
        expect(byModuleCount).toBeGreaterThan(0);
        expect(byModuleCount).toBeLessThan(total);
        await noBlankNames('module filter');
        for (const row of await hub.rowsForCells()) {
            expect(row.module, `For of '${row.name}'`).toBe(s.moduleFilter.module);
        }

        // 4. Both filters intersect.
        await hub.filterByName(s.nameFilter.text);
        const both = await hub.expectFullyRendered();
        expect(both, 'the intersection is no larger than either filter').toBeLessThanOrEqual(Math.min(byNameCount, byModuleCount));
        await noBlankNames('both filters');
        const intersected = await hub.rowsForCells();
        for (const row of intersected) {
            expect(row.module, `For of '${row.name}'`).toBe(s.moduleFilter.module);
            expect(row.name.toLowerCase(), `'${row.name}' must match the name filter`).toContain(s.nameFilter.text.toLowerCase());
        }
        for (const known of s.intersection.mustInclude) {
            expect(intersected.map((r) => r.name), `'${known}' under both filters`).toContain(known);
        }
        await hub.clearNameFilter();
        await hub.clearModuleFilter();

        // 5. Star three reports: they jump to the top and survive a reload; unstar one and reload.
        const fav = s.favorites;
        await hub.filterByModule(fav.module);
        await hub.filterByName(fav.nameFilter);
        await hub.expectFullyRendered();
        await noBlankNames('favorites view');
        for (const name of fav.star) {
            if (await hub.isFavorite(name)) {
                testInfo.annotations.push({ type: 'self-heal', description: `'${name}' was already starred; unstarred before the test` });
                await hub.setFavorite(name, false);
            }
        }
        for (const name of fav.star) await hub.setFavorite(name, true);
        const starred = [...fav.star].sort(byName);
        await expect.poll(async () => (await hub.renderedRowNames()).slice(0, 3), { message: 'the three starred reports lead the list' }).toEqual(starred);

        await hub.openFromMenu();
        await hub.expectFullyRendered();
        for (const name of fav.star) expect(await hub.isFavorite(name), `'${name}' still starred after reload`).toBe(true);
        await expect.poll(async () => (await hub.renderedRowNames()).slice(0, 3), { message: 'the stars persist after reload' }).toEqual(starred);

        await hub.setFavorite(fav.unstar, false);
        const remaining = fav.star.filter((n) => n !== fav.unstar).sort(byName);
        await hub.openFromMenu();
        await hub.expectFullyRendered();
        expect(await hub.isFavorite(fav.unstar), `'${fav.unstar}' unstarred after reload`).toBe(false);
        await expect.poll(async () => (await hub.renderedRowNames()).slice(0, 2), { message: 'the two remaining stars lead the list' }).toEqual(remaining);
        expect((await hub.renderedRowNames()).indexOf(fav.unstar), `'${fav.unstar}' sits below the favorites`).toBeGreaterThanOrEqual(2);

        // Starred rows stay pinned on top under any sort, so the remaining two are unstarred before sorting
        // (the browser also ends as it started).
        for (const name of remaining) await hub.setFavorite(name, false);

        // 6. Sort by Report both ways; Last Run header state and Never cells.
        await hub.sortBy('Report', 'ascending');
        await expect.poll(() => hub.renderedRowNames(), { message: 'Report ascending order' }).toEqual((await hub.renderedRowNames()).slice().sort(byName));
        const ascending = await hub.renderedRowNames();
        await hub.sortBy('Report', 'descending');
        await expect.poll(() => hub.renderedRowNames(), { message: 'Report descending order' }).toEqual([...ascending].sort(byName).reverse());
        expect(await hub.renderedRowNames(), 'ascending and descending orders differ').not.toEqual(ascending);
        await hub.sortBy('Last Run', 'descending');
        await expect.poll(() => hub.sortState('Last Run')).toBe('descending');
        for (const row of await hub.rowsForCells()) {
            expect(row.lastRun, `Last Run of '${row.name}'`).toBe(s.sorting.neverRunText);
        }

        // 7. A Not available report offers neither Run nor Configure, but can be starred.
        const na = s.notAvailable;
        if (na.module) await hub.filterByModule(na.module);
        else await hub.clearModuleFilter();
        await hub.filterByName(na.nameFilter);
        await noBlankNames('not available view');
        await expect(hub.notAvailableBadge(na.report)).toHaveText(na.badge);
        await expect(hub.runButton(na.report)).toHaveCount(0);
        await expect(hub.configureButton(na.report)).toHaveCount(0);
        await expect(hub.starButton(na.report)).toBeVisible();

        // 8. Read the For options; raw identifiers are recorded, not asserted.
        await hub.clearNameFilter();
        await hub.clearModuleFilter();
        const options = await hub.moduleOptions();
        expect(options.length, 'For options').toBeGreaterThan(0);
        expect(options.filter((o) => !o), 'blank For options').toEqual([]);
        const raw = new RegExp(s.observation.rawIdentifierPattern);
        for (const option of options.filter((o) => raw.test(o))) {
            testInfo.annotations.push({ type: 'observation', description: `For option '${option}' reads as a raw identifier` });
        }
    });
});
