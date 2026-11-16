# `PET-12958` · The Payroll Test File download matches legacy: file name, extension, CRLF line endings and row order

| Artifact | Path |
|---|---|
| Ticket | PET-12958 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/pet-12958-eta-test-file-legacy-format.md |
| Spec | tests/web/client-feedback/export-to-accounting/pet-12958-eta-test-file-legacy-format.spec.ts |
| Data | src/data/client-feedback/pet-12958-eta-test-file-legacy-format.json |
| Runner row | src/data/runner/client-feedback.csv → `PET-12958` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `PET-12958`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | QA PASS 2026-11-05 |
| Evidence | none |
| Fix | web-pet #1559 |

## Steps

| # | Step | Confirmed on dev |
|---|---|---|
| 0 | Arrange: CF CREW D, day -19. Both employees on CF JOB 07:00, then CF PIECE JOB 09:00, a crew piece-out of 2 at 10:00, Time Out 12:00 = 7 time cards | |
| 1 | Transfer the crew's day (4 job cards) | |
| 2 | Export to Accounting via the menu inside the export-draft lock: Payroll, the day, Job Card Crew is CF CREW D, Refresh | |
| 3 | Test File: "4 ready / 0 cannot export"; dismiss the Analyze Results alert with No | |
| 4 | The file name matches `ExportToAccFamous120-PPE<17>-<17>.txt`; "4 records written" | |
| 5 | Download the file: every line ends in CRLF (no bare LF or CR, last line terminated); one 240-character line per record; all rows of one employee are contiguous | |
| 6 | Close the sheet; 4 Ready | |

## Expected outcomes

- The legacy file name carries the `.txt` extension.
- CRLF throughout, including after the last row.
- One fixed-width line per record, rows grouped by employee.
- Not asserted: the TC's Reverse step (teardown deletes the own job cards and time cards by id; the on-screen Reverse needs the transfer landing page).
- Not asserted: legacy job-code order within an employee. The #1559 split-job order fix is DataTech-only and su is Famous 120.
- Not asserted: line content (unmeasured).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists |
| Test File sheet | Export to Accounting ▸ Test File | `src/pages/processing/TestFileSheet.ts` | exists; adds `downloadFile` |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB and CF PIECE JOB. The (crew, day) pair is D at -19.

## Preconditions

- [ ] su login from storageState; payroll format Famous 120.03 (53).
- [ ] `maximumDaysForTransferExport` is at least 19 (dev: 21).
- [ ] CF PIECE JOB cards pass Test File (unmeasured; the first run tells).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen and in the downloaded file |
| cleanup | before-phase sweep, the Refresh draft DELETE inside the export-draft lock, by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `PET-12958` | The Payroll Test File download matches legacy: file name, extension, CRLF line endings and row order | `regression` | 1 after the first green run |

## Open questions for the tester

None.
