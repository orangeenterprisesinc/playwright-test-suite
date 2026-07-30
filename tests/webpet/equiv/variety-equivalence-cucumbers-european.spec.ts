/**
 * Equivalence test: variety-new-record-cucumbers-european
 *
 * Scenario: Create new Variety 'European' under crop CUCUMBERS via Variety screen
 * Source:   specs/processed/variety-new-record-cucumbers-european.scenario.yaml
 *
 * testIsolation: substitute — 'European' is replaced with a unique per-run name
 * so repeated runs never conflict, even when a prior run's row was only
 * soft-deleted. (The Variety_CropCounter_Name_Unique constraint is unfiltered,
 * so soft-deleted rows block re-inserts with the same CropCounter+Name.)
 *
 * Fields with assert: ignore (Code, VarietyCounter, Preferen.SetupNextBarCode)
 * are not asserted; Code presence is verified (non-null) only.
 *
 * ## Framework alignment (Batch 14)
 *
 * This spec was the last importer of `tests/webpet/parent-picker-helpers.ts` and
 * of `tests/webpet/support/webpet-env.ts`; both are deleted with this batch. The
 * sheet-mode Crop picker now goes through `VarietyFormPage.selectCrop`, which
 * calls the same `ParentPickerComponent.selectSheetOption` the helper forwarded
 * to — so the interaction is unchanged, only the route to it is.
 *
 * The `afterAll` cleanup keeps building its own request context rather than using
 * the `request` fixture: it must outlive the test's page, and it needs the API
 * base URL and the admin storage state explicitly.
 */
import { readFileSync } from 'fs';
import { WEBPET_ADMIN_STORAGE } from '@config/webpetPaths';
import { API_BASE_URL } from '@config/webpetEnv';
import { expect, test } from '@fixtures/webpet.fixture';
import type { APIRequestContext } from '@playwright/test';

// Unique per-run suffix avoids the unfiltered unique-constraint ghost-row issue.
const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const SAFE_NAME = `ZZTEST_VAR_${RUN_TOKEN}`;
// The legacy scenario used crop CUCUMBERS (id 38); DelLlano has no such crop,
// so rebase to a real seeded DelLlano crop. The equivalence assertion (the new
// Variety row's fields are written correctly) is unchanged — only the existing
// parent-crop FK differs.
const CROP_ID = '3';
const CROP_NAME = 'STRAWBERRIES';
const ADMIN_STORAGE = WEBPET_ADMIN_STORAGE;

// Read the CSRF token from the saved storage state for direct API calls
// that must pass RequireCSRF (DELETE). pt_csrf is non-HttpOnly — same value
// the browser JS reads and echoes as X-CSRF-Token.
function csrfFromStorage(): string {
    const data = JSON.parse(readFileSync(ADMIN_STORAGE, 'utf-8')) as {
        cookies: Array<{ name: string; value: string }>;
    };
    return data.cookies.find((c) => c.name === 'pt_csrf')?.value ?? '';
}

async function softDeleteVariety(api: APIRequestContext, id: number, csrf: string) {
    const res = await api.get(`/api/varieties/${id}`);
    if (!res.ok()) return;
    const v = await res.json();
    await api.delete(`/api/varieties/${id}`, {
        data: { rowversion: v.version },
        headers: { 'X-CSRF-Token': csrf },
    });
}

let createdId: number | null = null;

// Soft-delete the variety created during the test so it doesn't pile up
// as active records. Note: the unique constraint is unfiltered, so
// soft-deleted rows block future re-inserts of the same CropCounter+Name —
// that is why we use a unique SAFE_NAME per run rather than a fixed constant.
test.afterAll(async ({ playwright }) => {
    if (createdId == null) return;
    const csrf = csrfFromStorage();
    const api = await playwright.request.newContext({
        baseURL: API_BASE_URL,
        storageState: ADMIN_STORAGE,
    });
    try {
        await softDeleteVariety(api, createdId, csrf);
    } finally {
        await api.dispose();
        createdId = null;
    }
});

test.describe('Equivalence: variety-new-record-cucumbers-european', { tag: ['@WebPet', '@wp-equiv', '@WPBatch14'] }, () => {

    test('[Equiv] Verify that creating a variety writes the correct DB values.', {
        tag: ['@wp-e2e', '@wp-variety'],
        annotation: { type: 'testCaseId', description: 'WP-0179' },
    }, async ({ page, pages }) => {
        const form = pages.varietyForm;
        await form.gotoNew();

        // CropCounter — rebased to a real DelLlano crop (see CROP_ID/CROP_NAME above)
        await form.selectCrop(CROP_ID);
        await expect(form.cropPicker.sheetValue).toHaveText(CROP_NAME);

        // Name — unique per run to avoid unfiltered-unique-constraint conflicts
        await form.nameInput.fill(SAFE_NAME);
        await form.nameInput.blur();

        // ExportIdentifier auto-populates from Crop + Name on blur; assert: equals (derived)
        await expect(form.exportIdentifierInput).toHaveValue(`${CROP_NAME},${SAFE_NAME}`);

        // Active defaults to Yes — no interaction needed; assert: equals (true)

        await expect(form.footer.saveButton).toBeEnabled();
        await form.footer.saveButton.click();
        await page.waitForURL(/\/setup\/varieties\/\d+/);

        const match = page.url().match(/\/setup\/varieties\/(\d+)/);
        expect(match, 'URL should contain new variety ID after save').not.toBeNull();
        createdId = parseInt(match![1]!, 10);

        // ── DB assertions via GET /api/varieties/:id ──────────────────────────
        // page.request carries the browser context's session cookies (RequireAuth).
        // GET is a safe method — no CSRF header required.

        const res = await page.request.get(`/api/varieties/${createdId}`);
        expect(res.ok()).toBe(true);
        const row = await res.json();

        // assert: equals — CropCounter (rebased 38 → 3 for DelLlano's STRAWBERRIES)
        expect(row.cropCounter).toBe(3);

        // assert: equals — Active
        expect(row.active).toBe(true);

        // assert: equals — Name (unique per-run substitute)
        expect(row.name).toBe(SAFE_NAME);

        // assert: equals — ExportIdentifier (derived from CropCounter display + Name)
        expect(row.exportIdentifier).toBe(`${CROP_NAME},${SAFE_NAME}`);

        // assert: ignore — Code (auto-generated barcode; just verify it was assigned)
        expect(row.code).not.toBeNull();

        // assert: ignore — VarietyCounter (auto-increment PK; not asserted)
        // assert: ignore — Preferen.SetupNextBarCode (separate table; not asserted)
    });

});
