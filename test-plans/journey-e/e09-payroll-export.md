# E9 · Payroll export file

Selecting job cards for export, preparing a dispatch run, and sending it to the
accounting system — the v1 filter surface and the v2 dispatch workspace.

| | |
|---|---|
| Workflow | `E9` — Payroll export file |
| Journey | E — Payroll |
| Module | Windows |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-e.csv`, `E9-001`…`E9-018` |

`E9-001` remains a `draft`, `enabled=0` row describing the end-to-end export. It
keeps `demo=1`: generating a real payroll file is the demo-worthy act, and it is
exactly what stays unautomated.

`E9-002`…`E9-018` were relocated from seven web-pet specs (`export-to-accounting`
WP-0188…WP-0196, and the six `export-to-accounting-v2*` files WP-0180…WP-0187).

## Why the coverage depth stays `partial`

**No payroll file is ever generated, and its format is never checked.** The tests
cover the filter UI, the dispatch workspace chrome, the draft lifecycle, row
selection, retry and recent exports — all of it against mocked candidate and run
endpoints. There are also no job cards on dev to export. The workflow's product —
a file an accounting system can consume — is untested.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/journey-e-payroll/e09-export-filter.spec.ts` | `E9-002`…`E9-010` | the v1 filter surface, licensing and permission paths |
| `tests/web/journey-e-payroll/e09-export-workspace.spec.ts` | `E9-011`…`E9-016` | v2 chrome, draft lifecycle, recent exports, retry, row selection |
| `tests/web/journey-e-payroll/e09-export-workspace-mobile.spec.ts` | `E9-017`, `E9-018` | the mobile layout |

`e09-export-workspace` consolidates **five** source files, each of which held one
describe on the same page object. Every describe moved intact under its original
title. The mobile file stayed separate because its `test.use({ viewport })` is a
describe-scoped context option, and because both its tests are quarantined — it is
a cohesive unit. The filter file stayed separate because it holds the entire
retired-v1 surface: when the `BUG-18` decision lands, realigning or retiring it is
one file rather than a scatter.

### The consolidated builders were suffixed, never unified

The five merged sources each declared module-level mock builders, several sharing
a name with a **different shape** — `includedRecordIds: []` in one and `null` in
another, which the source comments record as load-bearing for the PATCH
assertions. Merging them into one file would have collided those names.

Each was therefore renamed with a suffix naming its origin, bodies untouched.
Unifying two builders that differ would silently change what an assertion proves,
which is the failure this consolidation exists to prevent.

## Acceptance criteria (EARS)

| id | Requirement | Cases | |
|---|---|---|---|
| `E9-R1` | When the Export to Accounting filter page is opened, PET Tiger shall render the page header, description, both export-type tabs, and dates defaulted to a 7-day lookback. | `E9-002` | **unproven** |
| `E9-R2` | When Find Candidates is submitted, PET Tiger shall POST the filter to the candidates endpoint and render a numeric matched count with a capped preview. | `E9-003` | **unproven** |
| `E9-R3` | When candidate results contain rows, PET Tiger shall render the payment-type colour legend below the result table. | `E9-004` | **unproven** |
| `E9-R4` | If the entered date range is inverted, then PET Tiger shall show the order error and keep Find Candidates disabled so no request fires. | `E9-005` | **unproven** |
| `E9-R5` | When the page is opened with a `?type=` query parameter, PET Tiger shall preserve it on direct navigation and across a reload. | `E9-006` | |
| `E9-R6` | While the CostAccounting module is not licensed, PET Tiger shall render the Cost Accounting tab disabled with an explanatory tooltip. | `E9-007` | |
| `E9-R7` | If the candidates endpoint refuses with `module.not_licensed`, then PET Tiger shall render the inline banner and fire no global error toast. | `E9-008` | **unproven** |
| `E9-R8` | While the session lacks `accounting.export`, PET Tiger shall hide the Export to Accounting sidebar entry. | `E9-009` | |
| `E9-R9` | If a role check rejects the candidates request with 403, then PET Tiger shall surface that 403 on direct navigation. | `E9-010` | **unproven** |
| `E9-R10` | When the v2 dispatch workspace is opened, PET Tiger shall render the top strip, spine and grid, and populate all four readiness counters after a date preset is applied. | `E9-011` | |
| `E9-R11` | When `/export-to-accounting` is opened with the new-IA flag off, PET Tiger shall still serve the v2 dispatch workspace. | `E9-012` | |
| `E9-R12` | When Prepare, a batch-toggle flip and Clear filters are performed, PET Tiger shall fire POST, PATCH and DELETE against the runs endpoint in that order. | `E9-013` | **unproven** |
| `E9-R13` | When Recent Exports is opened, PET Tiger shall list runs in a sheet, drill into a run's outcomes with status filtering, and return to the list. | `E9-014` | |
| `E9-R14` | When Retry all failed is clicked, PET Tiger shall POST the run carrying the retry-eligible job-card ids and the parent run counter. | `E9-015` | |
| `E9-R15` | When a review-queue row is toggled or a bucket bulk-excluded, PET Tiger shall PATCH the draft with the corresponding excluded record ids. | `E9-016` | **unproven** |
| `E9-R16` | While the viewport is mobile-sized, PET Tiger shall replace the inline destination panel with a chip opening a bottom sheet, and keep the CTA region sticky. | `E9-017` | **unproven** |
| `E9-R17` | While the viewport is mobile-sized, PET Tiger shall render the four readiness cards in a two-column grid and populate the review-queue buckets after Prepare. | `E9-018` | **unproven** |

