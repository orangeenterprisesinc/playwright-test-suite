# Web-PET domain profile

Read this profile when the task touches `tests/webpet/`, `src/pages/webpet/`,
`src/components/webpet/`, or `src/data/webpet/`. Orchestration contract:
[../PLAYWRIGHT_AGENT_WORKFLOW.md](../PLAYWRIGHT_AGENT_WORKFLOW.md).

## Facts

* Suite: `tests/webpet/` — ~406 tests across ~49 spec files, run by the `webpet`
  Playwright project (enabled with `WEBPET=1`; `webpet-setup` handles auth).
* Fixtures: `src/fixtures/webpet.fixture.ts` (authenticated) or
  `src/fixtures/webpetAnonymous.fixture.ts` (logged-out). Page objects come from
  the `WebpetPages` lazy registry (`src/fixtures/webpetPages.fixture.ts`); classes
  live in `src/pages/webpet/`, shared grids/dialogs in `src/components/webpet/`.
  Never import `base.fixture` in a webpet spec — the gate reads the wrong row
  source and all 406 tests skip green.
* Tags: `@WebPet` + area + batch tags on describe; `@wp-ui`/`@wp-api` plus
  `@wp-smoke`/`@wp-regression`/`@wp-negative` on tests. `testCaseId` is `WP-nnnn`.
* `src/data/webpet/webpetRunnerManager.csv` is authoritative. The `.json` mirror
  and `src/data/webpet/ids/*.ts` are generated — never hand-edit them; edit the
  `.csv` and run `npm run webpet:runner:sync`.
* `workers: 2` is a hard requirement; never plan around lowering it. Fix
  contention with retries or data isolation, not width.
* Setup/cleanup goes through the app's API (`tests/webpet/support/`); there is no
  DB access from tests.
* Validation and Employee have no purge endpoint — a soft-deleted name is stuck
  forever, so use run-unique names for those two entities.

## Planner notes

* Reuse before inventing: page objects in `src/pages/webpet/`, provisioning in
  `tests/webpet/support/`, prior spec idioms in `tests/webpet/`.
* Before attributing a failure to the product, rule out the environment classes
  in the Healer triage order below.

## Generator notes

* Base UI widgets differ: Select portals use `select-content`/`select-item`,
  Combobox portals use `combobox-popup`/`combobox-item`; scope open portals with
  `[data-open]`.
* Bounded waits with explicit timeouts over bare `click()` auto-waits on portals
  that may never exist — a miss must fail in seconds naming the element, not burn
  the spec's full timeout.
* New tests get their `WP-nnnn` id via the two-pass allocation: write without the
  annotation → `npm run webpet:runner:sync` allocates → annotate → re-sync.

## Healer triage order (before declaring test or product defect)

1. **Environment first.** `401 session_expired` cascades, mass unauthenticated
   pages, or a mid-run cliff → dev's in-memory session store dropped the session
   (known incident class); not a test defect. The webpet fixture self-heals these
   since PR #24 — a `session-heal` annotation in the report confirms it fired.
2. **Build lag second.** app.ptdev.xyz can serve a bundle missing commits already
   in source — grep the deployed JS for the expected change before filing a
   product bug.
3. **Deliberate product change third.** A selector/contract that "broke
   overnight" may be an intentional UI change (check web-pet commits/tickets) —
   realign the test, do not report a regression.
4. **Product defect last.** If confirmed, the deliverable is an evidence file
   under `artifacts/bug-evidence/` (existing `bug-ticket-BUG-*.txt` style) —
   never silence the test to go green. `test.fixme()` with an explanatory comment
   is acceptable only when the test is correct and the product is confirmed
   broken.

Capture policy: webpet parity mode (the default) runs `trace: 'on-first-retry'`,
video/screenshot off, `retries: 0` — a first failure has **no trace**. Re-run the
test with `--retries=1`, or `WEBPET_PARITY=0`, to capture one.

## Validation

* `npm run webpet:runner:check` after any spec or CSV change
  (`npm run webpet:runner:sync` first when tests were added, renamed, or removed)
* `npm run typecheck` and `npm run lint`
* Run the affected spec files via the `webpet` project — never the full suite
  unless the change is suite-wide (fixture/gate/config).
