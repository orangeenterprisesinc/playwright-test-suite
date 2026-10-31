# `WEBPET-3575` · Transfer to Job Cards – Crew In saves with Ranch, Field and Phase empty and inherits each employee's last Job, Ranch and Field

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3575 |
| Plan | test-plans/client-feedback/webpet-3575-tjc-crew-in-inherits-job-ranch-field.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3575-tjc-crew-in-inherits-job-ranch-field.spec.ts |
| Data | src/data/client-feedback/webpet-3575-tjc-crew-in-inherits-job-ranch-field.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3575` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3575`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS on the legacy path; the sheet step differs (below) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `prepareCfRun`, then `seedCrewDay`. CF CREW B, day -12: 2 Time In 07:00 + 2 Time Out 11:00 on CF JOB = 4 cards | |
| 1 | Open Transfer from the menu, New record > Crew In | |
| 2 | `fillCrewIn`: 07:30, CF CREW B, both checkboxes unticked; Ranch, Field, Phase empty | roster "2 of 2 selected" |
| 3 | Open Phase: "Box - Field Packing" is listed, its alias "Cajas del Fil" is not; close it unchanged | |
| 4 | Save: "Created 2 Time-In records." | |
| 5 | OK; scope the day and the crew, analyze (6) | |
| 6 | Each new Time In reads 7:30:00 AM, Time In, CF JOB, CF RANCH, CF FIELD | |

## Expected outcomes

- A Crew In with Ranch, Field and Phase empty saves and each employee inherits their last Job, Ranch and Field.
- Not asserted: the "Based on Later Time-Cards" ticked path. On dev it arrives with "0 of 2 selected" and, after Select All, saves "Created 0 Time-In records." with "Field is Required" (the later card is a Time Out with no job). The sheet step is to be reworded; the Based-on-Later behaviour is a question for dev.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds the Crew In members (`openCrewIn`, `fillCrewIn`, `crewInPhaseListed`, `saveCrewIn`, `confirmCrewInStatus`) |

## Data

CF CREW B, CF JOB, CF RANCH / CF FIELD. The (crew, day) pair is B at -12.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).
- [ ] The su tenant has the job "Box - Field Packing" with alias "Cajas del Fil".

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences and GET time-cards (own-id capture after the seed and after the status dialog, recorded before asserting). The proof is on screen |
| cleanup | before-phase sweep and by-id teardown. Nothing is committed |

## Cleanup

Own time cards by id, then a crew-day sweep.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3575`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3575` | Crew In saves with Ranch, Field and Phase left empty and gives each employee their own last Job, Ranch and Field | `regression` | 1 after the first green run |

## Open questions for the tester

The sheet step "tick Based on Later Time-Cards" fails on dev (Created 0 / Field is Required); please reword it or confirm with dev.
