# Environments

Everything the env files used to explain in comments. The files themselves are now
just settings — this is where the reasoning lives.

## The files

| File | Tracked | Purpose |
|---|---|---|
| `.env` | **no** | Personal overrides + `SECRET_KEY`. Real secrets go here. |
| `.env.local` | yes | Full PET Tiger stack on this machine (`npm test`) |
| `.env.dev` | yes | Dev staging, app.ptdev.xyz (`npm run test:dev`) |
| `.env.qa` | yes | Placeholder — fill in when a QA deployment exists |
| `.env.example` | yes | Template listing every supported key |

`TEST_ENV` selects which one loads (default `local`). Precedence, highest first —
see [src/config/envLoader.ts](../src/config/envLoader.ts):

1. **OS / CI environment variables** — never overridden, so CI secrets always win
2. `.env.<name>`
3. `.env` (personal base)

Because of (1), CI can inject `BASE_URL` / `USER_NAME` / `PASSWORD` without
touching the committed files. Note the empty-string trap: envLoader only defers to
a file value when the OS variable is **undefined**, not when it is `''` — GitHub
Actions exports a job-level `env:` key even when its expression resolves empty,
which is why `e2e.yml` sets `USER_NAME: ${{ vars.DEV_USER_NAME || 'su' }}` with a
literal default rather than relying on `.env.dev`.

