/**
 * Catalog workflow R2 — Run dialog and report parameters.
 * Data: src/data/journey-r/r02-run-dialog-and-report-parameters.json · Plan: test-plans/journey-r/r02-run-dialog-and-report-parameters.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { RunDialogCaseSchema } from '@data/schemas/journeyRScenario';
import { loadScenario } from '@utils/data/scenarioLoader';

test.describe('R2 · Run dialog and report parameters', { tag: ['@JourneyR', '@R2'] }, () => {
    test("End-to-end: open a report's Run dialog, read its labels, switch the variant, use Yes/No, choice, date and entity parameters, run it to the PDF viewer, then reopen and Cancel", {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'R2' }],
    }, async ({ pages }, testInfo) => {
        test.setTimeout(240_000);

        const s = await loadScenario(RunDialogCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const hub = pages.reportsHub;
        const dialog = hub.runDialog;
        const { variantReport: v, runReport: r } = s;
        const raw = new RegExp(s.dialog.rawLabelPattern);
        const lastRunShape = new RegExp(s.lastRunPattern);

        // 1. Open Administration ▸ Reports.
        await hub.openFromMenu();

        // 2. Run on the variant report: title, description, labels, descriptions, no raw identifiers.
        await hub.filterByModule(v.module);
        await hub.filterByName(v.nameFilter);
        await hub.openRun(v.report);
        await expect(dialog.title).toHaveText(`${s.dialog.titlePrefix}${v.report}`);
        await expect(dialog.description).toHaveText(s.dialog.description);
        await expect(dialog.cancelButton).toBeVisible();
        await expect(dialog.runButton).toBeVisible();
        // The dialog opens before its parameters load.
        await expect.poll(() => dialog.parameterLabels(), { message: `${v.report} parameter labels` }).toEqual(v.labels);
        const labels = await dialog.parameterLabels();
        expect(labels.filter((l) => raw.test(l)), 'labels that look like raw identifiers').toEqual([]);
        for (const [label, text] of Object.entries(v.descriptions)) {
            await expect(dialog.descriptionOf(label), `description of '${label}'`).toHaveText(text);
        }

        // 3. Yes/No renders as a radio pair with the default checked.
        await expect(await dialog.yesNo(v.yesNo.label)).toHaveCount(2);
        for (const option of v.yesNo.options) await expect(await dialog.radio(v.yesNo.label, option)).toBeVisible();
        await expect(await dialog.radio(v.yesNo.label, v.yesNo.default)).toHaveAttribute('aria-checked', 'true');
        await (await dialog.radio(v.yesNo.label, v.yesNo.pick)).click();
        await expect(await dialog.radio(v.yesNo.label, v.yesNo.pick)).toHaveAttribute('aria-checked', 'true');
        await expect(await dialog.radio(v.yesNo.label, v.yesNo.default)).toHaveAttribute('aria-checked', 'false');

        // 4. The fixed-choice dropdown lists legible options.
        expect(await dialog.selectOptions(v.choice.label), `${v.choice.label} options`).toEqual(v.choice.options);
        await dialog.pickChoice(v.choice.label, v.choice.pick);
        await expect(await dialog.control(v.choice.label)).toContainText(v.choice.pick);

        // 5. Switching the variant retitles the dialog and changes the parameter set.
        expect(await dialog.selectOptions(v.variant.label), 'variant options').toEqual(v.variant.options);
        await dialog.pickChoice(v.variant.label, v.variant.switchTo);
        await expect(dialog.title).toHaveText(`${s.dialog.titlePrefix}${v.variant.switchTo}`);
        await expect.poll(() => dialog.parameterLabels(), { message: 'labels after switching the variant' }).toEqual(v.variant.labelsAfter);

        // 6. Cancel closes without running; Last Run is untouched.
        await dialog.cancel(s.noRunWindowMs);
        expect(await hub.lastRun(v.report), `${v.report} Last Run after Cancel`).toBe(s.neverRunText);

        // 7. Filter to the report that runs, and read its Last Run before the run.
        if (r.module !== v.module) await hub.filterByModule(r.module);
        await hub.filterByName(r.nameFilter);
        const lastBefore = await hub.lastRun(r.report);

        // 8. Run on the Attendance report: title, labels, descriptions, the range prompt.
        await hub.openRun(r.report);
        await expect(dialog.title).toHaveText(`${s.dialog.titlePrefix}${r.report}`);
        await expect.poll(() => dialog.parameterLabels(), { message: `${r.report} parameter labels` }).toEqual(r.labels);
        for (const [label, text] of Object.entries(r.descriptions)) {
            await expect(dialog.descriptionOf(label), `description of '${label}'`).toHaveText(text);
        }
        await expect(await dialog.control(r.range.label)).toHaveText(r.range.prompt);

        // 9. Single-date fields start empty and hold the picked day after clicking elsewhere.
        for (const d of r.dates) await expect(await dialog.control(d.label)).toHaveText(r.singleDatePrompt);
        for (const d of r.dates) {
            await dialog.pickDate(d.label, d.dayOffset);
            const text = (await (await dialog.control(d.label)).innerText()).trim();
            expect(text, `${d.label} shows one date, not a range`).not.toMatch(/[–-]\s*\d/);
        }

        // 10. Entity picker: search lists results, selecting one sets the value.
        await expect(await dialog.control(r.entity.label)).toHaveAttribute('placeholder', r.entity.placeholder);
        const found = await dialog.searchEntity(r.entity.label, r.entity.searchText);
        expect(found.some((o) => o.endsWith(r.entity.pick)), `'${r.entity.pick}' among ${found.join(' · ')}`).toBe(true);
        await dialog.pickEntity(r.entity.label, r.entity.pick);

        // 11. Choice parameter.
        expect(await dialog.selectOptions(r.choice.label), `${r.choice.label} options`).toEqual(r.choice.options);
        await dialog.pickChoice(r.choice.label, r.choice.pick);
        await expect(await dialog.control(r.choice.label)).toContainText(r.choice.pick);

        // 12. Run: Running…, 200, the viewer opens on a blob PDF.
        const outcome = await dialog.run(testInfo.outputPath('r02-attendance.pdf'));
        testInfo.annotations.push({ type: 'run-response', description: `status ${outcome.status}, content-type ${outcome.contentType}` });
        expect(outcome.status).toBe(200);
        expect(outcome.viewerHeading.startsWith(r.viewerHeadingPrefix), `viewer heading '${outcome.viewerHeading}'`).toBe(true);
        expect(outcome.viewerSrc.startsWith('blob:'), `viewer src '${outcome.viewerSrc}'`).toBe(true);
        expect(outcome.savedBytes, 'downloaded PDF size').toBeGreaterThan(0);
        expect(outcome.savedHead, 'downloaded file magic bytes').toBe(r.pdfMagic);

        // 13. Closing the viewer: Last Run now shows a date-time.
        await dialog.viewer.close();
        await expect.poll(() => hub.lastRun(r.report), { message: `${r.report} Last Run after the run` }).toMatch(lastRunShape);
        const lastAfter = await hub.lastRun(r.report);
        expect(lastAfter, 'Last Run changed after the run').not.toBe(lastBefore);

        // 14. Reopen and Cancel: no run request, Last Run unchanged.
        await hub.openRun(r.report);
        await dialog.cancel(s.noRunWindowMs);
        expect(await hub.lastRun(r.report), 'Last Run after the second Cancel').toBe(lastAfter);
    });
});
