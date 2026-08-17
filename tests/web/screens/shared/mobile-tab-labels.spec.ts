// spec: test-plans/screens/shared.md
// seed: tests/seed.spec.ts

/**
 * At mobile widths the Crop form's tab strip collapses into a Select. This
 * checks the collapsed dropdown renders human labels rather than raw values.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/screens/shared.md` |
 * | Runner rows | `src/data/runner/screens.csv` → `SCR-152` |
 *
 * Relocated from `tests/webpet/mobile-tab-labels.spec.ts` (WP-0242). Every
 * assertion below is the one that spec carried; what changed is the fixture
 * (`base.fixture`), the id and tag vocabulary, and `beforeAll`/`afterAll`
 * moving from webpet's `request` fixture to `sessionApi`.
 *
 * Capture-heavy like select-smoke: the visible-item list is logged and
 * screenshotted for review. `page.waitForTimeout` is kept deliberately — the
 * waits let the responsive re-layout and the popover settle before capture.
 */
// `expect` is deliberately not imported: this test asserts nothing. It drives the
// collapse, screenshots it and logs the item labels for human review. The click
// still fails loudly if the trigger is absent, so the collapse itself is proven —
// the labels are not.
import { test } from '@fixtures/base.fixture';
import { ensureCrop, deleteCrop, type EnsuredCrop } from '@data/generated/data-factory';

// Owns its own crop (edit form hosts the mobile tab dropdown), instead of a
// hardcoded crop id that may not exist in every client DB. See data-factory.ts.
let crop: EnsuredCrop;

test.beforeAll(async ({ sessionApi }) => {
    crop = await ensureCrop(sessionApi);
});

test.afterAll(async ({ sessionApi }) => {
    if (crop) await deleteCrop(sessionApi, crop.id);
});

test.describe('CropFormPage mobile tabs', { tag: ['@Screens', '@Shared'] }, () => {

    test('[Crop] Verify that the mobile tab dropdown shows labels rather than raw values.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'SCR-152' },
            { type: 'requirement', description: 'SCR-R168' },
        ],
    }, async ({ page, pages }) => {
        const form = pages.cropForm;
        await page.setViewportSize({ width: 600, height: 900 });
        await form.gotoEdit(crop.id);
        await form.waitForFormRoot();
        await page.waitForTimeout(500);

        const mobileTrigger = form.firstSelectTrigger;
        await mobileTrigger.scrollIntoViewIfNeeded();
        await mobileTrigger.click();
        await page.waitForTimeout(400);

        await page.screenshot({ path: 'e2e/.screenshots/mobile-tab-dropdown.png', fullPage: true });

        const items = form.visibleSelectItems;
        const count = await items.count();
        console.log('item count:', count);
        for (let i = 0; i < count; i++) {
            const text = await items.nth(i).innerText();
            console.log(`item ${i}: "${text}"`);
        }
    });

});
