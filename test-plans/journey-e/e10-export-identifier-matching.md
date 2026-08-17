# E10 · Export-identifier matching

Reconciling job cards before an export — checking that every job's export
identifier matches a phase or cost centre in the accounting system, and surfacing
the ones that do not.

| | |
|---|---|
| Workflow | `E10` — Export-identifier matching |
| Journey | E — Payroll |
| Module | Windows |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-e.csv`, `E10-001`…`E10-011` |

`E10-001` remains a `draft`, `enabled=0` row describing real identifier matching.
`E10-002`…`E10-011` were relocated from `tests/webpet/reconcile-job-cards.spec.ts`
(WP-0298…WP-0307).

## Why the coverage depth stays `partial`

A mismatched export identifier rejects that job's records, and it is the single
most common export failure — so the matching *logic* is the workflow's substance.
These tests cover the screen around it: the preference gate, the permission gate,
the empty state, inline failure rows, the CSV download and the 4xx/5xx paths.

The one test that exercises a real run (`E10-004`) goes against the live API, but
**on dev both `accounting.export` and the `IncludeReconcileJCs` preference are
off**, so several enabled tests take their skip branch there. The matching itself
is effectively unexercised.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/journey-e-payroll/e10-reconcile-job-cards.spec.ts` | `E10-002`…`E10-011` | the whole reconcile screen |

## Acceptance criteria (EARS)

| id | Requirement | Cases | |
|---|---|---|---|
| `E10-R1` | While the `IncludeReconcileJCs` preference is off, PET Tiger shall render no reconcile page chrome; while it is on, PET Tiger shall render the Reconcile action disabled until a date scope is picked. | `E10-002` | |
| `E10-R2` | While no date range is selected, PET Tiger shall render the grid's pick-a-range empty state. | `E10-003` | |
| `E10-R3` | When a date scope is applied and the run is confirmed, PET Tiger shall POST the reconcile request as a real run, return numeric matched and updated counts, and render the summary panel. | `E10-004` | |
| `E10-R4` | PET Tiger shall attach the Reconcile Job Cards sidebar entry exactly when the session grants `accounting.export`. | `E10-005` | **unproven** |
| `E10-R5` | If `accounting.export` is absent, then a direct reconcile URL shall redirect to the app root. | `E10-006` | |
| `E10-R6` | While the preference is off, PET Tiger shall keep the URL on the reconcile route and render the disabled banner. | `E10-007` | |
| `E10-R7` | When a reconcile run returns failures, PET Tiger shall render the summary panel with inline failure rows and the CSV download button. | `E10-008` | |
| `E10-R8` | When a reconcile run is all-clean, PET Tiger shall render the all-good state without a CSV download button. | `E10-009` | |
| `E10-R9` | If the reconcile request fails with a 4xx or a 5xx, then PET Tiger shall surface an error toast and render no summary panel. | `E10-010`, `E10-011` | |

`E10-R10` onward is reserved for the unautomated `E10-001` journey.

`E10-010` and `E10-011` share `E10-R9` deliberately: one rule — *any* error
response surfaces a toast and no panel — asserted identically on two status
classes. The two rows preserve per-status traceability.

## "Proven" here means enabled, not exercised

`E10-R1`, `R2`, `R3`, `R5`, `R6`, `R7`, `R8` and `R9` are cited by enabled rows,
so the traceability guard counts them. That is the guard's definition, and it is
weaker than it looks on this screen: several of these tests carry runtime skip
guards that fire on dev because the preference and the permission are off.

**A skip there means the gate was closed, not that the rule holds.** Granting
`accounting.export` to the dev run user and enabling the reconcile preference is
the single change that would turn this area's coverage real.

## `E10-005` is quarantined — the assertion may itself be wrong

`E10-005` is `enabled=0`. **`E10-R4` is unproven.**

The sidebar entry is absent while `accounting.export` *is* granted. That was
reconfirmed failing in the CI dry run of 2026-08-06 (run `31089496460`) and is
tracked as `BUG-14` — but it is an **open product question**, not a settled bug:
gating may be permission-only, or permission plus the `IncludeReconcileJCs`
preference.

That is why the row is disabled rather than the assertion adjusted. Enabling it
would go red on a known open question; rewriting it to expect the current
behaviour would encode a guess as a requirement. It waits for the product answer,
and the assertion it carries is the one to revisit when that lands.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Reconcile Job Cards | `/reconcile-job-cards` | `src/pages/accounting/ReconcileJobCardsPage.ts` |

Moved out of `src/pages/webpet/` in this batch, along with
`src/components/accounting/DateRangeFilterComponent.ts`.

The date-preset helpers stay **in the spec**, not on the page object — the page
object exposes a boolean (`applyLast30IfEnabled`) and the spec decides what to do
with it. That split is deliberate and was preserved.

## Route mocking and the teardown race

`mockReconcilePost` installs a handler that uses `route.fallback()` twice — once
for non-POST methods and once for the dry-run branch — so a real round trip
reaches the network whenever no other handler matches.

`base.fixture` does not swallow the `…has been closed` teardown error that
`webpet.fixture` did, so every route registration here is wrapped in
`guardTeardownRace` from `src/utils/routeGuard.ts`. The `return;` statements
inside those handlers are interceptor control flow and were preserved exactly —
they are not test guards.

## Parallelism

No `mode: 'serial'`, and none should be added.

## Data

Mostly mocked. `E10-004` is the exception: it runs a real reconcile against the
live API, which is why it is the only test whose outcome depends on dev's data
rather than a fixture.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [ ] `accounting.export` granted to the dev run user.
- [ ] The `IncludeReconcileJCs` preference enabled on dev.

Both are off today. Until they are on, most of this file skips at runtime with a
named reason.

## Open questions for the tester

- [ ] **`BUG-14` needs a product answer** before `E10-005` can be re-enabled:
      permission-only gating, or permission plus preference?
- [ ] Granting `accounting.export` and enabling the preference on dev is the
      cheapest way to make this area's coverage real.
- [ ] `E10-001` needs actual identifier matching — a job whose export identifier
      does not resolve, and the rejection that follows — to reach `journey` depth.
- [ ] The ten inherited `networkidle` waits here are suppressed at file level with
      their reasoning rather than rewritten. Revisit with a live run.
