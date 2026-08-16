/**
 * Ranch form — boundary section e2e, for Catalog workflow **A2 — Ranch,
 * field, crop, and variety setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-013`, `A2-014` |
 *
 * Relocated from `tests/webpet/ranch.spec.ts` (WP-0294, WP-0295) — split out
 * of the ranch list/multi-edit file on purpose. The polygon round-trip test
 * (WP-0295) carried a `test.skip(...)` in the shared serial suite because the
 * Advanced map-editor state leaked across the *other* mutating list/boundary
 * tests that ran serially before it; its own skip reason prescribed isolating
 * the boundary tests into their own non-serial file, which is this file. The
 * skip is removed here and the round-trip assertions run live as `A2-014`.
 *
 * Provisioned once in `beforeAll`; neither test mutates state the other test
 * depends on, so — unlike the ranch list/multi-edit file — there is no need
 * to serialize. Fixture is `base.fixture`; `beforeAll`/`afterAll` and the
 * in-test API round-trip use `sessionApi` directly instead of webpet's
 * `page.request` + `apiUrl(...)` origin workaround, which does not apply here.
 */
import { expect, test } from '@fixtures/base.fixture';
import type { APIRequestContext } from '@playwright/test';
import { ensureRanch, deleteRanch, type EnsuredRanch } from '@data/generated/data-factory';

// This file owns one ranch, dedicated to the boundary tests so its form state
// stays clean. afterAll deletes it regardless, so no rows leak between runs.
let ranchC: EnsuredRanch;

test.beforeAll(async ({ sessionApi }) => {
    ranchC = await ensureRanch(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (ranchC) await deleteRanch(sessionApi, ranchC.id);
});

// Ensure a ranch starts with an empty boundary so filling the polygon/point in
// the test is always a real change (an interrupted run can leave a stale
// polygon, making the fill a no-op and Save stays disabled).
async function clearRanchBoundary(api: APIRequestContext, id: number): Promise<void> {
    const r = await (await api.get(`/api/ranches/${id}`)).json();
    if (r.point == null && r.polygon == null) return;
    await api.put(`/api/ranches/${id}`, {
        data: {
            active: true,
            departmentCounter: r.departmentCounter ?? null,
            workerCompCode: r.workerCompCode ?? null,
            customerCounter: r.customerCounter ?? null,
            point: null,
            polygon: null,
            version: r.version,
        },
    });
}

test.describe('Ranch form — boundary section', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Ranch] Verify that the boundary section renders with its Edit Map control and Advanced disclosure.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-013' },
            { type: 'requirement', description: 'A2-R11|A2-R12|A2-R13' },
        ],
    }, async ({ pages }) => {
        const form = pages.ranchForm;
        await form.gotoEdit(ranchC.id);
        // Wait for the Map section to settle.
        await form.waitForMap();
        await expect(form.mapHeading).toBeVisible();

        // WEBPET-786: the "Edit Map" trigger moved onto the Map section header row
        // and is now an icon button. Its accessible name still resolves via
        // common.mapEditor.editOnMap (aria-label), so the role/name query holds.
        await expect(form.editMapButton).toBeVisible();
        // The trigger sits on the same header row as the "Map" heading (it shares
        // the heading's parent), not below the map preview.
        await expect(form.editMapButtonOnHeaderRow).toBeVisible();

        // Clicking it opens the full-screen editor; Escape closes it.
        await form.openBoundaryEditor();
        await expect(form.boundaryEditorHeading).toBeVisible();
        await form.closeBoundaryEditor();
        await expect(form.boundaryEditorHeading).toBeHidden();

        // The Advanced disclosure starts collapsed.
        await expect(form.advancedToggle).toBeVisible();
        await expect(form.advancedToggle).toHaveAttribute('aria-expanded', 'false');

        // Open the disclosure — point + polygon raw inputs appear.
        await form.openAdvanced();
        await expect(form.advancedToggle).toHaveAttribute('aria-expanded', 'true');
        await expect(form.pointInput).toBeVisible();
        await expect(form.polygonInput).toBeVisible();
    });

    test('[Ranch] Verify that a polygon saved via the Advanced text fallback round-trips on reload.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-014' },
            { type: 'requirement', description: 'A2-R14' },
        ],
    }, async ({ page, pages, sessionApi }) => {
        const form = pages.ranchForm;
        await clearRanchBoundary(sessionApi, ranchC.id);
        await form.gotoEdit(ranchC.id);
        await form.waitForMap();

        // Open Advanced.
        await form.openAdvanced();

        // A tiny three-vertex polygon around the legacy default center
        // (geographic center of US). Using the legacy `(lat, lng),...` format
        // matches what the boundary editor itself emits.
        const polygonText = '(38.51, -96.80),(38.52, -96.80),(38.51, -96.79)';
        await form.polygonInput.fill(polygonText);
        await form.pointInput.fill('(38.515, -96.795)');

        // Save (the FormFooter's primary action) — wait for it to enable once the
        // form registers the polygon/point edits as dirty+valid.
        await expect(form.saveButton).toBeEnabled({ timeout: 10000 });
        await form.saveButton.click();

        // The page navigates back to /setup/ranches on save success.
        await page.waitForURL(/\/setup\/ranches(\?|$)/, { timeout: 10000 });

        // Round-trip: read back via the API and assert the polygon stuck.
        const after = await sessionApi.get(`/api/ranches/${ranchC.id}`);
        expect(after.ok()).toBe(true);
        const ranch = await after.json();
        expect(ranch.polygon).toBe(polygonText);
        expect(ranch.point).toBe('(38.515, -96.795)');

        // Cleanup: reset polygon back to null so subsequent runs start clean.
        await sessionApi.put(`/api/ranches/${ranchC.id}`, {
            data: {
                active: true,
                departmentCounter: ranch.departmentCounter ?? null,
                workerCompCode: ranch.workerCompCode ?? null,
                customerCounter: ranch.customerCounter ?? null,
                point: null,
                polygon: null,
                version: ranch.version,
            },
        });
    });

});
