# Developer E2E Contribution Guide

- **Status:** proposal, pending team adoption (Option A per `E2E-OWNERSHIP-OPTIONS.md`)
- **Date:** 2026-08-24
- **Audience:** web-pet developers contributing Playwright specs for new features

## 1. The model

Application code lives in `orangeenterprisesinc/web-pet`. All Playwright
automation lives in this repository. Ownership is split:

| Who | Owns |
|---|---|
| QA (Gukan) | The framework: fixtures, page-object registries, runner data sync, encrypted env, CI, reporting. Also the PET-Tiger workflow-catalog (journey) automation. |
| Developers | The spec for each new web-pet feature, contributed by PR to this repo. |

Every new-feature ticket gets two PRs: the app PR in web-pet and a companion
spec PR here. The feature is done when both are merged.

Tests run against the **deployed dev-staging environment** (app.ptdev.xyz),
never localhost and never the PR's local build. `npm run test:dev` is the only
correct way to run them — a bare `npx playwright test` targets localhost and
reports every test as "did not run".

A merged spec **automatically joins the daily scheduled regression run** on
`main` — there is no extra registration step beyond the runner row the spec
already carries.

### Per-feature coverage decisions

Three questions are answered for every feature ticket:

| Question | Answered by |
|---|---|
| Does it need e2e coverage? | Decided at ticket triage; default **yes** for any user-facing feature, recorded on the ticket. Internal-only or non-UI changes may opt out with a reason. |
| Does it have coverage? | The companion spec PR plus the `testCaseId` annotation joining the spec back to the ticket — a feature without a merged spec is visibly uncovered. |
| Is it good enough? | The QA review gate (§5): faithful assertions, conventions, green re-run on dev staging. |

## 2. One-time setup (per developer, ~30 minutes)

1. Get access to this repository from the org admin. `main` is protected —
   you contribute via branches and PRs only.
2. Clone and install (Node ≥ 20):

   ```powershell
   git clone https://github.com/orangeenterprisesinc/playwright-test-suite
   cd playwright-test-suite
   npm ci
   npx playwright install
   ```

3. Ask QA for your `.env` file and place it in the repo root. That one file
   is the whole credential setup:

   - Sensitive values inside it (dev-staging password, webhooks) are stored
     as `ENC(v1:...)` tokens — AES-256-GCM ciphertext, per
     `docs/adr/0006-encrypted-env-values.md`. The framework's config reader
     decrypts them transparently at runtime; test code never sees the
     crypto.
   - The decryption key is the `SECRET_KEY=` line **inside the same `.env`**
     — the tooling loads it from there, so you do not set any Windows
     environment variable and there is nothing separate to remember.
   - Because the file carries both the tokens and the key, treat the `.env`
     itself as the credential: receive it over a private channel, never
     commit it (it is gitignored), never paste it into a ticket or log.
   - A missing or corrupted key fails loudly at config-read time with a
     decryption error — it never silently types ciphertext into the login
     form. If you see that error, re-request the `.env` from QA.
   - Reference CLI (rarely needed by contributors):
     `npm run secret:encrypt -- "<value>"` to produce a token,
     `npm run secret:decrypt -- "ENC(v1:...)"` to verify one.
4. Open the repo in Claude Code and authenticate the Jira MCP when prompted
   (the server entry ships in the repo config).
5. Smoke-check the setup:

   ```powershell
   npm run test:dev -- --grep "@Smoke" --project=chromium
   ```

   Green means you are ready. Any failure at this step is a setup problem —
   ask QA, do not debug the tests.

## 3. Per-feature workflow

1. Finish the feature in web-pet as usual (ticket `WEBPET-123`).
2. Open this repository in Claude Code and run:

   ```text
   /dev-feature-test WEBPET-123
   ```

   The skill reads the Jira ticket, derives the expected behavior, creates a
   branch `test/WEBPET-123-<slug>` off `origin/main`, generates the spec using
   the existing page objects and conventions, runs it against dev staging, and
   runs the validation gates (`typecheck`, `lint`, runner check).
3. **Review the generated spec yourself.** You are the one who knows the
   feature: check that the assertions test the real expected behavior, not
   just that something rendered. This review is your actual contribution.
4. Confirm the local run is green, then let the skill open the PR to `main`
   with the template checklist filled. QA (Gukan) is the reviewer.
5. QA reviews, re-runs against dev staging, and merges. The feature ticket
   can then close.

If the skill is unavailable, the manual path is the same shape: branch off
`main`, write the spec following `.claude/skills/pw-spec-author` conventions,
run the same gates, open the PR.

## 4. Rules

- **Never push to `main`.** Branch + PR, always.
- **Spec PRs carry specs only**: spec files, new page objects (registered per
  `pw-page-object`), and runner data rows. No changes to fixtures, config,
  utils, scripts, CI workflows, or anything under `.claude/` — if the
  framework needs a change, raise it with QA instead.
- **Runner data is CSV-authored.** Edit the `.csv`; the `.json` is a mirror
  that `runner:sync` regenerates. Hand-edits to the `.json` are silently
  reverted.
- **Never weaken an assertion to make a test pass.** A red that looks like an
  app bug is reported, not painted green.
- **Parallel-safety:** the suite runs at 2 workers. Use run-unique entity
  names, no ordering assumptions between spec files. Workflows that hold a
  single session (e.g. the Internet import journeys) are serial-only — flag
  them; QA will place them in the right project.

## 5. What QA checks in review

Fixture module matches the folder; tags and `testCaseId`/requirement
annotations present; locators follow the repo standard; runner row synced;
assertions faithful to the ticket's expected behavior; green re-run against
dev staging; parallel-safe at 2 workers; no framework files touched.

## 6. Definition of done

The feature ticket closes only when: the spec PR is merged, the spec is green
on dev staging, its runner row exists, and the `testCaseId` traces back to the
ticket.
