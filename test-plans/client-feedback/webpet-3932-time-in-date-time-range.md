# `WEBPET-3932` · The Time In date filter takes a start date+time and end date+time and lists only Time Ins inside it

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3932 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3932-time-in-date-time-range.md |
| Spec | tests/web/client-feedback/time-in/webpet-3932-time-in-date-time-range.spec.ts |
| Data | src/data/client-feedback/webpet-3932-time-in-date-time-range.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3932` |

## Catalog entry
| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3932`) |
| Journey | none |
| Surface | ui |
| Bucket | C: seeded crew-day (CF CREW D @ -12) |

## Steps
| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Seed CF D ONE 07:00 and CF D TWO 11:00 on day -12 via Crew Time In | (not walked; seedCrewDay is shared) |
| 1 | Input ▸ Time In | PASS |
| 2 | From–To = day -13 – day -12, Start 8:00 AM, End 10:00 AM, Apply; URL ?from=…T08:00&to=…T10:00 | PASS (existing rows) |
| 3 | Own ONE row listed, own TWO row not | (spec) |
| 4 | Every listed row's Date / Time is inside the range | PASS (existing rows) |

## Expected outcomes
- The filter takes a start date and time and an end date and time.
- Only Time In rows inside the range are listed. The range is continuous: a 07:00 row on the end day is inside even though 07:00 is before the start time.

## Screens and page objects
| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Time In list | Input ▸ Time In | `src/pages/input/TimeInListPage.ts` | new (journey copy of the webpet page's locators) |
| Crew Time In | Input ▸ Crew Time In | `src/pages/input/CrewTimeInPage.ts` | existing (seed) |

## Data
(CF CREW D, day -12). Day -13 is the range's start day only.

## API allowances
| Allowance | Use |
|---|---|
| arrange | CF fixture rows via ensure*OnScreen (prepareCfRun) |
| plumbing read | own card ids after seeding (seedCrewDay), for cleanup and the Reference lookups |
| cleanup | own time cards by id + crew-day sweep (prepareCfRun) |

## Cleanup
Teardown deletes the own time cards by id.

## Test case
| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3932` | The Time In filter takes a start date+time and end date+time | `regression` | 1 after the first green run |

## Open questions for the tester
None. If the client meant a daily time window (the same hours on every day), the 07:00 own-row check would fail by design.
