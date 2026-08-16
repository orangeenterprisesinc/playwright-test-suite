/**
 * Equivalence test: variety-new-record-cucumbers-european, for Catalog
 * workflow **A2 — Ranch, field, crop, and variety setup**.
 *
 * | | |
 * |---|---|
 * | Catalog | `docs/catalog/PET-Tiger-Workflow-Catalog.docx` → A2 |
 * | Plan | `test-plans/journey-a/a02-ranch-field-crop-variety-setup.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A2-055` |
 *
 * Relocated from
 * `tests/webpet/equiv/variety-equivalence-cucumbers-european.spec.ts`
 * (WP-0179). Scenario: create new Variety 'European' under crop CUCUMBERS via
 * the Variety screen; source `specs/processed/variety-new-record-cucumbers-
 * european.scenario.yaml`.
 *
 * testIsolation: substitute — 'European' is replaced with a unique per-run
 * name so repeated runs never conflict, even when a prior run's row was only
 * soft-deleted (the Variety_CropCounter_Name_Unique constraint is unfiltered,
 * so soft-deleted rows block re-inserts with the same CropCounter+Name).
 *
 * Fields with assert: ignore (Code, VarietyCounter, Preferen.SetupNextBarCode)
 * are not asserted; Code presence is verified (non-null) only.
 *
 * The legacy scenario used crop CUCUMBERS (id 38), a DelLlano-only seed absent
 * on dev staging — the parent Crop is owned via the API instead so this spec
 * runs on any environment. Cleanup now goes through the shared
 * `deleteVariety`/`deleteCrop` factory helpers via `sessionApi` — the same
 * best-effort, rowversion-guarded delete the webpet original built by hand
 * with its own `playwright.request` context and a CSRF cookie read out of
 * `WEBPET_ADMIN_STORAGE`, neither of which is needed here.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ensureCrop, deleteCrop, deleteVariety, type EnsuredCrop } from '@data/generated/data-factory';

// Unique per-run suffix avoids the unfiltered unique-constraint ghost-row issue.
const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const SAFE_NAME = `ZZTEST_VAR_${RUN_TOKEN}`;

// The legacy scenario used crop CUCUMBERS (id 38), a DelLlano-only seed absent
// on dev staging. Own the parent Crop via the API instead so this spec runs
// on any environment.
let crop: EnsuredCrop;
let createdId: number | null = null;

test.beforeAll(async ({ sessionApi }) => {
    crop = await ensureCrop(sessionApi, { namePrefix: 'E2EVarCrop' });
});

test.afterAll(async ({ sessionApi }) => {
    // Children before parents — the API blocks a delete with live FK rows.
    if (createdId != null) await deleteVariety(sessionApi, createdId);
    if (crop) await deleteCrop(sessionApi, crop.id);
});

test.describe('Equivalence: variety-new-record-cucumbers-european', { tag: ['@JourneyA', '@A2'] }, () => {

    test('[Equiv] Verify that creating a variety writes the correct DB values.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A2-055' },
            { type: 'requirement', description: 'A2-R65|A2-R66|A2-R67|A2-R68|A2-R69' },
        ],
    }, async ({ page, pages, sessionApi }) => {
        const form = pages.varietyForm;
        await form.gotoNew();

        // CropCounter — this file's own crop, created fresh via the API
        await form.selectCrop(crop.id);
        await expect(form.cropPicker.sheetValue).toHaveText(crop.name);

        // Name — unique per run to avoid unfiltered-unique-constraint conflicts
        await form.nameInput.fill(SAFE_NAME);
        await form.nameInput.blur();

        // ExportIdentifier auto-populates from Crop + Name on blur; assert: equals (derived)
        await expect(form.exportIdentifierInput).toHaveValue(`${crop.name},${SAFE_NAME}`);

        // Active defaults to Yes — no interaction needed; assert: equals (true)

        await expect(form.footer.saveButton).toBeEnabled();
        await form.footer.saveButton.click();
        await page.waitForURL(/\/setup\/varieties\/\d+/);

        const match = page.url().match(/\/setup\/varieties\/(\d+)/);
        expect(match, 'URL should contain new variety ID after save').not.toBeNull();
        createdId = parseInt(match![1]!, 10);

        // ── DB assertions via GET /api/varieties/:id ──────────────────────────
        const res = await sessionApi.get(`/api/varieties/${createdId}`);
        expect(res.ok()).toBe(true);
        const row = await res.json();

        // assert: equals — CropCounter (this file's own crop, not the legacy CUCUMBERS id)
        expect(row.cropCounter).toBe(crop.id);

        // assert: equals — Active
        expect(row.active).toBe(true);

        // assert: equals — Name (unique per-run substitute)
        expect(row.name).toBe(SAFE_NAME);

        // assert: equals — ExportIdentifier (derived from CropCounter display + Name)
        expect(row.exportIdentifier).toBe(`${crop.name},${SAFE_NAME}`);

        // assert: ignore — Code (auto-generated barcode; just verify it was assigned)
        expect(row.code).not.toBeNull();

        // assert: ignore — VarietyCounter (auto-increment PK; not asserted)
        // assert: ignore — Preferen.SetupNextBarCode (separate table; not asserted)
    });

});
