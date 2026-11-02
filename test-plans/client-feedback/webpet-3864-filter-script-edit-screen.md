# `WEBPET-3864` · The Edit Filter Script screen matches Legacy: Screen label, script type name, read-only fields, user assignment

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3864 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3864-filter-script-edit-screen.md |
| Spec | tests/web/client-feedback/setup/webpet-3864-filter-script-edit-screen.spec.ts |
| Data | src/data/client-feedback/webpet-3864-filter-script-edit-screen.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3864` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3864`) |
| Journey | none |
| Surface | ui |
| Bucket | A: screen only; seed script "Permanent Badge Assignment" |

## Traceability

| Field | Value |
|---|---|
| Sign-off | see Client Feedback tracker |
| Evidence | none |
| Fix | not recorded |

## Steps

| # | Step | Confirmed on dev 2026-11-02 |
|---|---|---|
| 1-2 | File ▸ Administration ▸ Setup ▸ Scripts; open the script | PASS |
| 3 | Screen = Time In and Script Type = Report, both read-only | PASS |
| 4 | Description read-only; Execute Script offered; no Table field | PASS |
| 5 | Report Viewer Users: Add Users "Select users..." and Empty | PASS |
| 6 | Cancel | |

## Expected outcomes

- Screen and Script Type show names (not numbers) and are locked.
- Description is read-only; Execute Script is available; there is no Table field.
- Report Viewer Users offers Add Users and Empty.
- Not asserted: the lock icon is cosmetic; read-only state is asserted with `not.toBeEditable()`. Empty is disabled while no users are assigned, so only its presence is asserted.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Filter Scripts | File ▸ Administration ▸ Setup ▸ Scripts | `src/pages/admin/FilterScriptsPage.ts` | new |

## Data

The seed script "Permanent Badge Assignment" (Time In / Report). The sheet's example "Employees Currently on the Job" is not on the su tenant (recorded as a `data-note` annotation); the list has no New button, so a person would have to create that script on screen.

## Preconditions

- [ ] su login from storageState.

## API allowances

| Allowance | Use |
|---|---|
| arrange | none |
| plumbing read | none |
| cleanup | none |

## Cleanup

None. The script is never saved.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3864` | The Edit Filter Script screen matches Legacy: Screen label, script type name, read-only fields, user assignment | `regression` | 1 after the first green run |

## Open questions for the tester

None. The sheet TC names that script only as an example ("e.g."); the substitution is recorded in the Happy Path tab's Reason (2026-11-02).
