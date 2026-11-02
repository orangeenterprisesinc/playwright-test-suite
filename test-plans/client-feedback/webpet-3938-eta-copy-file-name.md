# `WEBPET-3938` · A copy button next to the export file name copies the name and shows 'Copied.'

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3938 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3938-eta-copy-file-name.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3938-eta-copy-file-name.spec.ts |
| Data | src/data/client-feedback/webpet-3938-eta-copy-file-name.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3938` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3938`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 0 | Arrange: CF CREW D, day -11, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards) | "2 job cards written" |
| 2 | Export to Accounting via the menu, Payroll, the day, Job Card Crew is CF CREW D, Refresh, all inside the export-draft lock | 2 matched, 2 Ready |
| 3 | Grant clipboard access, arm the picker stand-in; Export, confirm, Export up to the Save export file dialog | confirmed |
| 4 | File name `PET` + 17 digits + `.txt`; an icon-only "Copy file name" button beside it | 28x28 icon button at the input's right edge |
| 5 | Click copy: "Copied." appears and the clipboard holds the file name | confirmed (short-lived toast) |
| 6 | Discard, "Discard file" plus the warning, Discard again | confirmed |
| 7 | Refresh; 2 Ready, rows Pending | confirmed |

## Expected outcomes

- A copy button beside the export file name copies the name and shows "Copied.".
- Nothing is saved or exported: the own cards are still Ready after Discard.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists; adds `openSaveDialog`, `refreshCandidates`, `saveDialog` |
| Save export file dialog | Export ▸ confirm ▸ Export | `src/pages/processing/ExportSaveDialog.ts` | new (POM) |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB (Earning Code RH,,OT,,DT,,RDP,,ODT,,DDT). The (crew, day) pair is D at -11.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 11 (dev: 21).
- [ ] CF JOB carries the earning code (`ensureJobOnScreen` repairs it on screen).
- [ ] Chromium (clipboard permission grant; WebKit rejects `clipboard-read`).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen: steps 5 and 7 |
| cleanup | before-phase sweep, any run id the visit records (the Refresh draft; POST ...run answers without an id) dropped inside the export-draft lock, and by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3938` | A copy button next to the export file name copies the name and shows 'Copied.' | `regression` | 1 after the first green run |

## Open questions for the tester

None.
