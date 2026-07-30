# 0001 — The migrated web-pet suite runs separately and is mirrored, not merged

- **Status:** accepted
- **Date:** 2026-07-31

## Context

`tests/webpet/` is the PET Tiger app repo's own Playwright suite (~406 tests in 57
files), lifted from `web-pet/apps/web/e2e` and converted onto this framework's
conventions. It coexists with the login + user-journey suites in `tests/web/` and
`tests/api/`.

The two suites are not variations of one thing. They differ in authentication (the
migrated suite logs in via the admin API and seeds its own contexts; the journey
suites share one `storageState`), in run settings, in row schema (`WP-0001` with a
`caseKey`/`file`/`titlePath` shape vs `A1-001` with a `journey`/`workflow`/
`segments` shape), and in acceptance criteria (the migrated suite is measured
against a frozen source-repo baseline of 362 passed / 18 skipped / 26 failed).

## Decision

The migrated suite runs separately and its projects are **opt-in**: they are only
materialized when `WEBPET=1` or `--project=webpet` is passed, so a bare
`npx playwright test` never collects its tests. `chromium` explicitly
`testIgnore`s `**/tests/webpet/**`.

Its framework code is **mirrored under each parent** — `src/pages/webpet/`,
`src/components/webpet/`, `src/data/webpet/`, `src/fixtures/webpet*.fixture.ts`,
`src/config/webpetEnv.ts` — rather than consolidated into one `src/webpet/`
vertical slice.

## Consequences

- A webpet page object lives where a journey page object lives, so the two suites
  stay structurally parallel and a reader learns one layout, not two.
- The cost is real: "everything webpet" is spread across six parent folders, and
  you cannot see the suite's full extent in one directory listing.
- The 2026-07-31 folder reorganization was shaped by this: `src/data/` was
  regrouped *internally* (adding `static/`, `generated/`, `readers/`) instead of
  being renamed, specifically so `src/data/webpet/` never had to move. Moving the
  migrated suite's row files or id maps before its parity run reproduces
  362/18/26 would make any delta unattributable — conversion bug, or the move?
- The shared middle is deliberate and must stay shared: both suites use
  `src/fixtures/gate/`, the Allure label helper, and the same reader stack. Only
  the row *directory* forks.

## Revisit when

The parity run reproduces 362/18/26 on the seeded stack and the per-test baseline
manifest is captured. At that point consolidating into `src/webpet/` becomes a
safe, mechanical move — and `WEBPET_PARITY` can be deleted (see the note at
`playwright.config.ts`).
