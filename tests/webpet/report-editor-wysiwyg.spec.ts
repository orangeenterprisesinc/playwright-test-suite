/**
 * WYSIWYG Report Editor — end-to-end acceptance journey (WEBPET-731).
 *
 * The editor was rebuilt (web-pet bfe869b10 + bb9065e1e) around a
 * popover-editor model, replacing the old sandboxed-iframe + marker/inspector
 * one:
 *
 * - The preview renders inline inside `data-testid="preview-sheet"` — no
 *   iframe, no page headings.
 * - Section triggers ("Page Settings" / "Header" / "Table" / "Footer") sit ON
 *   the canvas — these are both the click targets AND the visible section
 *   labels (WP-0314). The identical four names also exist in an anchor nav
 *   OUTSIDE the sheet, so every locator scopes to the sheet or the nav
 *   explicitly (`ReportEditorPage.sheetTrigger` / `.navAnchor`).
 * - Content-level triggers ("Company Name", "Address", "Edit filter
 *   summary", …) are buttons whose accessible name is a fixed aria-label
 *   while their visible text is the current value.
 * - Most triggers open a `role=dialog` (Page Settings, Header, Table, a
 *   column's Column settings); content triggers like Company Name instead
 *   open an inline popover input that grabs focus pre-filled with the
 *   current value.
 * - Table column headers (`th`) are `draggable`; `.dragTo()` between them
 *   reorders columns. A separate "Group by" drop zone (untouched by these
 *   tests) handles grouping instead.
 * - `report-config-save` (testid) is disabled until the draft is dirty.
 *
 * Realigned against live dev, 2026-08-23 — see ReportEditorPage for the
 * locator contract.
 *
 * Stack runbook (what must be up for this spec to run):
 *   pnpm dev:minio   # docker gotenberg + minio
 *   pnpm dev:api     # Go API (SQL Server via apps/api/.env)
 *   pnpm dev:web     # Vite dev server on :3000
 *
 * Fixture: drives the seeded "Ranch" report (a known, registered report).
 * Most tests only set draft state (never saved) and need no cleanup; WP-0320
 * saves and then restores the original state itself.
 */
import { expect, test } from '@fixtures/webpet.fixture';

/** The seeded report this journey drives. */
const REPORT = 'Ranch';

