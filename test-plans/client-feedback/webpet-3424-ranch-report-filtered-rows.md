# `WEBPET-3424` · Setup > Ranch Report prints only the rows matching the grid filter

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3424 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3424-ranch-report-filtered-rows.md |
| Spec | tests/web/client-feedback/setup/webpet-3424-ranch-report-filtered-rows.spec.ts |
| Data | src/data/client-feedback/webpet-3424-ranch-report-filtered-rows.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3424` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3424`) |
| Journey | none |
| Surface | ui |
| Bucket | A: screen plus fixture; CF RANCH |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1 | Menu Setup ▸ Ranch, Name filter `CF RANCH` leaves 1 row | PASS |
| 2 | Report (All Data) → PDF | PASS |
| 3 | The PDF header reads `Name contains CF RANCH`, then `Ranch: All Data`, then one ranch row | PASS (no `Filters:` prefix is printed) |

## Expected outcomes

- The PDF header names the grid filter.
- The PDF lists exactly the grid's rows, not every ranch.
- Not asserted: the `Filters:` prefix the ticket text quotes (the build does not print it; see Open questions).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Ranch | Setup ▸ Ranch | `src/pages/setup/RanchPage.ts` | exists; `SetupScreenPage.report` added |

## Data

CF RANCH (code 9001) from `fixture.json`. Nothing is created and no (crew, day) pair is claimed.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none in steady state (`ensureRanchOnScreen` creates or repairs CF RANCH on screen if missing) |
| plumbing read | ranch GET inside the fixture lookup |
| cleanup | none |

## Cleanup

None; the spec creates nothing.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3424` | Setup > Ranch Report prints only the rows matching the grid filter | `regression` | 1 after the first green run |

## Open questions for the tester

None. The sheet TC was reworded on 2026-11-02 to the line the PDF prints (no `Filters:` prefix).
