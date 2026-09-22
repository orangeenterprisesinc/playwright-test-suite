import type { APIRequestContext, TestInfo } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import { makeUser, plusAddressed, shortClockStamp, uid } from '@data/generated';
import type { NotificationEmailScenario } from '@data/schemas/systemScenario';
import { cleanupTarget } from '@data/static/shared/cleanupTargets';
import type { NewUserData } from '@pages/admin/UsersPage';
import {
    createNotification,
    ensureSmtpConfigured,
    listFilterScripts,
    notifyNow,
    type FilterScript,
    type NotifyJob,
    type SmtpConfigureResult,
} from '@utils/api/notificationsApi';
import { createUser } from '@utils/api/usersApi';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { register } from '@utils/cleanup/cleanupScope';
import { substituteTokens } from '@utils/data/scenarioLoader';

// UI-005: the one email path PET Tiger reports on. Two stages so the spec asserts the deployment's
// mail settings and the environment's nominee BEFORE anything is created. NOTIFY_SMTP_WRITE=0 makes
// the settings read-only (environment, not data). Names come from src/data/generated; the scenario's
// cleanup steps name them through {notificationName} / {userName}.

export interface NotificationEmailSetup {
    /** The scenario with `{userName}`, `{notificationName}`, `{subject}`, `{recipientEmail}` substituted. */
    scenario: NotificationEmailScenario;
    smtp: SmtpConfigureResult;
    /** EMAIL_TO's first address — '' when the environment nominates nobody. */
    nominated: string;
    recipient: NewUserData;
    notificationName: string;
    subject: string;
}

export async function prepareNotificationEmail(scenario: NotificationEmailScenario, sessionApi: APIRequestContext, testInfo: TestInfo): Promise<NotificationEmailSetup> {
    testInfo.slow();
    const smtp = await ensureSmtpConfigured(sessionApi, { allowWrite: process.env.NOTIFY_SMTP_WRITE !== '0' });
    const prefs = smtp.preferences;
    testInfo.annotations.push({
        type: 'notification-smtp',
        description:
            `${smtp.wrote ? 'Wrote' : 'Read'} notification mail settings: host=${prefs.smtpServer || '(none)'} ` +
            `port=${prefs.smtpPort} useSsl=${String(prefs.smtpUseSsl)} ` +
            `passwordSet=${String(prefs.smtpPasswordSet)}. Port 465 with implicit TLS is mandatory — ` +
            '587 fails "smtp auth: unencrypted connection" because the client will not ' +
            'authenticate over a plaintext socket and does not negotiate STARTTLS.',
    });
    const nominated = getConfigValue(ConfigProperties.EMAIL_TO).split(',')[0].trim();
    const recipient = makeUser({ email: plusAddressed(nominated, scenario.recipientTag) });
    const notificationName = `${scenario.notificationNamePrefix}${uid()}`;
    if (!cleanupTarget('notification').prefixes.some((p) => notificationName.startsWith(p.prefix))) {
        throw new Error(`notificationNamePrefix '${scenario.notificationNamePrefix}' is not one the residue sweep reclaims (cleanupTargets.ts)`);
    }
    const subject = substituteTokens(scenario.subjectTemplate, { stamp: shortClockStamp() });
    return {
        scenario: substituteTokens(scenario, { userName: recipient.name, notificationName, subject, recipientEmail: recipient.email }),
        smtp,
        nominated,
        recipient,
        notificationName,
        subject,
    };
}

export interface NotificationEmailRun extends NotificationEmailSetup {
    userId: number;
    /** Every filter script, and the ones that execute a report — only those can be dispatched. */
    scripts: { all: FilterScript[]; reporting: FilterScript[] };
    /** null when no filter script executes a report — nothing was created or sent; the spec's script assertions name it. */
    notificationId: number | null;
    job: NotifyJob | null;
    /** true when notify-now stayed 404 not_found (WEBPET-1907) for the whole deadline — the spec skips rather than asserts. */
    jobUnreachable: boolean;
    cleanup(): Promise<void>;
}

/** Creates the recipient user and, when a reporting script exists, the notification; fires Notify Now and attaches the job. Cleanup is registered with the scope up front. */
export async function dispatchNotification(setup: NotificationEmailSetup, sessionApi: APIRequestContext, testInfo: TestInfo): Promise<NotificationEmailRun> {
    const { recipient, notificationName, subject } = setup;
    const cleanup = register(testInfo, 'notification-email cleanup', () =>
        runCleanup(setup.scenario.cleanup, sessionApi, testInfo, { phase: 'after' }),
    );
    const userId = await createUser(sessionApi, {
        name: recipient.name,
        password: recipient.password,
        userInitials: recipient.initials,
        emailAddress: recipient.email,
    });
    const all = await listFilterScripts(sessionApi);
    const reporting = all.filter((s) => s.executeReport !== false);
    if (!reporting.length) return { ...setup, userId, scripts: { all, reporting }, notificationId: null, job: null, jobUnreachable: false, cleanup };
    const notificationId = await createNotification(sessionApi, {
        name: notificationName,
        filterScriptCounter: reporting[0].filterScriptCounter,
        emailSubject: subject,
        usersCounter: userId,
    });
    const result = await notifyNow(sessionApi, notificationId);
    await testInfo.attach('notify-now-job.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (!result.ok) return { ...setup, userId, scripts: { all, reporting }, notificationId, job: null, jobUnreachable: true, cleanup };
    return { ...setup, userId, scripts: { all, reporting }, notificationId, job: result.job, jobUnreachable: false, cleanup };
}
