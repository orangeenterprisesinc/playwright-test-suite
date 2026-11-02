/**
 * WEBPET-3929 — after a Quick Add save the banner has Print badge (and Open record); Print badge prints without opening the record.
 * Data: src/data/client-feedback/webpet-3929-employee-quick-add-print-badge.json · Plan: test-plans/client-feedback/webpet-3929-employee-quick-add-print-badge.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { QuickAddPrintBadgeCaseSchema } from '@data/schemas/clientFeedbackScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { mintQuickAddEmployee } from '@utils/client-feedback/clientFeedbackFlow';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('WEBPET-3929 · Employee Add Quick: Print badge in the banner', { tag: ['@ClientFeedback', '@WEBPET-3929'] }, () => {
    test('After saving a Quick Add employee, the banner has a Print badge link', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3929' }],
    }, async ({ pages, sessionApi }, testInfo) => {
        const s = await loadScenario(QuickAddPrintBadgeCaseSchema, testInfo);
        for (const a of s.annotations) testInfo.annotations.push(a);
        const quick = pages.employeeQuickAdd;
        const employees = pages.employee;

        // 0. Mint the employee's names; teardown is registered before the save.
        const who = mintQuickAddEmployee({ sessionApi, testInfo, pages }, s.ticket);

        // 1-2. Employee Add > Quick from the menu; First and Last Name (Name too, so the row carries the run tag).
        await quick.open();
        await quick.clearCrew();
        await quick.fill({ name: who.name, firstName: s.employee.firstName, lastName: who.lastName });

        // 3-4. Save employee: the banner names the employee and offers Print badge and Open record.
        await quick.save(who.name);
        await expect(quick.banner).toContainText(`${who.name} ${s.expected.bannerSuffix}`);
        await expect(quick.printBadgeButton, 'the banner offers Print badge').toBeVisible();
        await expect(quick.openRecordLink, 'the banner offers Open record').toBeVisible();

        // 5. Print badge: the badge PDF goes to the hidden print frame and the record is not opened.
        const badge = await quick.printBadge();
        expect(badge.status, 'POST employees/<id>/badge').toBe(200);
        expect(badge.pdf.subarray(0, s.expected.pdfMagic.length).toString('latin1'), 'the badge is a PDF').toBe(s.expected.pdfMagic);
        await expect(quick.badgeFrame, 'the badge is loaded into the print frame').toBeAttached();
        expect(quick.currentPath(), 'Print badge does not open the record').toBe(s.screen.url);
        await expect(quick.banner, 'the banner is still showing').toBeVisible();
        // With Name filled the badge prints the Name (the walk left it blank and saw Last / First); it wraps across lines.
        const text = (await readPdfText(new Uint8Array(badge.pdf))).replace(/\s+/g, ' ');
        expect(text, "the badge carries the new employee's name").toContain(who.name);

        // 6. Delete the employee on screen (soft delete; the name stays reserved, WEBPET-1798).
        await quick.openRecord();
        await expect(employees.nameInput).toHaveValue(who.name, { timeout: 30_000 });
        await employees.deleteOpenRecord(who.name);
    });
});
