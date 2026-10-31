# `WEBPET-3283` · Transfer to Job Cards – the Crew In employee list shows Export ID : Name

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3283 |
| Plan | test-plans/client-feedback/webpet-3283-tjc-crew-in-export-id-labels.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3283-tjc-crew-in-export-id-labels.spec.ts |
| Data | src/data/client-feedback/webpet-3283-tjc-crew-in-export-id-labels.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3283` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3283`) |
| Journey | none |
| Surface | ui |
| Bucket | B: no data (no day, no records) |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Client Feedback Happy Path tab (see Jira) |
| Manual walk | 2026-10-31 on dev as su: PASS with a caveat (empty Export ID, see below) |

## Steps

| # | Step | Confirmed on dev 2026-10-31 |
|---|---|---|
| 0 | Arrange: `ensureCfFixtures` for CF CREW B | |
| 1 | Open Transfer from the menu, New record > Crew In | |
| 2 | Tick Use Employee Crew, pick CF CREW B; roster "2 of 2 selected" | |
| 3 | Checkboxes ": CF B ONE" and ": CF B TWO" are listed; "CF B ONE" / "CF B TWO" alone are not | the label format is "<Export ID> : <Name>" with an empty id |
| 4 | Close the sheet; no status dialog (nothing saved) | |

## Expected outcomes

- Each roster employee is labelled "Export ID : Name".
- Not asserted: a non-empty Export ID before the colon. The CF employees have no export identifier, and giving one an id would change every CF label (`not-asserted` annotation).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists; adds the Crew In members (`openCrewIn`, `setCrewInCheckbox`, `pickCrewInLookup`, `crewInEmployee`, `crewInRosterCount`, `closeCrewIn`) |

## Data

CF CREW B (CF B ONE, CF B TWO). No (crew, day) pair: nothing is created.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | fixture rows via ensureOnScreen, when missing |
| cleanup | none needed: nothing is saved |

## Cleanup

None.

## Test case

One ticket, one happy-path test, one runner row (id `WEBPET-3283`).

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3283` | The Crew In employee list shows Export ID : Name | `regression` | 1 after the first green run |

## Open questions for the tester

None.
