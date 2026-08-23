/**
 * At mobile widths the Crop form's tab strip collapses into a Select. This
 * checks the collapsed dropdown renders human labels rather than raw values.
 *
 * Capture-heavy like select-smoke: the visible-item list is logged and
 * screenshotted for review. `page.waitForTimeout` is kept deliberately (R4) —
 * the waits let the responsive re-layout and the popover settle before capture.
 *
 * Framework-aligned (Batch 06): the collapsed-tab Select and its visible-item
 * filter live on WebpetFormPage; `visibleSelectItems` encodes why the
 * `:not(.hidden)` filter matters — the full option set stays mounted.
 */
import { test } from '@fixtures/webpet.fixture';
import { ensureCrop, deleteCrop, type EnsuredCrop } from './data-factory';

// Owns its own crop (edit form hosts the mobile tab dropdown), instead of a
// hardcoded crop id that may not exist in every client DB. See data-factory.ts.
let crop: EnsuredCrop;

test.beforeAll(async ({ request }) => {
    crop = await ensureCrop(request);
});

test.afterAll(async ({ request }) => {
    if (crop) await deleteCrop(request, crop.id);
});

test.describe('CropFormPage mobile tabs', { tag: ['@WebPet', '@wp-mobiletabs', '@WPBatch06'] }, () => {

    test('[Crop] Verify that the mobile tab dropdown shows labels rather than raw values.', {
        tag: ['@wp-ui', '@wp-visual'],
        annotation: { type: 'testCaseId', description: 'WP-0242' },
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

        await page.screenshot({ path: 'artifacts/results/screenshots/mobile-tab-dropdown.png', fullPage: true });

        const items = form.visibleSelectItems;
        const count = await items.count();
        console.log('item count:', count);
        for (let i = 0; i < count; i++) {
            const text = await items.nth(i).innerText();
            console.log(`item ${i}: "${text}"`);
        }
    });

});
