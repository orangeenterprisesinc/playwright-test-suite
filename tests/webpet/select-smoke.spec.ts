/**
 * Visual smoke coverage for the Select→base-ui migration.
 *
 * Unusual by design: most of what this file produces are **screenshots** under
 * `e2e/.screenshots/`, not assertions — WP-0369 has no assertion at all. It
 * exists to capture the migrated controls for eyeball review, so the captures
 * are the deliverable and the few assertions are guard rails around them.
 *
 * Two conventions are deliberately broken here, both under R4 (behaviour
 * preservation):
 *   - `page.waitForTimeout(...)` is kept. The framework forbids it, but these
 *     waits exist to let popovers and scroll animations settle before a capture;
 *     replacing them with web-first waits would change what the screenshots show.
 *   - The screenshot paths are CWD-relative and create a stray `e2e/` directory
 *     at the repo root. Already gitignored (`.gitignore` names this file).
 *
 * Framework-aligned (Batch 05): every locator moved onto CrewFormPage /
 * JobFormPage / CrewListPage. The screenshot and keyboard calls stay in the
 * spec — they are actions on the run, not page structure.
 */
import { expect, test } from '@fixtures/webpet.fixture';
import {
    ensureCrew,
    deleteCrew,
    ensureJob,
    deleteJob,
    type EnsuredCrew,
    type EnsuredJob,
} from './data-factory';

// Crew and Job refs de-hardcoded to factory-created rows (were the shared id=1
// crew and /setup/jobs/1 job). Assert against `crew.*` / `job.*` so no two
// files touch the same row and the suite is safe above one worker.
let crew: EnsuredCrew;
let job: EnsuredJob;

test.beforeAll(async ({ request }) => {
    crew = await ensureCrew(request);
    job = await ensureJob(request);
});

test.afterAll(async ({ request }) => {
    if (crew) await deleteCrew(request, crew.id);
    if (job) await deleteJob(request, job.id);
});

test.describe('Select migration smoke', { tag: ['@WebPet', '@wp-selectmigration', '@WPBatch05'] }, () => {
    test.describe.configure({ mode: 'serial' });

    test('[Select] Verify that the crew form renders its boolean Switches after the migration.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0368' },
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.waitForFormRoot();
        await page.waitForTimeout(500);

        await page.screenshot({ path: 'e2e/.screenshots/crew-form-closed.png', fullPage: true });

        // Smoke signal for the Select→Switch (shadcn→base-ui) migration: the crew form's
        // Yes/No fields render as switches. The default (General) view now shows 7 switches —
        // Active + the grouping/piece/break toggles below. (The original test named
        // Include-in-Transfer/Payroll/CostAcc, but those controls moved off this view since
        // it was written; the include-in-CostAcc one is also module-gated. The migration is
        // what's under test, so assert against switches actually on this view.)
        await expect(form.switches).toHaveCount(7);
        await expect(form.fieldLabel('Group Clock-In Times')).toBeVisible();
        await expect(form.fieldLabel('Group Clock-Out Times')).toBeVisible();
        await expect(form.fieldLabel('Time Employees Included')).toBeVisible();
    });

    test('[Select] Capture the crew form ParentPickers in combobox and sheet mode.', {
        tag: ['@wp-ui', '@wp-visual'],
        annotation: { type: 'testCaseId', description: 'WP-0369' },
    }, async ({ page, pages }) => {
        const form = pages.crewForm;
        await form.gotoEdit(crew.id);
        await form.waitForFormRoot();
        await page.waitForTimeout(500);
        await form.departmentRow.scrollIntoViewIfNeeded();
        // Capture-only: this test intentionally asserts nothing. Its output is the
        // screenshot below, reviewed by eye against the migration.
        await page.screenshot({
            path: 'e2e/.screenshots/crew-parent-pickers.png',
            clip: { x: 0, y: 150, width: 1200, height: 400 },
        });
    });

    test('[Select] Verify the job form numeric enum, nullable tri-state and tab add-row.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0370' },
    }, async ({ page, pages }) => {
        const form = pages.jobForm;
        await form.gotoEdit(job.id);
        await form.waitForFormRoot();
        await page.waitForTimeout(500);

        await expect(form.paymentTypeTrigger).toBeVisible();
        await form.paymentTypeTrigger.scrollIntoViewIfNeeded();
        await form.paymentTypeTrigger.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'e2e/.screenshots/job-paymenttype-open.png', fullPage: false });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // PET-60: includeIdleTime was a tri-state Select; now a non-nullable Checkbox.
        // base-ui renders the visible control as <span role="checkbox" data-slot="checkbox"
        // aria-checked=…> with its OWN generated id; `id="includeIdleTime"` is on a sibling
        // hidden <input>. So neither `#includeIdleTime` (that's the hidden input) nor a
        // :has() on it finds the visible control. The stable link is aria-labelledby →
        // the field label's id, which is what `checkboxFor()` encodes.
        await expect(form.includeIdleTimeControl).toBeVisible();
        await expect(form.includeIdleTimeControl).toHaveAttribute('aria-checked', /true|false|mixed/);

        // Crops tab — add-row Select (placeholder pattern)
        await form.formTab('Crops').click();
        await page.waitForTimeout(300);
        await form.firstSelectTrigger.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'e2e/.screenshots/job-crops-add-open.png', fullPage: false });
        await page.keyboard.press('Escape');
    });

    test('[Select] Verify the crew list filter Select and Multi-Update toggle.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0371' },
    }, async ({ page, pages }) => {
        const list = pages.crewList;
        await list.gotoList();
        await page.waitForTimeout(300);

        await page.screenshot({
            path: 'e2e/.screenshots/crew-list-filter-row.png',
            clip: { x: 0, y: 0, width: 1200, height: 300 },
        });

        await expect(list.grid.filterSelectTrigger()).toBeVisible();
        await list.grid.filterSelectTrigger().click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'e2e/.screenshots/crew-list-filter-open.png', fullPage: false });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Toggle Multi-Update selection mode (forest-moss aria-pressed styling).
        // The lifted spec used a looser matcher (/multi[- ]?update/i); the anchored
        // one on the grid component resolves to the same control — setup-batch-b,
        // field and ranch all drive it that way.
        await list.grid.toggleMultiUpdate();
        await page.waitForTimeout(300);
        await page.screenshot({
            path: 'e2e/.screenshots/crew-list-mu-active.png',
            clip: { x: 0, y: 0, width: 1400, height: 250 },
        });
    });

});
