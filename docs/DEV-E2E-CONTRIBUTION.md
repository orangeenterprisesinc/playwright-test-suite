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

3. Ask QA for the `.env` file and `SECRET_KEY` (dev-staging credentials are
   stored encrypted — see `docs/adr/0006-encrypted-env-values.md`). Place
   `.env` in the repo root; set `SECRET_KEY` in your environment.
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
