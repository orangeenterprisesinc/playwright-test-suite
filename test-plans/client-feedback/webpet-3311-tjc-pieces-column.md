# `WEBPET-3311` · Transfer to Job Cards – Pieces column missing from Show Columns options

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3311 (Done; customer Anthony); fix web-pet #1105 (merged 2026-09-23) |
| Plan | test-plans/client-feedback/webpet-3311-tjc-pieces-column.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3311-tjc-pieces-column.spec.ts |
| Data | src/data/client-feedback/webpet-3311-tjc-pieces-column.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3311` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3311`) |
| Journey | none |
| Surface | ui |
| Bucket | A: no data |

## Steps

| # | Step | Confirmed on dev 2026-10-30 |
|---|---|---|
| 1 | Open Transfer to Job Cards from the left menu (`pages.transferToJobCards.openFromMenu()`) | link "Transfer to Job Cards" → /transfer-to-job-cards; testid `transfer-v2-page` |
| 2 | On the Time Cards tab (the default), click **Columns** | `getByRole('button', { name: 'Columns', exact: true })` inside testid `v2-grid-header` |
| 3 | The **Show columns** dialog lists **Pieces** | `getByRole('dialog', { name: 'Show columns' })` → `getByRole('checkbox', { name: 'Pieces', exact: true })` (input id `column-picker-numOfPieces`, label "Pieces") |
| 4 | If Pieces is unticked, tick it; it ends ticked | checked by default for su |
| 5 | Close the dialog; the grid shows the Pieces column header | `getByRole('button', { name: 'Close' })` in the dialog; header `columnheader "Reorder column Pieces"` in testid `v2-demoted-grid` |

## Expected outcomes

- The Show columns picker on the Transfer to Job Cards Time Cards grid lists a "Pieces" entry.
- After the step, the entry is ticked, and the Time Cards grid shows a "Pieces" column header.
- Not asserted (each recorded as a `not-asserted` annotation from the JSON):
  - Job Cards tab "Number of Pieces" header — deferred: that tab has no Columns picker while the preview is empty, and a preview needs time-card rows.
  - Pieces values in rows — deferred: the ticket is about the picker, not the values.
- `(POM)`: the tick-if-unticked self-heal records a `self-heal` annotation.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds `columnsButton`, `columnPicker`, `openColumnPicker`, `columnPickerEntry`, `showColumn`, `closeColumnPicker`, `gridColumnHeader` |

## Data

None. The picker and headers render on the empty Time Cards grid; no date range or Analyze. The column layout is saved per user on the server, so the spec only ticks Pieces (restoring the default) and never unticks it.

## Preconditions

- [ ] None. su login comes from storageState. No arrange, no cleanup, no fixture day.

## API allowances

None. No reads or writes outside the browser. Ticking the entry is an on-screen user preference.

## Cleanup

None. The only possible change is ticking Pieces back to its default.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3311`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3311` | Transfer to Job Cards lists Pieces in Show columns | `regression` | 1 |

```ts
test.describe('WEBPET-3311 · Transfer to Job Cards: Pieces in Show columns', { tag: ['@ClientFeedback', '@WEBPET-3311'] }, () => {
    test('Show columns lists Pieces and the Time Cards grid shows the Pieces column', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'WEBPET-3311' }],
    }, async ({ pages }, testInfo) => { … });
});
```

## Open questions for the tester

- [x] "Pieces" (Time Cards tab, id `column-picker-numOfPieces`) is accepted as the ticket's "Pieces column"; "Number of Pieces" exists only as a Job Cards tab header, where there is no picker.
