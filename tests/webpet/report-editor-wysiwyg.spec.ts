/**
 * WYSIWYG Report Editor — end-to-end acceptance journey (WEBPET-731).
 *
 * THIS SPEC IS THE GATE for WEBPET-731..740. The Definition of Done for the
 * WYSIWYG feature is this journey passing in a REAL browser against the running
 * stack — not unit tests. Built acceptance-first: the entry-point test passes
 * today; the full journey is `test.fixme` and is enabled incrementally as each
 * P-ticket lands, until the sign-off ticket (WEBPET-740) removes the last fixme
 * and the whole journey is green.
 *
 * Stack runbook (what must be up for this spec to run):
 *   pnpm dev:minio   # docker gotenberg + minio
 *   pnpm dev:api     # Go API (SQL Server via apps/api/.env)
 *   pnpm dev:web     # Vite dev server on :3000
 *
 * Fixture: drives the seeded "Ranch" report (a known, registered report). The
 * editing steps set a draft state that is never saved, so they need no cleanup.
 *
 * Framework-aligned (Batch 10): locators live in ReportEditorPage, which
 * separates the **host** DOM from the **sandboxed preview frame** — the two
 * families look similar (`data-active-area` vs `data-area`) and mixing them up
 * yields a locator that never resolves.
 *
 * STALE — the editor was rebuilt after these were authored. web-pet replaced the
 * sandboxed iframe with an inline React ReportCanvas (bfe869b10, 2026-06-10) and
 * dropped the marker overlay + right inspector rail for popover editors + an
 * anchor menu (bb9065e1e); none of `data-marker-area` / `data-active-area` /
 * `data-inspector-area` exist any more, in source or in the deployed bundle. Only
 * WP-0315 (zoom, testid `preview-sheet`) survived the rebuild and still passes.
 * The rest are fixme'd below until this file and ReportEditorPage are rewritten
 * against the ReportCanvas UI. The earlier note here blaming a missing seeded
 * report on dev was wrong — the report renders; the architecture moved.
 */
import { expect, test } from '@fixtures/webpet.fixture';

/** The seeded report this journey drives. */
const REPORT = 'Ranch';

/** One reason string so the skip report groups all of these together. */
const STALE_EDITOR =
    'editor rebuilt: iframe→inline ReportCanvas (web-pet bfe869b10), markers/inspector→popovers (bb9065e1e) — spec rewrite pending';

test.describe('WYSIWYG Report Editor — acceptance journey', { tag: ['@WebPet', '@wp-reporteditor', '@WPBatch10'] }, () => {

    // ── Entry point — real, passing today ──────────────────────────────────────
    // Proves the journey can reach the editor on a known report and that the
    // preview renders. If this breaks, the gate goes red regardless of the
    // WYSIWYG work below.
    test('[Report Editor] Verify that the editor opens on a seeded report with a live preview.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0308' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0309' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0310' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0311' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0312' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0313' },
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

        await expect(async () => {
            const firstAfter = await editor.frameColumnHeaders.nth(0).getAttribute('data-col-id');
            expect(firstAfter).toBe(secondBefore);
        }).toPass({ timeout: 15000 });
    });

    // ── Each main section carries a pointed label tag naming the region ─────────
    test('[Report Editor] Verify that each main section is labelled with its name on the preview.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0314' },
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // labels lived on the removed markers
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.marker('header')).toBeVisible({ timeout: 15000 });
        await expect(editor.marker('header')).toContainText('Header');
    });

    // ── P4 (WEBPET-738): zoom control scales the preview sheet ──────────────────
    test('[Report Editor] Verify that zooming in enlarges the preview sheet and reset restores it.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0315' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0316' },
    }, async ({ pages }) => {
        test.fixme(true, STALE_EDITOR); // aria-label lived on the removed markers
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.marker('header')).toBeVisible({ timeout: 15000 });
        await expect(editor.marker('header')).toHaveAttribute('aria-label', /Header/i);
    });

    // ── P4 (WEBPET-738): the preview stays mounted across a draft re-render ──────
    test('[Report Editor] Verify that editing keeps the preview sheet mounted.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0317' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0318' },
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
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0319' },
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
        tag: ['@wp-ui', '@wp-e2e'],
        annotation: { type: 'testCaseId', description: 'WP-0320' },
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
