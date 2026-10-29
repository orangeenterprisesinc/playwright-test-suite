/**
 * Catalog workflow B9 — Paid break (rest and recovery).
 * Data: src/data/journey-b/b09-paid-break-rest-and-recovery.json · Plan: test-plans/journey-b/b09-paid-break-rest-and-recovery.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { JourneyBScenarioSchema } from '@data/schemas/journeyBScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { assertImportedRows, cardOf, previewPaidBreakDay, runJourneyBScenario } from '@utils/journeys/journeyBFlow';
import { designatePaidBreakJob } from '@utils/journeys/paidBreakJob';

test.describe('B9 · Paid break (rest and recovery)', { tag: ['@JourneyB', '@B9'] }, () => {
    test('[Paid Break] Deliver a break start with no return punch and verify the transfer bounds it at the crew\'s break length and returns the worker to the prior job.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'B9' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => {
        // 1. Scenario, B9 rows and crew rule on screen, gates, envelope, relay, on-screen Internet import.
        const scenario = await loadScenario(JourneyBScenarioSchema, testInfo);
        const run = await runJourneyBScenario(scenario, { sessionApi, pages, testInfo });
        const want = scenario.expected.envelope!;
        const paidBreak = scenario.paidBreak!;
        const b9 = run.office.b9!;
        const transfer = pages.transferToJobCards;

        // 2. The device sends a work Time In, a Time In on the break job and the Time Out: no return punch, no break card.
        expect(run.envelope.sections).toEqual(want.sections);
        expect(run.envelope.referenceParts).toEqual(want.referenceParts);
        expect(run.envelope.employeeSources, 'three BarcodeBadge sources').toEqual(want.employeeSources);
        for (const [code, count] of Object.entries(want.jobOccurrences!)) {
            expect(run.envelope.jobOccurrences[code], `job ${code} appears ${count} time(s): the device sent no return punch`).toBe(count);
        }
        for (const tag of want.absentTags!) {
            expect(run.envelope.tagNames, 'nothing reaches a break-card table').not.toContain(tag);
        }
        expect(run.envelope.references).toHaveLength(scenario.records.length);
        expect(run.send.success, `relay rejected the export: ${run.send.body}`).toBe(true);

        // 3. The import on Transfer to Job Cards: exactly this run's three references, untouched.
        expect(run.cards).toHaveLength(scenario.expected.cards.length);
        await assertImportedRows(pages, run);
        const [, breakStart, timeOut] = scenario.expected.cards.map((c) => cardOf(run, c.record));
        expect(breakStart.row.type).toBe(breakStart.expected.typeText);
        expect(breakStart.row.job).toContain(breakStart.bound.jobName!);
        expect(timeOut.row.type).toBe(timeOut.expected.typeText);

        // 4-6. Designate the paid-break job as late as possible; the lock is freed right after the preview.
        const designation = await designatePaidBreakJob(b9.breakJob, { sessionApi, pages, testInfo, label: scenario.label });
        try {
            const preview = await previewPaidBreakDay(pages, run);
            expect([...preview.candidates].sort(), 'the crew-scoped grid offers exactly the run\'s own time cards').toEqual([...run.recordReferences].sort());

            const { segments } = preview;
            expect(segments.map((s) => s.job), 'the previewed jobs, in chronological order').toEqual(paidBreak.segments.map((s) => b9[s.job].name));
            expect(
                segments.map(({ start, end, grossMinutes, netMinutes }) => ({ start, end, grossMinutes, netMinutes })),
                'the segment boundaries, contiguous from the time-in to the time-out',
            ).toEqual(paidBreak.segments.map((s) => ({ start: s.start, end: s.end, grossMinutes: s.minutes, netMinutes: s.minutes })));

            const at = paidBreak.segments.findIndex((s) => s.kind === 'break');
            expect(segments[at].grossMinutes, 'the break is as long as the crew\'s Break Lengths').toBe(paidBreak.crewRule.breakLengthMinutes);
            expect(segments[at + 1].start, 'the worker is back at the break end, though no punch exists at that minute').toBe(segments[at].end);
            expect(segments[at + 1].job, 'the return is to the job worked before the break').toBe(segments[at - 1].job);
            segments.forEach((s, i) => {
                if (i > 0) expect(s.start, `segment ${i} starts where the previous one ends`).toBe(segments[i - 1].end);
            });
            expect(segments.reduce((sum, s) => sum + s.grossMinutes, 0), 'the split neither creates nor loses a minute').toBe(paidBreak.totalMinutes);
            await expect.poll(() => transfer.previewTotals(), { message: 'the preview totals bar' }).toEqual(paidBreak.totals);
            for (const group of preview.issueGroups) {
                expect(group).not.toMatch(new RegExp(paidBreak.absentIssuePattern, 'i'));
            }
        } finally {
            await designation.restore();
        }

        // 7. Nothing was committed: every own reference is still a candidate and reads untransferred.
        await transfer.openTimeCardsTab();
        await expect(transfer.selectAllRowsCheckbox, 'the header select-all must stay untouched').not.toBeChecked();
        await expect.poll(() => transfer.candidateReferences(), { message: 'own references are still candidates' }).toEqual(expect.arrayContaining(run.recordReferences));
        for (const reference of run.recordReferences) {
            expect(await transfer.rowTransferred(reference), `${reference} is untransferred`).toMatch(/^(No)?$/);
        }

        // 8. Teardown is the scope's runCleanup (time cards by id) plus the paid-break restore above.
    });
});
