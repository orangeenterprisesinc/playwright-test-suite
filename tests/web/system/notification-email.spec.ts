/**
 * System check — the Notification module actually delivers email (UI-005).
 * Data: src/data/system/notification-email.json · Plan: test-plans/system/notification-email.md
 */
import { expect, test } from '@fixtures/base.fixture';
import { NotificationEmailScenarioSchema } from '@data/schemas/systemScenario';
import { loadScenario } from '@utils/data/scenarioLoader';
import { dispatchNotification, prepareNotificationEmail } from '@utils/journeys/notificationEmailFlow';

test.describe('Notification email', { tag: ['@System'] }, () => {
    test('[Notification] Send a notification and verify it is dispatched to its recipient.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-005' },
        ],
    }, async ({ sessionApi }, testInfo) => {
        const scenario = await loadScenario(NotificationEmailScenarioSchema, testInfo);
        const setup = await prepareNotificationEmail(scenario, sessionApi, testInfo);
        expect(
            setup.smtp.configured,
            'This deployment has no notification mail settings and this run was told not to write them ' +
                '(NOTIFY_SMTP_WRITE=0). Drop that variable to let the run configure them from ' +
                'SMTP_HOST / SMTP_USER / SMTP_PASSWORD / EMAIL_FROM, or set them by hand. Prefer a ' +
                'dedicated sending mailbox over a personal account.',
        ).toBe(true);
        expect(setup.nominated, 'EMAIL_TO is not set — nowhere to send the notification').toBeTruthy();

        const run = await dispatchNotification(setup, sessionApi, testInfo);
        try {
            if (run.jobUnreachable) {
                testInfo.annotations.push({
                    type: 'notify-now-job-store-unreachable',
                    description:
                        'notify-now answered 404 not_found for the whole deadline (WEBPET-1907, per-process ' +
                        'job store) — this run asserted NOTHING about delivery.',
                });
                test.skip(true, 'WEBPET-1907: notify-now job store unreachable for the full deadline');
            }
            const want = scenario.expected;
            expect(run.scripts.all.length, 'no filter script exists to build a notification on').toBeGreaterThan(0);
            expect(
                run.scripts.reporting.length,
                `no filter script executes a report, so dispatch has nothing to render: ` +
                    JSON.stringify(run.scripts.all.map((s) => ({ id: s.filterScriptCounter, name: s.name }))),
            ).toBeGreaterThan(0);

            // UI-R4 — dispatched, and reported per recipient
            const job = run.job!;
            expect(job.status, `notify-now did not settle: ${JSON.stringify(job)}`).toBe(want.jobStatus);
            const results = job.results ?? [];
            expect(results, 'notify-now reported no recipient at all').toHaveLength(want.recipients);
            // The status before the counts: it carries the transport's own error, the diagnostic worth reading on a failure.
            expect(
                results[0].status,
                `dispatch to ${run.recipient.email} did not succeed: ${results[0].error ?? '(no error reported)'}`,
            ).toBe(want.recipientStatus);
            expect(results[0].usersCounter).toBe(run.userId);
            expect(job.failed ?? 0).toBe(want.failed);
            expect(job.successful ?? 0).toBeGreaterThanOrEqual(want.minSuccessful);

            testInfo.annotations.push({
                type: 'notification-delivered',
                description: `Dispatched "${run.subject}" to ${run.recipient.email} (from ${run.smtp.preferences.smtpFromAddress}).`,
            });
        } finally {
            await run.cleanup();
        }
    });
});
