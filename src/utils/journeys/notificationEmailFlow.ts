import type { APIRequestContext, TestInfo } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import { makeUser, plusAddressed, shortClockStamp, uid } from '@data/generated';
import type { NotificationEmailScenario } from '@data/schemas/systemScenario';
import { cleanupTarget } from '@data/static/shared/cleanupTargets';
import type { PageObjects } from '@fixtures/pages.fixture';
import type { NewUserData } from '@pages/admin/UsersPage';
import {
    findNotificationIdByName,
    getSmtpPreferences,
    isSmtpConfigured,
    listFilterScripts,
    pollNotifyNowJob,
    readSmtpState,
    SMTP_IMPLICIT_TLS_PORT,
    type FilterScript,
    type NotifyJob,
    type SmtpConfigureResult,
} from '@utils/api/notificationsApi';
import { findUserIdByName } from '@utils/api/usersApi';
import { runCleanup } from '@utils/cleanup/runCleanup';
import { register } from '@utils/cleanup/cleanupScope';
import { substituteTokens } from '@utils/data/scenarioLoader';
import { withPreferencesLock } from '@utils/sync/preferencesLock';

// UI-005: the one email path PET Tiger reports on. Two stages so the spec asserts the deployment's
// mail settings and the environment's nominee BEFORE anything is created. NOTIFY_SMTP_WRITE=0 makes
// the settings read-only (environment, not data). Names come from src/data/generated; the scenario's
// cleanup steps name them through {notificationName} / {userName}. The mail settings, the user and
// the notification are all made on screen; the API only reads and tears down.

export interface NotificationEmailDeps {
    sessionApi: APIRequestContext;
    pages: PageObjects;
    testInfo: TestInfo;
}

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

/** Types the mail settings into Preferences ▸ Connectivity ▸ Notification; reads them back over GET. */
async function configureSmtpOnScreen(deps: NotificationEmailDeps): Promise<SmtpConfigureResult> {
    const { sessionApi, pages } = deps;
    const host = getConfigValue(ConfigProperties.SMTP_HOST);
    const user = getConfigValue(ConfigProperties.SMTP_USER);
    const password = getConfigValue(ConfigProperties.SMTP_PASSWORD);
    const from = getConfigValue(ConfigProperties.EMAIL_FROM) || user;
    if (!host || !user || !password) {
        throw new Error(
            'SMTP_HOST / SMTP_USER / SMTP_PASSWORD are not all set — cannot configure notification SMTP. ' +
                'These come from the environment (CI passes them from repository secrets), never from the repo.',
        );
    }
    const preferences = await withPreferencesLock(async () => {
        const prefs = pages.preferences;
        await prefs.gotoPreferences();
        await prefs.gotoSection('Connectivity');
        await prefs.setValue('smtpServer', host);
        await prefs.setValue('smtpUser', user);
        await prefs.setValue('smtpFromAddress', from);
        await prefs.setValue('smtpPort', SMTP_IMPLICIT_TLS_PORT);
        await prefs.setValue('smtpPassword', password);
        await prefs.setChecked('Authenticate', true);
        await prefs.setChecked('Use SSL', true);
        await prefs.saveIfDirty();
        return getSmtpPreferences(sessionApi);
    });
    return { configured: isSmtpConfigured(preferences), wrote: true, preferences };
}

