# `PET-12961` · Transfer to Job Cards grid is sorted by Export ID by default, then by date and time

| Artifact | Path |
|---|---|
| Ticket | PET-12961 (client feedback, Transfer to Job Cards); fix web-pet 800bc12be / #1563 |
| Plan | test-plans/client-feedback/pet-12961-tjc-export-id-default-order.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/pet-12961-tjc-export-id-default-order.spec.ts |
| Data | src/data/client-feedback/pet-12961-tjc-export-id-default-order.json |
| Runner row | src/data/runner/client-feedback.csv → `PET-12961` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `PET-12961`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data (CF CREW D, day -8) |

## Steps

| # | Step | Locator / note |
|---|---|---|
| 0 | Arrange: two run-minted employees created on Setup > Employee in CF CREW D with Export IDs 38161 and 4243 (delete-by-name registered first); the 4243 employee punches first 06:00-10:00, the 38161 employee 07:00-11:00 = 4 cards | `mintQuickAddEmployee`, `createCfEmployeeOnScreen` |
| 1 | Open Transfer to Job Cards from the left menu | |
| 2 | Scope the day and Time Card Crew to CF CREW D, analyze (4) | |
| 3 | Show the Export Identifier column (no header is clicked): its values read 38161, 38161, 4243, 4243; the Employee column groups the same way; time runs 7:00, 11:00, 6:00, 10:00 | `ensureColumnShown`, `cardGrid.columnValues` |
| 4 | The Employee filter lists 38161 before 4243 and the grid's employee order matches | `gridFilterOptions` |

## Expected outcomes

- The default order is Export ID as text (38161 before 4243), then date and time, like legacy and the Employee dropdown.
- Time order or a numeric collator would put 4243 first; that is what this proves against.

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Setup > Employee | `src/pages/setup/EmployeePage.ts` | exists, unchanged for creation |
| Transfer to Job Cards | `src/pages/processing/TransferToJobCardsPage.ts` | exists |

## Data

CF CREW D, CF JOB, CF RANCH, CF FIELD from the fixture, plus two run-tagged employees (`... NEW EMPLOYEE <stamp>`). The (crew, day) pair is D at -8. Do not suffix the Export IDs: the text-order proof depends on these two exact strings.

## Preconditions

- [ ] su login from storageState; `allowDuplicateEmployeeExportId` is true on su.
- [ ] `maximumDaysForTransferExport` is at least 8.

## API allowances

| Allowance | Use |
|---|---|
| arrange | CF fixture rows when missing |
| plumbing read | GET preferences and GET time-cards (own ids) |
| cleanup | delete the two employees by name (soft delete, WEBPET-1798), own time cards by id, crew-day sweep |

## Cleanup

Employee deletes are registered before anything is saved, so they run after the time cards (last in, first out). Nothing is transferred, so no job cards cause a 409. The `NEW EMPLOYEE` residue prefix is the backstop.

## Test case

One ticket, one happy-path test, one runner row (id `PET-12961`), tag `regression`. The spec title equals the runner `testTitle`.

## Open questions for the tester

None. To measure on dev: the label format `38161 : <Name>` (adjust `labelTemplate` only), the exact "Export Identifier" header, and that su may edit Export Identifier on the New form.
