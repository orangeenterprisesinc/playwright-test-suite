# `WEBPET-3574` · View Time Cards – a Multi Edit can be reversed with Undo and the old value returns

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3574 (Done; customer Anthony); fix web-pet #1313 |
| Plan | test-plans/client-feedback/webpet-3574-vtc-reverse-multi-edit-undo.md |
| Spec | tests/web/client-feedback/view-time-cards/webpet-3574-vtc-reverse-multi-edit-undo.spec.ts |
| Data | src/data/client-feedback/webpet-3574-vtc-reverse-multi-edit-undo.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3574` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3574`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 10-05 |
| Evidence | none |
| Fix | web-pet #1313 |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: CF CREW C, day -10, both employees, CF JOB, 07:00-11:00 = 4 cards | |
| 1 | Open View > Time Cards, scope the day and Time Card Crew, Apply Filter (4 rows) | |
| 2 | Tick ONE's Time In and Time Out; read their Memo cells | |
| 3 | Multi Update: Field = Memo, Value "CF UNDO TEST", Update Records (2): toast "2 records updated", both Memo cells show the value | PASS |
| 4 | File > Restore or Reverse > Reverse Multi Edit: the own batch (TimeCard, memo, 2 records) is Active and offers Undo | row "… \| Su \| TimeCard \| memo \| CF UNDO TEST \| 2 \| Active \| Undo" |
| 5 | Undo, confirm "Undo update": the dialog says it restores 2 record(s) changed by the "memo" update; Status Undone; no Undo button | |
| 6 | Back on View > Time Cards (re-scoped) both Memo cells are as before the edit | Memo blank on both |

## Expected outcomes

- A Multi Edit shows in Reverse Multi Edit and Undo restores the old values.
- Not asserted: the in-toast Undo is not used; the edit-history row stays as an audit row.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| View ▸ Time Cards | View, Time Cards | `src/pages/processing/ViewTimeCardsPage.ts` | exists; adds the Multi Update bar members |
| Reverse Multi Edit | File, Restore or Reverse, Reverse Multi Edit | `src/pages/admin/ReverseMultiEditPage.ts` | new; subclasses `BulkDeleteHistoryPage`; registered as `reverseMultiEdit` |

## Data

CF CREW C with CF C ONE and CF C TWO. The (crew, day) pair is C at -10.

## Preconditions

- [ ] su login from storageState.
- [ ] `maximumDaysForTransferExport` is at least 12 (dev: 21).

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| plumbing read | GET preferences, GET time-cards (own-id capture), GET `bulk-update-history?type=edit` (the own batch id, the D8 pattern). The proof is on screen: steps 3 to 6 |
| cleanup | before-phase sweep and by-id teardown |

## Cleanup

Own time cards by id, then a crew-day sweep. The edit is undone on screen by the test itself; its history row stays as an audit row.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3574` | A Multi Edit on View > Time Cards can be reversed with Undo and the old value returns | `regression` | 1 after the first green run |

## Open questions for the tester

The undo POST is assumed to be `bulk-update-history/{id}/undo`, as the base route guard expects; a mismatch fails loudly at `waitForResponse` on the first run.
