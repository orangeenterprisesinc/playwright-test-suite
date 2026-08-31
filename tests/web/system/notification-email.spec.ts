/**
 * System check — **the Notification module actually delivers email**.
 *
 * | | |
 * |---|---|
 * | Plan | `test-plans/system/notification-email.md` |
 * | Runner rows | `src/data/runner/system.csv` → `UI-005` |
 *
 * This is the only email path in PET Tiger a test can assert. `notify-now`
 * returns a per-recipient outcome (`success` / `failed` / `skipped`) carrying the
 * transport's own error, so a broken mail configuration fails the build instead
 * of dropping messages silently — there is no outbox table to inspect anywhere in
 * the product.
 *
 * It is deliberately NOT a check that a human received something. The job result
 * is the assertion; the message landing in a mailbox is a side effect, useful for
 * eyeballing but not what makes this test pass or fail.
 *
 * Not to be confused with the **clock-out** notification (B12-R10), which is a
 * different code path: that one takes the process-wide sender chosen from the
 * API's environment at startup, which no test can configure, and reports nothing.
 * This one resolves SMTP from database preferences, which is why it is reachable.
 */
import { expect, test } from '@fixtures/base.fixture';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import {
    ensureSmtpConfigured,
    createNotification,
    deleteNotification,
    listFilterScripts,
    notifyNow,
} from '@utils/api/notificationsApi';
import { createUser, deleteUserById } from '@utils/api/usersApi';
import { makeUser } from '@data/generated';

test.describe('Notification email', { tag: ['@System'] }, () => {
    test('[Notification] Send a notification and verify it is dispatched to its recipient.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-005' },
            { type: 'requirement', description: 'UI-R4' },
        ],
    }, async ({ sessionApi }, testInfo) => {
        test.slow();

        // ── Mail settings: READ-ONLY unless NOTIFY_SMTP_WRITE=1. The product
        // stores this password in clear text and cannot be given an encrypted
        // one, so a scheduled run must never push a credential into the database
        // — it only checks, and says what to do when the check fails. ──
        const allowWrite = process.env.NOTIFY_SMTP_WRITE === '1';
        const { configured, wrote, preferences: smtp } = await ensureSmtpConfigured(sessionApi, { allowWrite });
        testInfo.annotations.push({
            type: 'notification-smtp',
            description:
                `${wrote ? 'Wrote' : 'Read'} notification mail settings: host=${smtp.smtpServer || '(none)'} ` +
                `port=${smtp.smtpPort} useSsl=${String(smtp.smtpUseSsl)} ` +
                `passwordSet=${String(smtp.smtpPasswordSet)}. Port 465 with implicit TLS is mandatory — ` +
                '587 fails "smtp auth: unencrypted connection" because the client will not ' +
                'authenticate over a plaintext socket and does not negotiate STARTTLS.',
        });
        expect(
            configured,
            'This deployment has no notification mail settings, and this run is not allowed to write ' +
                'them: the product stores the password unencrypted, so a scheduled run never pushes one. ' +
                'Configure it once by hand with NOTIFY_SMTP_WRITE=1 (it reads SMTP_HOST / SMTP_USER / ' +
                'SMTP_PASSWORD / EMAIL_FROM from the environment), then leave this run read-only. ' +
                'Prefer a dedicated sending mailbox over a personal account.',
        ).toBe(true);

        // The address the environment nominates — the same one the framework's own
        // reporter would mail. Never a committed literal.
        const recipientEmail = (getConfigValue(ConfigProperties.EMAIL_TO) ?? '').split(',')[0].trim();
        expect(recipientEmail, 'EMAIL_TO is not set — nowhere to send the notification').toBeTruthy();

        const recipient = makeUser({ email: recipientEmail });
        const userId = await createUser(sessionApi, {
            name: recipient.name,
            password: recipient.password,
            userInitials: recipient.initials,
            emailAddress: recipient.email,
        });

        let notificationId = 0;
        try {
            // Any filter script proves the transport; this asserts dispatch, not
            // report content. Fail loudly rather than silently skipping.
            const scripts = await listFilterScripts(sessionApi);
            expect(scripts.length, 'no filter script exists to build a notification on').toBeGreaterThan(0);

            const subject = `PET Tiger notification check ${Date.now() % 1000000}`;
            notificationId = await createNotification(sessionApi, {
                name: `ZZ NOTIF CHECK ${Date.now() % 1000000}`,
                filterScriptCounter: scripts[0].filterScriptCounter,
                emailSubject: subject,
                usersCounter: userId,
            });

            const job = await notifyNow(sessionApi, notificationId);
            await testInfo.attach('notify-now-job.json', {
                body: JSON.stringify(job, null, 2),
                contentType: 'application/json',
            });

            // ── UI-R4 — dispatched, and reported per recipient ──
            expect(job.status, `notify-now did not settle: ${JSON.stringify(job)}`).toBe('complete');
            const results = job.results ?? [];
            expect(results, 'notify-now reported no recipient at all').toHaveLength(1);
            // Assert the status before the counts: it carries the transport's own
            // error message, which is the diagnostic worth reading on a failure.
            expect(
                results[0].status,
                `dispatch to ${recipientEmail} did not succeed: ${results[0].error ?? '(no error reported)'}`,
            ).toBe('success');
            expect(results[0].usersCounter).toBe(userId);
            expect(job.failed ?? 0).toBe(0);
            expect(job.successful ?? 0).toBeGreaterThanOrEqual(1);

            testInfo.annotations.push({
                type: 'notification-delivered',
                description: `Dispatched "${subject}" to ${recipientEmail} (from ${smtp.smtpFromAddress}).`,
            });
        } finally {
            if (notificationId && !(await deleteNotification(sessionApi, notificationId))) {
                await testInfo.attach(`cleanup-warning-notification-${notificationId}`, {
                    body: `Could not delete notification ${notificationId}`,
                    contentType: 'text/plain',
                });
            }
            await deleteUserById(sessionApi, userId).catch(async (error: unknown) => {
                await testInfo.attach(`cleanup-warning-user-${userId}`, {
                    body: String(error),
                    contentType: 'text/plain',
                });
            });
        }
    });
});
