# `WEBPET-3464` · After Export on Export to Accounting the user can rename the export file before saving it

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3464 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3464-eta-rename-before-save.md |
| Spec | tests/web/client-feedback/export-to-accounting/webpet-3464-eta-rename-before-save.spec.ts |
| Data | src/data/client-feedback/webpet-3464-eta-rename-before-save.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3464` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3464`) |
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
| 0 | Arrange: CF CREW D, day -9, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Transfer the crew's day (2 job cards) | "2 job cards written" |
| 2 | Export to Accounting via the menu, Payroll, the day, Job Card Crew is CF CREW D, Refresh, all inside the export-draft lock | 2 matched, 2 Ready |
| 3 | Arm the picker stand-in; Export, confirm "Export 2 JobCards to Famous 120.03 via File output?", Export | confirm dialog read as expected |
| 4 | Dialog "Save export file": File name `PET` + 17 digits + `.txt` (the name the SPA offered the stand-in), "Payroll Export File Folder: ...", "Save As..." | confirmed |
| 5 | Rename to "CF CREW export.txt", Save As: the stand-in receives that name and Cancels; the dialog stays open with the new name; no download | confirmed |
| 6 | Discard, "Discard file" plus the warning, Discard again; the dialog closes | confirmed |
| 7 | Refresh; 2 Ready, rows Pending | confirmed |

## Expected outcomes

- The export file name is editable before saving; the save window is offered the changed name; nothing downloads automatically.
- Nothing is exported: the own cards are still Ready after Discard.
- Not asserted: the real OS save window and the saved file (never export).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Export to Accounting | File ▸ Export to Accounting | `src/pages/processing/ExportToAccountingPage.ts` | exists; adds `openSaveDialog`, `refreshCandidates`, `saveDialog` |
| Save export file dialog | Export ▸ confirm ▸ Export | `src/pages/processing/ExportSaveDialog.ts` | new (POM) |
| Transfer to Job Cards | Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists, driven through `transferCrewDay` |

## Data

CF CREW D with CF D ONE and CF D TWO, CF JOB (Earning Code RH,,OT,,DT,,RDP,,ODT,,DDT). The (crew, day) pair is D at -9.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 9 (dev: 21).
- [ ] CF JOB carries the earning code (`ensureJobOnScreen` repairs it on screen).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards and GET job-cards (own ids). The proof is on screen: step 7 |
| cleanup | before-phase sweep, any run id the visit records (the Refresh draft; POST ...run answers without an id) dropped inside the export-draft lock, and by-id teardown of job cards and time cards |

## Cleanup

`registerCfCleanup` deletes the own job cards and time cards by id. The Refresh draft is deleted inside the lock by `withCrewEta`.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3464` | After Export on Export to Accounting the user can rename the export file before saving it | `regression` | 1 after the first green run |

## Open questions for the tester

None.