export async function prepareNotificationEmail(scenario: NotificationEmailScenario, deps: NotificationEmailDeps): Promise<NotificationEmailSetup> {
    const { sessionApi, testInfo } = deps;
    testInfo.slow();
    let smtp = await readSmtpState(sessionApi);
    if (!smtp.configured) {
        if (process.env.NOTIFY_SMTP_WRITE === '0') {
            const missing = [
                (smtp.preferences.smtpServer ?? '') === '' ? 'smtpServer' : null,
                smtp.preferences.smtpPasswordSet === true ? null : 'smtpPassword',
            ].filter(Boolean);
            testInfo.annotations.push({
                type: 'environment-gate',
                description: `smtp: notification mail settings missing (${missing.join(', ')}) and NOTIFY_SMTP_WRITE=0 forbids setting them.`,
            });
        } else {
            smtp = await configureSmtpOnScreen(deps);
        }
    }
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

/** Creates the recipient user and, when a reporting script exists, the notification on screen; fires Notify Now and attaches the job. Cleanup is registered with the scope up front. */
export async function dispatchNotification(setup: NotificationEmailSetup, deps: NotificationEmailDeps): Promise<NotificationEmailRun> {
    const { sessionApi, pages, testInfo } = deps;
    const { recipient, notificationName, subject } = setup;
    const cleanup = register(testInfo, 'notification-email cleanup', (api) =>
        runCleanup(setup.scenario.cleanup, api, testInfo, { phase: 'after' }),
    );
    await pages.users.createUser(recipient);
    // Plumbing reads (ids, scripts): the Users screen proved the save; the id only feeds the recipient check.
    const userId = await findUserIdByName(sessionApi, recipient.name);
    if (userId === null) throw new Error(`User '${recipient.name}' was saved on screen but is not listed by GET users`);
    // Plumbing read: the script list is a gate (fails by name below), never proof of an outcome.
    const all = await listFilterScripts(sessionApi);
    const reporting = all.filter((s) => s.executeReport !== false);
    if (!reporting.length) return { ...setup, userId, scripts: { all, reporting }, notificationId: null, job: null, jobUnreachable: false, cleanup };
    // By name, not position: dev's script list is shared and a newly added row can sort first.
    const script = reporting.find((s) => s.name === setup.scenario.filterScriptName);
    if (!script) {
        throw new Error(
            `No reporting filter script named '${setup.scenario.filterScriptName}'. Reporting scripts: ` +
                JSON.stringify(reporting.map((s) => ({ id: s.filterScriptCounter, name: s.name }))),
        );
    }
    const created = await pages.notifications.create({
        name: notificationName,
        filterScript: script.name,
        emailSubject: subject,
        recipient: recipient.name,
    });
    // The save may return to the list rather than the Edit page; then the id is resolved by name (read).
    const notificationId = created ?? (await findNotificationIdByName(sessionApi, notificationName));
    if (notificationId === null) throw new Error(`Notification '${notificationName}' was saved on screen but is not listed by GET notifications`);
    // Notify Now is disabled on a dirty form, so fire it from a freshly loaded Edit page.
    await pages.notifications.gotoEditById(notificationId, notificationName);
    const { jobId } = await pages.notifications.notifyNow();
    // The screen first. WEBPET-1907 can keep the dialog from rendering, so a miss is annotated, not failed.
    const dialog = await pages.notifications.awaitResultsDialog(30_000);
    if (dialog.seen) {
        await testInfo.attach('notify-now-results-dialog.txt', { body: dialog.text, contentType: 'text/plain' });
    } else {
        testInfo.annotations.push({
            type: 'notify-now-results-dialog-missing',
            description: 'The "Notification Completed" dialog did not render within 30 s (WEBPET-1907); the job poll below is the only evidence.',
        });
    }
    // Per-recipient transport status (success / error text) has no screen: asserted from the API only.
    testInfo.annotations.push({
        type: 'api-only-evidence',
        description: `GET notifications/${String(notificationId)}/notify-now/${jobId}: per-recipient transport status and error have no screen.`,
    });
    const result = await pollNotifyNowJob(sessionApi, notificationId, jobId);
    await testInfo.attach('notify-now-job.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
    if (!result.ok) return { ...setup, userId, scripts: { all, reporting }, notificationId, job: null, jobUnreachable: true, cleanup };
    return { ...setup, userId, scripts: { all, reporting }, notificationId, job: result.job, jobUnreachable: false, cleanup };
}