Sensitive values may be stored as `ENC(...)` ciphertext in any of these files; see
[STRUCTURE.md § Secrets](STRUCTURE.md#secrets) and
[ADR 0006](adr/0006-encrypted-env-values.md).

## BASE_URL and API_URL are not always the same host

On dev staging the SPA is served from `app.ptdev.xyz` and the API from
`api.ptdev.xyz/api`. This matters more than it looks: **every path on the SPA host
returns `index.html`**. So an `API_URL` of `app.ptdev.xyz/api` does not 404 — it
returns HTML with a 200, and the failure surfaces later as a JSON parse error or a
baffling assertion mismatch rather than as a configuration problem.

If API calls start returning HTML, check `API_URL` first.

Locally both live on one machine (`localhost:3000` + `localhost:8080/api`), so the
distinction is invisible until you point at dev.

## Test-user cleanup via SQL

PET Tiger **cannot delete a user**. There is no UI action, and no `DELETE` route on
the API either — it has one for nearly every other entity, but for users only
`/users/{id}/avatar`. SQL is therefore the only way to remove a test user and free
its Name / Initials / Email, and any test that creates users depends on it.

`DB_TRUSTED` picks both the auth mode and, as a consequence, the transport:

| | `DB_TRUSTED=yes` | `DB_TRUSTED=no` |
|---|---|---|
| Transport | `sqlcmd` CLI with `-E` | the `mssql` driver (pure JS, from `npm ci`) |
| Credentials | none — Windows integrated auth | `DB_USER` / `DB_PASSWORD` |
| Requires | sqlcmd installed; run host shares an identity with the SQL host | nothing extra |
| Used by | local runs, self-hosted `e2e-local.yml` | dev staging, GitHub-hosted runners |

The split exists because tedious (which `mssql` wraps) cannot do true Windows
integrated auth, and a Linux CI runner has no Windows identity to offer anyway.
`SQLCMD_PATH` only matters on the trusted path.

Either way the run host needs a network route to the database. Where there is
none, cleanup **skips with a warning and the run still passes** — but the users it
created are left behind, so on shared environments they accumulate.
`global-setup.ts` probes the connection once up front and reports failure loudly
(an `::error::` annotation in CI) rather than letting that go unnoticed.

With `DB_SERVER` or `DB_CLIENT` unset, `isDbCleanupEnabled()` returns false and
every cleanup call skips with a logged warning.

## The migrated web-pet suite

Only relevant to the opt-in `webpet` project (see
[ADR 0001](adr/0001-webpet-suite-runs-separately.md)).

- **`WEBPET_API_ORIGIN`** — base for direct API request contexts (admin login, the
  data factory). Set to `https://api.ptdev.xyz` on dev, because the SPA host serves
  `index.html` for every path including `/api/*`. **Leave it unset on local** so
  those calls go through the Vite proxy exactly as they do in the source repo —
  adding it to `.env.local` breaks parity with the frozen 362-pass baseline.
- **`E2E_ADMIN_USER` / `E2E_ADMIN_PASSWORD`** — the source repo's own variables,
  read by `tests/webpet/support/provision.ts` and `notifications.spec.ts`. They win
  over `USER_NAME`/`PASSWORD` when set; see
  [src/config/webpetEnv.ts](../src/config/webpetEnv.ts) for the fallback chain.
  Absent on dev by design, so a dev run reuses the framework credentials rather
  than duplicating the secret.
- **`S3_ENDPOINT`** — non-empty un-gates
  `tests/webpet/employee-documents.spec.ts` (the spec only checks the var is
  non-empty; the Go API reads the real MinIO endpoint from its own env). Set on
  local as part of the 362-pass baseline; deliberately absent on dev, where that
  spec skips and the baseline is report-only.

**WEBPET-1463 (2026-07-25)** retired the shared `PT_SU_PASSWORD` login secret —
`su` now authenticates against its own persisted `TigerMaster.dbo.Users` row like
every other user. The CI workflows (`e2e-local.yml`, `webpet-e2e-local.yml`) reset
that row directly to `LOCAL_PASSWORD` before tests run, so there is no API env var
to keep in sync any more. Do **not** reintroduce an env-secret login path.

## Optional keys worth knowing

Full list in [.env.example](../.env.example); these are the ones with non-obvious
behaviour.

| Key | Effect |
|---|---|
| `TEST_DATA_SOURCE` | `json` \| `csv`. Picks which format the runner rows are read from — both hold the same rows, CSV authored and JSON its generated mirror ([ADR 0003](adr/0003-csv-authored-json-mirrored.md)). No conversion at runtime ([ADR 0002](adr/0002-no-test-data-conversion-step.md)). |
| `TEST_SCOPE` | Restrict the run to one customer's scope (a file in `config/scopes/`). A workflow runs only if its segments include one of the customer's **and** all its licence modules are enabled. Unset = no filtering. |
| `RUNNER_DATA_DIR` | Override the runner-row directory (default `src/data/runner`). |
| `DATA_FILE_PATH_JSON` / `_CSV` | Read one hand-made file instead of the per-journey directory. Escape hatch; unset by default. |
| `WARMUP_TIMEOUT_MS` | Budget for the app readiness probe in global setup. `0` disables it — useful against an already-hot environment. |
| `RETRY` | Override retry count (defaults: CI 2, local 0). |
| `EMAIL_RECIPIENTS_FILE` | **Deprecated** (email only). The routing table. Recipients are resolved per branch+trigger from `config/notifications/recipients.csv`; `EMAIL_TO` is only the fallback when that file is missing or has no matching row. Edit the table, not the env file. |
| `EMAIL_MAX_ATTACHMENT_MB` | **Deprecated.** Cap per attached report (default 20 — safely under Gmail's ~25MB limit after base64 overhead). Oversized reports are dropped in favour of the run link. |
| `SEND_EMAIL` / `SEND_SLACK` / `SEND_S3` / `SEND_RESULT_ELK` | Opt-in reporting channels, all off by default. Each reporter logs one line and does nothing when its flag is unset. **Slack is the primary channel; `SEND_EMAIL` is pinned to `no` in every workflow.** |
| `SEND_SLACK` extras | `SLACK_WEBHOOK_URL` posts the summary only. `SLACK_BOT_TOKEN` (`xoxb-…`, scopes `chat:write` + `files:write`) with `SLACK_CHANNEL_ID` takes precedence and additionally uploads the lean Allure report into the message's thread — webhooks cannot carry files. `SLACK_MAX_UPLOAD_MB` (default 20) drops an oversized report. |
| `SLACK_NOTIFY_EVENTS` | CSV of GitHub event names allowed to post (default `schedule`). Slack carries CI results only: with `SEND_SLACK=yes` the reporter *still* posts nothing unless `GITHUB_ACTIONS=true` and the event is listed here, so local runs, `--debug`/`--ui`, `workflow_dispatch` and `repository_dispatch` are silent. Add the event you are testing with to force a one-off post. |
| `SLACK_SUITE_NAME` / `SLACK_EXECUTION_LABEL` | Report header text — e.g. `WebPet` / `Scheduled Dry Run`. The dry-run workflows set the suite name per job so the two reports are never confused; unset, it is derived from `WEBPET` and the trigger. |
| `SLACK_DRY_RUN` | `1` logs the Block Kit payload instead of posting it. Paste the output into Slack's Block Kit Builder to check layout without a token. |
| `SEND_S3` extras | `S3_REPORT_BUCKET` + `AWS_*`. Use a report bucket distinct from the app's MinIO bucket; it must allow public read on `automation-reports/*` via bucket policy. `REPORT_S3_URL` and `ALLURE_REPORT_URL` (the hosted Allure report the Slack/email summary links to) are injected by CI — do not set them by hand. |
| `ALLURE_OWNER` | "Owner" label on every test in the Allure report (default `QA`). |
| `AUTH_TYPE` | `oauth2` \| `basic` \| `apikey` \| `none` (default). API-request auth only — independent of the browser login. Companion keys: `ACCESS_TOKEN_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `AUTH_USERNAME`, `AUTH_PASSWORD`, `API_KEY`, `API_KEY_HEADER`. |