`E9-R18` onward is reserved for the unautomated `E9-001` journey.

## Ten of seventeen rows are quarantined under `BUG-18`

`E9-002`, `E9-003`, `E9-004`, `E9-005`, `E9-008`, `E9-010`, `E9-013`, `E9-016`,
`E9-017` and `E9-018` are all `enabled=0`.

**They are not broken tests.** Every one was reconfirmed failing in a CI dry run
on **2026-08-06** (run `31089496460`) against real product state, and each is a
tracked bug report rather than rot. That distinction matters: unlike a spec whose
page object quietly decayed behind a skip, these ran, failed, and were
investigated.

Three causes:

| Rows | Cause |
|---|---|
| `E9-002`, `E9-003`, `E9-004`, `E9-005`, `E9-008`, `E9-010` | They drive the **retired v1 export IA**. `E9-012` — which is enabled and passing — asserts the new-IA flag no longer falls back to the v1 page. So the surface these six exercise no longer exists at that route. |
| `E9-013`, `E9-016` | The draft-lifecycle testid is present in source but does not render under this flow. |
| `E9-017`, `E9-018` | The mobile destination-chip and readiness-strip testids are absent from the deployed source. |

**They were relocated as-is, not repaired and not deleted.** Repair is not
possible to validate: the v1 filter moved and repointing the page object would be
a guess nobody can check until the `BUG-18` product decision lands. Deletion would
erase the only executable record of the v1 filter contract, and the durable
pointer from suite to bug.

The quarantine is a plain `enabled=0` gate skip. No body `test.skip` is added —
§6 reserves the double guard for tests whose accidental run is *destructive*, and
these are all mock-driven or read-only.

**`E9-R1`–`R4`, `R7`, `R9`, `R12`, `R15`, `R16` and `R17` are therefore
unproven.** Seven of seventeen rows carry the live coverage.

## The smoke tag moved

The source's `@wp-smoke` in the filter file sat on `WP-0188`, which is now
quarantined. A disabled row must not hold a file's only `@Smoke` — the smoke lane
would be blind to the whole screen. It moved to `E9-006`, which is live and loads
the page. `E9-002` keeps `@HighLevel`.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Export filter (v1) | `/export-to-accounting` | `src/pages/accounting/ExportToAccountingPage.ts` |
| Dispatch workspace (v2) | `/export-to-accounting` | `src/pages/accounting/ExportDispatchWorkspacePage.ts` |

Both moved out of `src/pages/webpet/` in this batch, along with
`src/components/accounting/DateRangeFilterComponent.ts`, whose only two consumers
are these page objects and `ReconcileJobCardsPage`.

## Route mocking and the teardown race

Nearly every test here installs `page.route` handlers; the batch carries 17
`route.continue()`, 3 `route.fallback()` and 3 `route.fetch()` calls.

`webpet.fixture` silently swallowed the `…has been closed` error Playwright raises
when a context tears down mid-flight. `base.fixture` does not, and should not — a
global swallow hides real failures. Every handler registration is therefore
wrapped in `guardTeardownRace` from `src/utils/routeGuard.ts`, which swallows only
that error and rethrows everything else.

Wrapping at the **registration** boundary rather than around each `continue()` is
deliberate: it also covers the `route.fetch()` sites and the
`fulfill({ response })`-after-fetch shape, which a `continue()`-only wrapper would
miss.

## Parallelism

No `mode: 'serial'`, and none should be added. Every test installs its own routes
and drives its own page.

## Data

All mocked. No records are created and nothing is cleaned up: candidate lists,
draft runs and outcomes are all served by `page.route` handlers. That is also why
the suite proves nothing about a real export file.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [ ] `accounting.export` granted to the dev run user — several tests assert the
      permission-denied side and will not exercise the granted side without it.
- [ ] Job cards on dev to export. None exist, which is why `E9-001` is a draft.

## Open questions for the tester

- [ ] **`BUG-18` is the blocker for ten rows.** The product decision on the export
      UI determines whether the six v1 tests are realigned to the new route or
      retired outright. Until then E9's live coverage is seven tests.
- [ ] `E9-001` needs a generated file, checked against the customer's accounting
      format, to reach `journey` depth. It also needs D4 to produce job cards.
- [ ] The 13 inherited `networkidle` waits across this area are suppressed at file
      level with their reasoning, not rewritten — a relocation batch cannot
      validate a timing change. Worth revisiting with a live run.
