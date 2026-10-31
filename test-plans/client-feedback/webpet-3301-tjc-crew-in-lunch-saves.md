# `WEBPET-3301` · Transfer to Job Cards – a Crew Time In for Phase 0 - Lunch saves without the "Something went wrong" error

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3301 (also WEBPET-3282) |
| Plan | test-plans/client-feedback/webpet-3301-tjc-crew-in-lunch-saves.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3301-tjc-crew-in-lunch-saves.spec.ts |
| Data | src/data/client-feedback/webpet-3301-tjc-crew-in-lunch-saves.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3301` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3301`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS (POST 201, "Created 2 Time-In records.") |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun` (fixtures, clean day). CF CREW B, day -11 | |
| 1 | Open Transfer from the menu, New record > Crew In (`openCrewIn`) | sheet "Crew In" |
| 2 | `fillCrewIn`: 12:00, Use Employee Crew ticked, CF CREW B, CF RANCH, CF FIELD, Phase "0 - Lunch"; roster "2 of 2 selected" | |
| 3 | Save (`saveCrewIn`): dialog "Crew-In status" reads "Created 2 Time-In records."; no "Something went wrong" text | |
| 4 | OK; scope the day and the crew, analyze (2); each new row reads 12:00:00 PM, Time In, 0 - Lunch, CF RANCH, CF FIELD | |

## Expected outcomes

- A Crew In for Phase 0 - Lunch saves both employees with no error.
- Not asserted: the production failure (8-digit TimeCard ids); dev proves only that a lunch Crew In saves.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `crewInSheet`, `crewInStatus`, `crewInRosterCount`, `openCrewIn`, `fillCrewIn`, `saveCrewIn`, `confirmCrewInStatus`, `pickCrewInLookup`, `setCrewInCheckbox`, `pageText` |

## Data

CF CREW B, CF RANCH / CF FIELD. The (crew, day) pair is B at -11.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 11 (dev: 21).
- [ ] The su tenant has the job "0 - Lunch" (jobCounter 1199, code 5204). It is not a CF fixture: the pick fails by name if it is removed.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture right after the status dialog, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3301`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3301` | A Crew Time In for Phase 0 - Lunch on Transfer to Job Cards saves without the Something went wrong error | `regression` | 1 after the first green run |

## Open questions for the tester

None.
