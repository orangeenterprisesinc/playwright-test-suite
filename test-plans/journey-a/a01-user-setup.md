# A1 · License, serial number, and user setup

This is the **worked example** — the one workflow already automated. Copy
[`test-plans/_template.md`](../_template.md) for a new workflow and use this as the
reference for the level of detail that makes a spec writable without re-watching
the recording.

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A1` |
| Journey | `A` — Setup and configuration (office) |
| Segments | `all` |
| Modules | `Windows`, `Network` |
| Surface | `ui` → `tests/web/journey-a-setup/` |
| Demo candidate | no |
| Catalog status | draft |

**Summary**
> Stand up the instance with the correct serial and module set, then create office
> users and roles and confirm support access. The serial governs which modules are
> enabled and the ceilings on users, devices, databases, and personal devices.

## Catalog steps

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | Provision the instance and database. | Not in the recording — infrastructure. | **no** — done before any test runs |
| 2 | Apply the serial (PET Setup encodes concurrent users, handheld devices, databases, personal devices, module flags). | Not in the recording. | **no** — the catalog notes serial generation runs through the legacy PET Setup (Delphi) tool, which has no web surface |
| 3 | Confirm enabled modules and limits. | Not in the recording. | **not yet** — needs the Program Configuration screen; belongs with A11 (Preferences) |
| 4 | Create users under File ▸ Administration ▸ Users, assign Administrator or limited roles, grant per-user permissions (employee rates, multi-edit, multi-delete, modify locked job cards, view SSN, view I9). | The whole recording. Sidebar File ▸ Administration ▸ Users → **New User** → General tab (Name, Password, Role, Initials, Email Address) → Permissions tab (Additional Access checkboxes, Access to Reverse) → Personal Info tab (First/Middle/Last name, Title) → Save → "User created" toast → back to the list, filter by Name, confirm the row. | **yes** — `A1-001`…`A1-006` |
| 5 | Verify login. | Not in this recording. | **yes**, but covered separately by `tests/web/system/login-module.spec.ts` (`UI-001`…`UI-004`) — login is the gate every journey starts behind, so it is not duplicated here |

**Scope of the spec:** step 4 only, plus the duplicate-Initials rule the form
enforces. Steps 1–3 are infrastructure/legacy-tool and step 5 lives in the system
suite. That is why `A1` has six rows rather than one per catalog step.

## Acceptance criteria (EARS)

The catalog says what the operator *does*; this says what PET Tiger must *do
back*. Ids are stable — append, never re-sort.

| id | Requirement | Cases |
|---|---|---|
| `A1-R1` | When the New User form is saved with Name, Password, Role, Initials and Email Address populated, PET Tiger shall create the user and display "User created". | `A1-001`, `A1-002`, `A1-003`, `A1-006`, `A1-007` |
| `A1-R2` | When the Users list is filtered by Name, PET Tiger shall display exactly the matching user's row, with its Initials, Role and Email Address. | `A1-001`, `A1-002` |
| `A1-R3` | While the last-edited field on the General tab has not been blurred, PET Tiger shall keep Save disabled. | (POM) |
| `A1-R4` | If Initials match those of an existing user, then PET Tiger shall keep Save disabled, display "Already in use", and remain on the New User form. | `A1-005` |
| `A1-R5` | PET Tiger shall limit Initials to 3 characters. | `A1-005` |
| `A1-R6` | PET Tiger shall offer exactly the 17 documented Role options, in the documented order, each one selectable. | `A1-004` |
| `A1-R7` | When a user is deleted, PET Tiger shall remove it from the Users list and release its Name, Initials and Email Address for reuse. | `A1-001` |
| `A1-R8` | When an existing user is opened for edit, PET Tiger shall load its saved values into the form. | `A1-001` |
| `A1-R9` | When a serial is applied, PET Tiger shall enable the modules and ceilings it encodes. | — not automatable: serials are generated in the legacy PET Setup (Delphi) tool, which has no web surface (catalog steps 2–3) |
| `A1-R10` | When a newly created user is read back through `GET /api/users/{id}`, PET Tiger shall return every submitted value — name, role, initials, email, language, personal info, permission flags, employee access and access-to-reverse — unchanged. | `A1-007` |

`A1-R3` and `A1-R4` both end with Save disabled, and that is the point: the same
pixel means "still validating" in one and "rejected" in the other. Splitting them
is what forces each setup screen to declare its own `rejectionMessage` — see
[`SetupScreenPage`](../../src/pages/SetupScreenPage.ts).

**The 17 Role options** (`A1-R6`), in UI order, from
[`userSetupData.ts`](../../src/data/static/journey-a/userSetupData.ts):

| # | Role | | # | Role |
|---|---|---|---|---|
| 1 | Clerk | | 10 | Input Clerk |
| 2 | Administrator | | 11 | Crew Supervisor |
| 3 | Field Supervisor | | 12 | Employee Setup Clerk |
| 4 | Field Man | | 13 | Analyst |
| 5 | Time Card Clerk | | 14 | Crew Reviewer |
| 6 | Manager | | 15 | Warehouse Supervisor |
| 7 | Scan Screens Only | | 16 | Shortcuts Only |
| 8 | Report Viewer | | 17 | Device Administrator |
| 9 | Report Viewer Limited | | | |

`A1-004` asserts the whole list with `toHaveText`, so it is order-sensitive by
design and fails if an option is added, removed or reordered. The defaults the
spec selects from that list: `Administrator` (all-fields), `Clerk`
(required-only), `Report Viewer` (non-administrator).

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Users list + New/Edit User form | `File ▸ Administration ▸ Users` | [`src/pages/admin/UsersPage.ts`](../../src/pages/admin/UsersPage.ts) | exists |
| App shell sidebar | — | [`src/pages/shell/LeftNavigationPage.ts`](../../src/pages/shell/LeftNavigationPage.ts) | exists |

`UsersPage` extends [`SetupScreenPage`](../../src/pages/SetupScreenPage.ts), which
owns the grid and the save behaviour. **The three non-obvious behaviours it
encodes, which any new setup screen will also hit:**

1. **Validation runs on blur, not on input.** The last field filled must be blurred
   before Save enables — `UsersPage` overrides `blurForValidation()` to blur Email
   Address, the last General field.
2. **Save stays disabled to signal rejection.** A duplicate Initials value is
   reported by leaving Save disabled with an "Already in use" message, *not* by a
   failed save. So "Save is disabled" is ambiguous between still-validating and
   rejected — which is why each screen declares its own `rejectionMessage`.
3. **A duplicate can also come back from the server** after Save is clicked, so
   both paths are handled.

## Data

- **Value bag** — [`src/data/static/journey-a/userSetupData.ts`](../../src/data/static/journey-a/userSetupData.ts):
  the 17 Role options **in UI order** (`A1-004` asserts the whole list with
  `toHaveText`, so it doubles as a guard against a role being added, removed or
  reordered), the default roles, Personal Info values, Additional Access labels,
  and the expected messages.
- **Generated values** — [`src/data/generated/userFactory.ts`](../../src/data/generated/userFactory.ts):
  `makeUser()` produces a unique Name/Initials/Email per run.

**Uniqueness rules the app enforces**

- `Initials` is **capped at 3 characters** and must be unique among users. With only
  3 characters the random space is small, so `createUser` regenerates and retries on
  a collision rather than failing — this is expected behaviour, not flakiness.
- `Name` must be unique per screen; `Email Address` must be unique globally.
- The catalog's wider rule for journey A: every setup record carries a
  database-unique barcode (≥4 digits, no leading zero). Users have no barcode, but
  A2–A5 and A12 will.

## Preconditions

None — an authenticated session is enough, supplied by the shared
`auth-setup` project via `.auth/user.json`.

## Cleanup

PET Tiger has **no delete action for users in the UI**. Removal goes through
`DELETE /users/{id}` (added by WEBPET-1606), which soft-deletes the client row and
reconciles its `TigerMaster` counterpart in the same operation. It is
rowversion-guarded, so a delete reads the record's `version` first.

| Entity | Prefix | Route |
|---|---|---|
| `user` | `QA User ` | `DELETE /users/{id}` |

Registered in [`cleanupTargets.ts`](../../src/data/static/shared/cleanupTargets.ts) with
the delete call in
[`cleanupRegistry.ts`](../../src/utils/cleanup/cleanupRegistry.ts); the spec calls
`cleanup.track('user', name)`.

## Test cases

`src/data/runner/journey-a.csv`:

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `A1-001` | End-to-end: create a user, verify it in the Users list, edit it, then delete it | `A1-R1`, `A1-R2`, `A1-R7`, `A1-R8` | `smoke\|high-level\|regression` | 1 |
| `A1-002` | Create a user with all fields populated | `A1-R1`, `A1-R2` | `high-level\|regression` | 1 |
| `A1-003` | Create a user with only the required fields | `A1-R1` | `high-level\|regression` | 1 |
| `A1-004` | Every Role option is offered in the documented order | `A1-R6` | `regression` | 1 |
| `A1-005` | Creating a user with an Initials value already in use is rejected | `A1-R4`, `A1-R5` | `regression` | 1 |
| `A1-006` | Create a user with a non-administrator role | `A1-R1` | `high-level\|regression` | 1 |
| `A1-007` | Create a user and verify every submitted field persisted, read back via the API | `A1-R1`, `A1-R10` | `regression` | 1 |

`A1-007` lives in its own spec, `a01-user-create.spec.ts`, relocated from the
web-pet suite. It reuses `A1-R1` rather than restating it — the New User form it
saves carries exactly R1's field set — and adds `A1-R10` for the field-level
persistence check no other case makes. It deliberately does **not** cite `A1-R8`:
that requirement's observable is the *edit form loading* saved values, and this
test reads the record through the API without reopening the form.

`A1-001` holds the file's single `smoke` slot: it is the widest path through the
workflow (create → list → edit → delete) and the only case that exercises `A1-R7`
and `A1-R8`. Everything below it is high-level or regression.

`A1-004` was previously "every Role option is selectable **and** a
non-administrator user can be created" — two outcomes in one case. It now covers
`A1-R6` alone and drops to regression, because a dropdown-contents guard is not a
business path; the non-administrator creation it used to carry became `A1-006`.

All six were **disabled until 2026-08-04**, waiting on a delete route: with only SQL
cleanup available they leaked a test user per run on any host without database
access, which is every CI runner. WEBPET-1606 shipped `DELETE /users/{id}` and they
were enabled (`enabled=1` in the CSV plus `npm run runner:sync`).

## Open questions for the tester

- [ ] Step 3 — which screen shows the enabled modules and the licensed-user ceiling?
      If it is Program Configuration, does A1 or A11 own asserting it?
- [ ] Are the per-user permission checkboxes the catalog lists (employee rates,
      multi-edit, multi-delete, modify locked job cards, view SSN, view I9) all on
      the Permissions tab? The recording shows Additional Access and Access to
      Reverse; the rest were not exercised.
- [ ] Is there a licensed-user limit that rejects creation past N users? If so it
      needs its own row, and a test that creates users must not exhaust the licence.