test.describe('WYSIWYG Report Editor — acceptance journey', { tag: ['@WebPet', '@wp-reporteditor', '@WPBatch10'] }, () => {

    // ── Entry point — the editor opens on a known report with a live preview ───
    test('[Report Editor] Verify that the editor opens on a seeded report with a live preview.', {
        tag: ['@wp-ui', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0308' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.previewSheet).toBeVisible({ timeout: 15000 });

        // No page headings exist any more — assert the preview actually
        // rendered real content instead: a known column header and a data row.
        await expect(editor.columnHeaders.filter({ hasText: 'Name' })).toBeVisible();
        await expect(editor.previewSheet.locator('tbody tr').first()).toBeVisible();
    });

    // ── P0b (WEBPET-733): a content trigger opens an editable, focused input ───
    test('[Report Editor] Verify that clicking an editable area in the preview selects it.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0309' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        await editor.contentTrigger('Company Name').click();

        const input = editor.inlineEditorInput;
        await expect(input).toBeFocused();
        await expect(input).not.toHaveValue('');

        await input.press('Escape');
        await expect(input).toBeHidden();
    });

    // ── P0c (WEBPET-734): two separate routes reach an area's editor ───────────
    test('[Report Editor] Verify that the Header and Table areas are each reachable through their own trigger.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0310' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        // Route 1 — the sheet's Header trigger opens the Header dialog.
        await editor.sheetTrigger('Header').click();
        await expect(editor.editorDialog.getByRole('switch', { name: 'Show Print Date' })).toBeVisible();
        await editor.editorDialog.getByRole('button', { name: 'Close' }).click();

        // Route 2 — "Edit filter summary" opens the Table dialog directly on
        // the Filter Summary tab (covers the filter-summary half of old WP-0319).
        await editor.contentTrigger('Edit filter summary').click();
        await expect(editor.tableTab('Filter Summary')).toHaveAttribute('aria-selected', 'true');
        await expect(editor.editorDialog.getByRole('switch', { name: 'Show Filter Summary' })).toBeVisible();
    });

    // ── P1 (WEBPET-735): editing Company Name updates the preview ──────────────
    test('[Report Editor] Verify that editing the Company Name updates the preview.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0311' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        await editor.contentTrigger('Company Name').click();
        const input = editor.inlineEditorInput;
        await expect(input).toBeFocused();

        const value = `WYSIWYG Test Co ${Date.now()}`;
        await input.fill(value);
        await input.press('Enter');

        // Draft-only edit — the preview re-renders without a Save, no cleanup needed.
        await expect(editor.contentTrigger('Company Name')).toContainText(value, { timeout: 15000 });
    });

    // ── P2 (WEBPET-736): the Table trigger opens a tabbed editor ────────────────
    test('[Report Editor] Verify that the table area opens a tabbed editor.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0312' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await editor.sheetTrigger('Table').click();

        for (const tab of ['General', 'Filter Summary', 'Grouping', 'Pivot', 'Conditional Rules']) {
            await expect(editor.tableTab(tab)).toBeVisible();
        }
    });

    // ── P2 (WEBPET-736): drag-to-reorder columns in the preview ─────────────────
    test('[Report Editor] Verify that dragging a column header reorders the preview columns.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0313' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        const headers = editor.columnHeaders;
        await expect(headers.first()).toBeVisible();
        const labelOf = (n: number) =>
            headers.nth(n).getByRole('button', { name: 'Column settings', exact: true }).innerText();

        // Dragging the 1st header (Name) onto the 3rd (Code) reorders the
        // preceding columns — verified live: [Name, Export Identifier, Code]
        // becomes [Export Identifier, Code, Name].
        await headers.nth(0).dragTo(headers.nth(2));

        await expect(async () => {
            const labels = await Promise.all([labelOf(0), labelOf(1), labelOf(2)]);
            expect(labels).toEqual(['Export Identifier', 'Code', 'Name']);
        }).toPass({ timeout: 15000 });
    });

    // ── Each main section carries its name as an on-canvas trigger label ───────
    test('[Report Editor] Verify that each main section is labelled with its name on the preview.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0314' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        for (const label of ['Header', 'Table', 'Footer', 'Page Settings']) {
            await expect(editor.sheetTrigger(label)).toBeVisible();
        }
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

    // ── P4 (WEBPET-738): on-canvas editing affordances carry an accessible name ─
    test('[Report Editor] Verify that on-canvas editing affordances expose an accessible name.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0316' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        await expect(editor.contentTrigger('Company Name')).toBeVisible();
        await expect(editor.columnSettingsButton()).toBeVisible();
        await expect(editor.resizeButton('Name')).toBeVisible();
    });

    // ── P4 (WEBPET-738): the preview stays mounted across a draft re-render ──────
    test('[Report Editor] Verify that editing keeps the preview sheet mounted.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0317' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        const sheetHandle = await editor.previewSheet.elementHandle();
        expect(sheetHandle).not.toBeNull();

        await editor.contentTrigger('Company Name').click();
        const input = editor.inlineEditorInput;
        await expect(input).toBeFocused();
        const value = `Continuity Co ${Date.now()}`;
        await input.fill(value);
        await input.press('Enter');

        await expect(editor.contentTrigger('Company Name')).toContainText(value, { timeout: 15000 });

        // The sheet never remounted — the handle grabbed before the edit is
        // still attached to the live document.
        const stillConnected = await sheetHandle!.evaluate((node) => node.isConnected);
        expect(stillConnected).toBe(true);
    });

    // ── P3 (WEBPET-737): Page Settings / orientation ────────────────────────────
    test('[Report Editor] Verify that switching orientation reflects in the preview aspect.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0318' },
    }, async ({ pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);
        await expect(editor.previewSheet).toBeVisible({ timeout: 15000 });
        const before = await editor.previewSheet.boundingBox();
        expect(before).not.toBeNull();
        expect(before!.height).toBeGreaterThan(before!.width); // portrait by default

        await editor.sheetTrigger('Page Settings').click();
        await editor.orientationCombobox.click();
        await editor.orientationOption(/Landscape/i).click();
        await editor.editorDialog.getByRole('button', { name: 'Close' }).click();

        // The sheet is a stacked multi-page scroll container, so its bounding
        // height spans every page — width is the orientation signal: landscape
        // re-renders the pages wider than portrait did. Draft-only, no cleanup.
        await expect(async () => {
            const box = await editor.previewSheet.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.width).toBeGreaterThan(before!.width);
        }).toPass({ timeout: 15000 });
    });

    test('[Report Editor] Verify that the widgets and filter-summary areas are reachable from the index.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0319' },
    }, async () => {
        // Widgets were removed from the editor flow entirely (web-pet
        // 219d5ac83, reconfirmed live 2026-08-23) — no Widgets entry exists
        // anywhere in the editor to reach. Filter-summary reachability moved
        // into WP-0310 (the "Edit filter summary" content trigger opens the
        // Table dialog directly on the Filter Summary tab).
        test.fixme(
            true,
            'widgets removed from the editor flow (web-pet 219d5ac83, reconfirmed live 2026-08-23) — no Widgets entry exists; filter-summary reachability moved into WP-0310',
        );
    });

    // ── The full journey — edit, reorder, save, persist, restore ────────────────
    test('[Report Editor] Verify the full hover to marker to sheet journey reflects in the preview and PDF.', {
        tag: ['@wp-ui', '@wp-e2e'],
        annotation: { type: 'testCaseId', description: 'WP-0320' },
    }, async ({ page, pages }) => {
        const editor = pages.reportEditor;
        await editor.gotoReport(REPORT);

        const companyNameTrigger = editor.contentTrigger('Company Name');
        const original = ((await companyNameTrigger.textContent()) ?? '').trim();
        const updated = `WYSIWYG Journey ${Date.now()}`;

        // The save mutation's exact route is unconfirmed live — matched broadly
        // by method + "report" in the URL, which is what the Save click fires.
        const waitForSave = () =>
            page.waitForResponse(
                (res) => /report/i.test(res.url()) && ['POST', 'PUT', 'PATCH'].includes(res.request().method()),
            );

        await test.step('edit Company Name (P1 — WEBPET-735)', async () => {
            await companyNameTrigger.click();
            const input = editor.inlineEditorInput;
            await expect(input).toBeFocused();
            await input.fill(updated);
            await input.press('Enter');
            await expect(editor.contentTrigger('Company Name')).toContainText(updated, { timeout: 15000 });
        });

        await test.step('reorder a table column via drag (P2 — WEBPET-736)', async () => {
            const headers = editor.columnHeaders;
            await headers.nth(0).dragTo(headers.nth(2));
            await expect(
                headers.nth(2).getByRole('button', { name: 'Column settings', exact: true }),
            ).toHaveText('Name', { timeout: 15000 });
        });

        await test.step('Save persists the draft across a reload (WEBPET-740)', async () => {
            const savePromise = waitForSave();
            await editor.saveButton.click();
            const response = await savePromise;
            expect(response.ok()).toBe(true);

            await page.reload();
            await expect(editor.contentTrigger('Company Name')).toContainText(updated, { timeout: 15000 });
            // Print/PDF has no surface on this page — /reports/run owns
            // printing, which is out of this spec's scope.
        });

        await test.step('restore the original Company Name and column order', async () => {
            await editor.contentTrigger('Company Name').click();
            const input = editor.inlineEditorInput;
            await expect(input).toBeFocused();
            await input.fill(original);
            await input.press('Enter');
            await expect(editor.contentTrigger('Company Name')).toContainText(original, { timeout: 15000 });

            const headers = editor.columnHeaders;
            await headers.nth(2).dragTo(headers.nth(0));
            await expect(
                headers.nth(0).getByRole('button', { name: 'Column settings', exact: true }),
            ).toHaveText('Name', { timeout: 15000 });

            const restorePromise = waitForSave();
            await editor.saveButton.click();
            const restoreResponse = await restorePromise;
            expect(restoreResponse.ok()).toBe(true);
        });
    });

});
