# `UI-005` · Notification email dispatch

A system check, not a catalog workflow: it proves the deployment can deliver a
Notification email, and fails the build with the transport's own error when it
cannot.

**Verified on dev 2026-08-31**, green in 17.6 s: the mail settings were written
from the environment (the deployment had none), the notification dispatched, and
`notify-now` reported `status: complete` with `results[0].status: "success"`,
`failed: 0`. A read-only pass (`NOTIFY_SMTP_WRITE=0`) was run first and failed
exactly as intended on the unconfigured-deployment assertion, which is what
confirms that guard works rather than silently passing.

| Artifact | Path |
|---|---|
| This plan | `test-plans/system/notification-email.md` |
| Spec | `tests/web/system/notification-email.spec.ts` |
| Runner rows | `src/data/runner/system.csv` → `UI-005` |

## Why this exists

Email delivery had never been verified anywhere in the suite, and the first
manual exercise of it found the deployment misconfigured in a way no test would
have caught — the send failed during the SMTP handshake, and the only place the
product reports that is a job endpoint nothing was polling.

It is also the **only** email path a test can assert. The two paths differ in
where they read their mail settings, and that difference decides testability:

| Path | Settings come from | Reports the outcome? |
|---|---|---|
| **Notification module** (Notify Now, scheduler) | **database preferences** — `GET`/`PUT /preferences` (`input/notification_smtp_prefs.go`) | **yes** — per recipient, with the transport's error |
| Clock-out flag notification (B12-R10) | the API task's own environment, resolved once at startup by `selectEmailSender` | no — no outbox, and `TimeCardQuestionFlag.NotifiedAtUtc` is on no response |

So this spec does not cover B12's notification and does not claim to. B12-R10
stays a named gate in its own plan.

## Acceptance criteria (EARS)

The `UI-` prefix is the suite's generic **system** prefix, not a claim that this
is a UI test — `scripts/runner/check.js` accepts only `[A-F]\d{1,2}` (a catalog
workflow) or `UI` for a requirement id, so a new `NOTIF`/`SYS` prefix would mean
editing that shared gate. Reusing `UI` keeps this change out of framework code.

| id | Requirement | Cases |
|---|---|---|
| `UI-R4` | Where notification mail settings are configured, when a notification is sent with Notify Now, PET Tiger shall dispatch it to each active recipient and report that recipient's outcome. | `UI-005` |

One requirement, one test. The assertion is the **job result**, not a mailbox:
`status: "complete"`, one result for the one recipient, `results[0].status:
"success"`, `failed: 0`, `successful >= 1`. A message arriving in an inbox is a
side effect — useful for a human eyeball, never what makes this pass.

## The port is the whole trick

Port `587` with `smtpUseSsl: false` fails:

```
dispatch failed: smtp auth: unencrypted connection
```

The Go client will not authenticate over a plaintext socket and does **not**
negotiate STARTTLS, so only **implicit TLS on 465** works.

This does **not** match the framework's own `emailReporter`, which succeeds on
587 because nodemailer upgrades the connection for it. A working 587 setup in
`.env` is therefore *not* transferable to the app — the mistake this plan exists
to stop someone repeating.

## Preconditions

- [x] `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `EMAIL_TO` present
      in the environment. CI supplies all five from repository secrets
      (`e2e.yml:289-294`); locally they come from `.env`. Never committed.
- [x] At least one filter script exists — a Notification is built on one. Any
      will do; this asserts dispatch, not report content.
- [x] The `Notification` module licensed for the client.

## Stored unencrypted — encryption is a later phase

The product keeps this value **unencrypted and cannot be given an encrypted
one**: `GetSmtpDetails` reads it plaintext, so a ciphertext would be handed to the
mail server *as the password* and authentication would fail. The storage format
belongs to the reader, not the writer.

Legacy's preference framework does have an `Encrypted=true` capability — this key
simply does not use it — so making it encrypted at rest is a **product change**,
and it is a **deferred phase** (team decision 2026-08-31). This spec therefore
uses the settings as they are.

**The run configures a deployment that has none**, rather than demanding it be
set up first. That is a deliberate trade: dev resets clear the preferences, and a
check-only run would leave CI red after every reset until a human re-ran a setup
step. `NOTIFY_SMTP_WRITE=0` makes any single run read-only.

Two things to keep in view until the encryption phase lands:

* Anyone with database or preference-write access on the deployment can read the
  value, and on dev the database can be snapshotted into the shared test image —
  so it can travel further than the deployment it was set on.
* Use a **dedicated sending mailbox**, not anyone's personal account — the
  recipient can still be a person. That bounds the exposure to a disposable
  account. The manual precedent in WEBPET-1531 used a purpose-made sender, which
  now reads as a deliberate choice rather than an arbitrary one.

## Cleanup

| What | How |
|---|---|
| The Notification | `deleteNotification` in a `finally`; a failure is attached as a warning, never raised |
| The recipient user | `deleteUserById` in the same `finally`; its name carries the prefix global teardown sweeps, so an early death still cleans up |
| Mail settings | **not touched at all** by a normal run — deployment configuration, not test data |

No SQL. Setup and teardown go through the app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `UI-005` | Notification email dispatch | `UI-R4` | `regression` | **1** |

```ts
test.describe('Notification email', { tag: ['@System'] }, () => {
    test('[Notification] Send a notification and verify it is dispatched to its recipient.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'UI-005' },
            { type: 'requirement', description: 'UI-R4' },
        ],
    }, async ({ sessionApi }, testInfo) => { /* … */ });
});
```

## Open questions for the tester

- [ ] Should the sending mailbox be a dedicated one rather than whatever
      `SMTP_USER` currently names? See the operational note — it is the one
      decision that matters before this runs on a schedule.
