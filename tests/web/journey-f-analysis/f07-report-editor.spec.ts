/**
 * WYSIWYG Report Editor — relocated acceptance journey for Catalog workflow
 * **F7 — Report generation and export**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/journey-f/f07-report-editor.md` |
 * | Runner rows | `src/data/runner/journey-f.csv` → `F7-002`…`F7-014` |
 *
 * Relocated from `tests/webpet/report-editor-wysiwyg.spec.ts` (WP-0308…WP-0320).
 * Every assertion below is the one that spec carried, in the same order and the
 * same describe; what changed is the fixture (`base.fixture`) and the id/tag
 * vocabulary.
 *
 * 12 of these 13 tests are `test.fixme`'d in the source and remain so here: the
 * app rebuilt the editor after they were authored (iframe → inline
 * ReportCanvas, markers/inspector → popovers), so none of `data-marker-area` /
 * `data-active-area` / `data-inspector-area` exist any more, in source or in
 * the deployed bundle. Their runner rows are `enabled=0`, so the traceability
 * matrix stops crediting them as coverage until the rewrite lands. `F7-009`
 * (zoom, testid `preview-sheet`) is the only test that survived the rebuild
 * and the only live row — it carries the file's only `@Smoke` (the source's
 * `@wp-smoke` sat on WP-0308/F7-002, which is fixme'd; a test that asserts
 * nothing must not hold the file's only smoke tag).
 */
import { expect, test } from '@fixtures/base.fixture';

/** The seeded report this journey drives. */
const REPORT = 'Ranch';

/** One reason string so the skip report groups all of these together. */
const STALE_EDITOR =
    'editor rebuilt: iframe→inline ReportCanvas (web-pet bfe869b10), markers/inspector→popovers (bb9065e1e) — spec rewrite pending';

