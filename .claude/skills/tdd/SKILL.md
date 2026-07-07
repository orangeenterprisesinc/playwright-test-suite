---
name: tdd
description: Use when the user wants to build a new test module or feature coverage test-first (red/green) — write the failing Playwright spec from acceptance criteria before implementing page objects, then make it pass.
---

## Test-Driven Development for this Playwright suite

Work red → green, in small cycles. The spec is written first from the
acceptance criteria; page objects and fixtures are built to make it pass.

### Cycle

1. **Red — write the failing spec first**
   - Create `tests/<module>/<module>.spec.ts` following `/ui-script-generator`
     conventions (standard `test.describe`/`test`, tags, fixtures).
   - Reference page objects and locators as you WISH they existed — the
     ideal API for the scenario, not what currently exists.
   - Run it and confirm it fails for the RIGHT reason (missing page object /
     failing assertion), not for setup errors:
     `npx playwright test tests/<module> --project=chromium`
     (if the app is not running locally, `--list` + `npm run typecheck`
     is the minimum red gate: the spec must at least fail compilation
     because the page object doesn't exist yet).

2. **Green — implement the minimum**
   - Create the page object in `src/pages/`, extending `BasePage` with
     `pageUrl`, `pageTitle`, semantic locators, and the methods the spec
     needs — nothing more.
   - Register it as a fixture in `src/fixtures/base.fixture.ts` (follow the
     `loginPage` pattern).
   - Re-run the spec until green.

3. **Refactor**
   - Fold duplicated steps into page-object methods or fixtures.
   - Move reusable fragments into `src/components/` only when they are
     genuinely shared across pages.
   - Keep `npm run typecheck` clean — the tsconfig is strict (unused
     parameters fail the build; alias unused activation fixtures like
     `gotoUrl: _gotoUrl`).

### Rules

- One scenario per cycle; do not batch five specs before implementing.
- Never weaken an assertion to get to green — fix the code under test's
  page object or raise the discrepancy with the user.
- Authenticated flows start from storageState (`.auth/user.json`); only
  login-module tests reset storage state to logged-out.
- Data values come from `src/data/<module>-data.json` or runnerManager
  rows — never hardcoded into the spec (see /data-driven-testing).
- Verification gates before declaring done: `npm run typecheck`,
  `npx playwright test --list`, and a real run of the new spec against
  the local stack when it is available.
