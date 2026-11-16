# `WEBPET-3888` · The User record has working Shortcut and Alias Set fields, and double-clicking Alias Set creates a new Alias Set

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3888 (client feedback; see Client Feedback tracker) |
| Plan | test-plans/client-feedback/webpet-3888-user-shortcut-alias-set.md |
| Spec | tests/web/client-feedback/admin/webpet-3888-user-shortcut-alias-set.spec.ts |
| Data | src/data/client-feedback/webpet-3888-user-shortcut-alias-set.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3888` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3888`) |
| Journey | none |
| Surface | ui |
| Bucket | A: own minted Alias Set |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Jira comment 103183, QA PASS 2026-11-02 |
| Evidence | none |
| Fix | web-pet #1547 |

## Steps

| # | Step | Confirmed |
|---|---|---|
| 1 | Open File ▸ Administration ▸ Users and click New | 2026-11-11 |
| 2 | Shortcut is shown and accepts a value (the first option it offers) | 2026-11-11 (only option: Field Clerk Shortcuts) |
| 3 | Double-click the Alias Set field: the "Add Alias Set" form opens | walk 2026-11-02 |
| 4 | Its Alias Fields grid is shown and Alias Type is blank | 2026-11-11 |
| 5 | Choose Alias Type Windows: the grid fills with 74 Alias Fields, sorted by Alias Field | walk 2026-11-02 |
| 6 | Enter the minted name and Save: the form closes and the new set is selected in the user's Alias Set | |
| 7 | Discard the user: back on the Users list, nothing saved | |

## Expected outcomes

- Shortcut and Alias Set are present on the New User form; Shortcut takes a value.
- Double-clicking Alias Set opens "Add Alias Set"; Windows fills 74 sorted Alias Fields; a saved set is selected on the user.
- Not asserted: whether the saved set keeps its 74 fields (open question on the ticket); Edit Alias Set; that no user was saved beyond landing on the list (no Name was entered, so the form cannot save).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Users, New User | File ▸ Administration ▸ Users | `src/pages/admin/UsersPage.ts` | exists; adds Shortcut / Alias Set members |
| Add Alias Set | double-click Alias Set | `src/pages/admin/AliasSetDialog.ts` | new |

## Data

One Alias Set named per run (`W3888 NEW ALIAS SET <stamp>-W<n>`); cleanup target `aliasSet` (`alias-sets`, soft-delete only).

## Preconditions

- [ ] su login from storageState.
- [ ] The tenant has at least one Shortcut.

## API allowances

| Allowance | Use |
|---|---|
| cleanup | after-test delete of the minted alias set by name (`mintAliasSetName`), registered before Save |

## Cleanup

The alias set is deleted by name; it soft-deletes and is never purged.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3888` | The User record has working Shortcut and Alias Set fields, and double-clicking Alias Set creates a new Alias Set | `regression` | 1 after the first green run |

## Open questions for the tester

None.