test.describe('WYSIWYG Report Editor — acceptance journey', { tag: ['@JourneyF', '@F7'] }, () => {

    // ── Entry point — real, passing today ──────────────────────────────────────
    // Proves the journey can reach the editor on a known report and that the
    // preview renders. If this breaks, the gate goes red regardless of the
    // WYSIWYG work below.
    test('[Report Editor] Verify that the editor opens on a seeded report with a live preview.', {
        tag: ['@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-002' },
            { type: 'requirement', description: 'F7-R1' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // asserts the removed iframe + old heading
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        // The page title names the report being edited ("Edit <name> Report").
        await expect(editor.editHeading(REPORT)).toBeVisible();
        // The preview renders the report inside a sandboxed iframe (PrintSheet).
        await expect(editor.previewIframe).toBeVisible({ timeout: 15000 });
    });

    // ── P0b (WEBPET-733): the preview is an interactive selection surface ───────
    test('[Report Editor] Verify that clicking an editable area in the preview selects it.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-003' },
            { type: 'requirement', description: 'F7-R2' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // iframe sandbox + data-active-area are gone
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        // The preview iframe runs the agent (scripts allowed, opaque origin).
        await expect(editor.previewIframe).toHaveAttribute('sandbox', /allow-scripts/);

        // Click the header area inside the iframe; the host reflects the selection
        // on the stable data-active-area hook.
        await editor.frameArea('header').click();
        await expect(editor.activeArea('header')).toBeVisible({ timeout: 10000 });
    });

    // ── P0c (WEBPET-734): numbered markers + inspector Sheet; no left nav ───────
    test('[Report Editor] Verify that a marker opens its area and the index drills in.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-004' },
            { type: 'requirement', description: 'F7-R3' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // markers + inspector Sheet + index removed
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        // A numbered marker for the header area is rendered in the host overlay and
        // opens the Branding section in the right inspector Sheet.
        await expect(editor.marker('header')).toBeVisible({ timeout: 15000 });
        await editor.marker('header').click();
        await expect(editor.inspector('header')).toBeVisible();

        // Back returns to the numbered index; drill into Table from there.
        await editor.indexButton(/Back/i).click();
        await editor.indexButton(/Table/).click();
        await expect(editor.inspector('table')).toBeVisible();
    });

    // ── P1 (WEBPET-735): mingled area editors — edit a field, preview reflects ──
    test('[Report Editor] Verify that editing the Company Name updates the preview.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-005' },
            { type: 'requirement', description: 'F7-R4' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // driven via the removed marker overlay
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        // Open the Header area via its marker; the mingled editor exposes the
        // branding Company Name field.
        await editor.marker('header').click();
        await expect(editor.companyNameInput).toBeVisible();

        const value = 'WYSIWYG Test Co';
        await editor.companyNameInput.fill(value);

        // The preview re-renders and shows the new company name (draft, not saved).
        await expect(editor.frameText(value)).toBeVisible({ timeout: 15000 });
    });

    // ── P2 (WEBPET-736): tabbed Table editor ───────────────────────────────────
    test('[Report Editor] Verify that the table area opens a tabbed editor.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-006' },
            { type: 'requirement', description: 'F7-R5' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // driven via the removed marker overlay
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await editor.marker('table').click();
        await expect(editor.inspector('table')).toBeVisible();
        await expect(editor.tableTab(/Columns/)).toBeVisible();
        await expect(editor.tableTab(/Sorting/)).toBeVisible();
        await expect(editor.tableTab(/Grouping/)).toBeVisible();
        await expect(editor.tableTab(/Pivot/)).toBeVisible();
    });

    // ── P2 (WEBPET-736): drag-to-reorder columns in the preview ─────────────────
    test('[Report Editor] Verify that dragging a column header reorders the preview columns.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-007' },
            { type: 'requirement', description: 'F7-R6' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // frameColumnHeaders reach through the removed iframe
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.marker('table')).toBeVisible({ timeout: 15000 });

        const headers = editor.frameColumnHeaders;
        await expect(headers.nth(1)).toBeVisible();
        const secondBefore = await headers.nth(1).getAttribute('data-col-id');

        // Drag the 2nd header onto the 1st → the 2nd column becomes first.
        await headers.nth(1).dragTo(headers.nth(0));

        // Relocated verbatim. config/lint/.eslintrc.json downgrades
        // prefer-web-first-assertions to a warning for tests/webpet/** only, so
        // this rule was silenced there rather than satisfied. The test is
        // test.fixme'd pending the ReportCanvas rewrite, so converting to
        // toHaveAttribute() would change an assertion no run can validate — the
        // rewrite owns it.
        await expect(async () => {
            const firstAfter = await editor.frameColumnHeaders.nth(0).getAttribute('data-col-id');
            // eslint-disable-next-line playwright/prefer-web-first-assertions
            expect(firstAfter).toBe(secondBefore);
        }).toPass({ timeout: 15000 });
    });

    // ── Each main section carries a pointed label tag naming the region ─────────
    test('[Report Editor] Verify that each main section is labelled with its name on the preview.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-008' },
            { type: 'requirement', description: 'F7-R7' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // labels lived on the removed markers
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.marker('header')).toBeVisible({ timeout: 15000 });
        await expect(editor.marker('header')).toContainText('Header');
    });

    // ── P4 (WEBPET-738): zoom control scales the preview sheet ──────────────────
    test('[Report Editor] Verify that zooming in enlarges the preview sheet and reset restores it.', {
        tag: ['@Smoke', '@HighLevel', '@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-009' },
            { type: 'requirement', description: 'F7-R8' },
        ],
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.previewSheet).toBeVisible({ timeout: 15000 });
        const before = await editor.previewSheet.boundingBox();
        expect(before).not.toBeNull();

        // Two zoom-in clicks grow the rendered sheet.
        await editor.zoomInButton.click();
        await editor.zoomInButton.click();
        await expect(async () => {
            const box = await editor.previewSheet.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.width).toBeGreaterThan(before!.width + 1);
        }).toPass({ timeout: 10000 });

        // Reset returns to the auto-fit size.
        await editor.resetZoomButton.click();
        await expect(async () => {
            const box = await editor.previewSheet.boundingBox();
            expect(box).not.toBeNull();
            expect(Math.abs(box!.width - before!.width)).toBeLessThan(2);
        }).toPass({ timeout: 10000 });
    });

    // ── P4 (WEBPET-738): markers carry an accessible name ───────────────────────
    test('[Report Editor] Verify that a preview marker exposes its region name as an accessible label.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-010' },
            { type: 'requirement', description: 'F7-R9' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // aria-label lived on the removed markers
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.marker('header')).toBeVisible({ timeout: 15000 });
        await expect(editor.marker('header')).toHaveAttribute('aria-label', /Header/i);
    });

    // ── P4 (WEBPET-738): the preview stays mounted across a draft re-render ──────
    test('[Report Editor] Verify that editing keeps the preview sheet mounted.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-011' },
            { type: 'requirement', description: 'F7-R10' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // edits are driven via the removed marker overlay
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.previewSheet).toBeVisible({ timeout: 15000 });

        await editor.marker('header').click();
        await expect(editor.companyNameInput).toBeVisible();
        await editor.companyNameInput.fill('Continuity Co');

        // The sheet must remain present (rendered from the persisted HTML) while the
        // draft re-render is in flight — it never unmounts.
        await expect(editor.previewSheet).toBeVisible();
        await expect(editor.frameText('Continuity Co')).toBeVisible({ timeout: 15000 });
        await expect(editor.previewSheet).toBeVisible();
    });

    // ── P3 (WEBPET-737): page setup / widgets / filter-summary areas ────────────
    test('[Report Editor] Verify that switching orientation reflects in the preview aspect.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-012' },
            { type: 'requirement', description: 'F7-R11' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // Page Setup lived on the removed inspector index
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.previewSheet).toBeVisible({ timeout: 15000 });
        const before = await editor.previewSheet.boundingBox();
        expect(before).not.toBeNull();
        expect(before!.height).toBeGreaterThan(before!.width); // portrait by default

        // The inspector opens on the section index by default — open Page Setup and
        // switch to Landscape.
        await editor.indexButton(/Page Setup/).click();
        await expect(editor.inspector('pageSetup')).toBeVisible();
        await editor.orientationCombobox.click();
        await editor.orientationOption(/Landscape/i).click();

        // The preview sheet becomes landscape (wider than tall).
        await expect(async () => {
            const box = await editor.previewSheet.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.width).toBeGreaterThan(box!.height);
        }).toPass({ timeout: 15000 });
    });

    test('[Report Editor] Verify that the widgets and filter-summary areas are reachable from the index.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-013' },
            { type: 'requirement', description: 'F7-R12' },
        ],
    }, async ({ pages }) => {
        // Not just stale — the feature moved: widgets were hidden from the editor
        // flow on purpose (web-pet 219d5ac83). Rewrite must decide whether this
        // assertion still has a subject at all.
        test.fixme(true, 'widgets hidden from the editor flow (web-pet 219d5ac83) — no Widgets entry to reach');
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        // The inspector opens on the section index by default.
        await editor.indexButton(/Widgets/).click();
        await expect(editor.inspector('widgets')).toBeVisible();
        await editor.indexButton(/Back/i).click();
        // Title & Filters was merged into Header — the filter-summary controls live there now.
        await editor.indexButton(/Header/).click();
        await expect(editor.inspector('header')).toBeVisible();
    });

    // ── The full journey — fixme until the WYSIWYG canvas exists ────────────────
    // Each P-ticket turns one step into a real assertion; WEBPET-740 removes this
    // fixme and the whole journey must be green.
    test('[Report Editor] Verify the full hover to marker to sheet journey reflects in the preview and PDF.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'F7-014' },
            { type: 'requirement', description: 'F7-R13' },
        ],
    }, async ({ pages }) => {
        test.fixme(true, 'WYSIWYG canvas not built yet — enabled by WEBPET-732..740');

        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        await test.step('hovering an editable area highlights it (P0b/P0c — WEBPET-733/734)', async () => {
            // TODO: hover the header area → an outline/highlight appears on the canvas.
        });
        await test.step('clicking a marker opens its area in the right Sheet (P0c — WEBPET-734)', async () => {
            // TODO: click the Header marker → the right Sheet shows the Header editor.
        });
        await test.step('edit Company Name in the sheet → preview reflects it (P1 — WEBPET-735)', async () => {
            // TODO: change Company Name; assert the preview iframe shows the new name.
        });
        await test.step('add a Website that was not present → preview reflects it (P1 — WEBPET-735)', async () => {
            // TODO: add a website via the Header area; assert it appears in the preview.
        });
        await test.step('reorder a table column via drag → order changes (P2 — WEBPET-736)', async () => {
            // TODO: drag a column header to a new position; assert the column order.
        });
        await test.step('Save → preview iframe AND the printed PDF reflect all changes (WEBPET-740)', async () => {
            // TODO: Save; assert the preview and the Print Report PDF both show the edits.
        });
    });

});
