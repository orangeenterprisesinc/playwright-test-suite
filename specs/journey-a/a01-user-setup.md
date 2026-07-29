# A1 · License, serial number, and user setup

This is the **worked example** — the one workflow already automated. Copy
[`specs/_template.md`](../_template.md) for a new workflow and use this as the
reference for the level of detail that makes a spec writable without re-watching
the recording.

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A1` |
| Journey | `A` — Setup and configuration (office) |
| Segments | `all` |
| Modules | `Windows`, `Network` |
| Surface | `ui` → `tests/ui/journey-a-setup/` |
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
| 4 | Create users under File ▸ Administration ▸ Users, assign Administrator or limited roles, grant per-user permissions (employee rates, multi-edit, multi-delete, modify locked job cards, view SSN, view I9). | The whole recording. Sidebar File ▸ Administration ▸ Users → **New User** → General tab (Name, Password, Role, Initials, Email Address) → Permissions tab (Additional Access checkboxes, Access to Reverse) → Personal Info tab (First/Middle/Last name, Title) → Save → "User created" toast → back to the list, filter by Name, confirm the row. | **yes** — `A1-001`…`A1-005` |
| 5 | Verify login. | Not in this recording. | **yes**, but covered separately by `tests/ui/system/login-module.spec.ts` (`UI-001`…`UI-004`) — login is the gate every journey starts behind, so it is not duplicated here |

**Scope of the spec:** step 4 only, plus the duplicate-Initials rule the form
enforces. Steps 1–3 are infrastructure/legacy-tool and step 5 lives in the system
suite. That is why `A1` has five rows rather than one per catalog step.

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

- **Value bag** — [`src/data/journey-a/userSetupData.ts`](../../src/data/journey-a/userSetupData.ts):
  the 17 Role options **in UI order** (`A1-004` asserts the whole list with
  `toHaveText`, so it doubles as a guard against a role being added, removed or
  reordered), the default roles, Personal Info values, Additional Access labels,
  and the expected messages.
- **Generated values** — [`src/utils/testData/userFactory.ts`](../../src/utils/testData/userFactory.ts):
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

PET Tiger has **no delete for users**, in the UI or the API. Removal is a soft
delete (`Deleted = 1`) in the client database, which also frees the
Name/Initials/Email.

| Entity | Table | Name column | Prefix |
|---|---|---|---|
| `user` | `dbo.Users` | `Name` | `QA User ` |

Registered in [`cleanupTargets.ts`](../../src/data/shared/cleanupTargets.ts); the
spec calls `cleanup.track('user', name)`. Scoped to the **client** DB only — the
shared `TigerMaster` is left alone, because emails are unique per run so a leftover
global row never blocks re-creation.

## Test cases

`src/data/runner/journey-a.csv`:

| id | Title | Tags | enabled |
|---|---|---|---|
| `A1-001` | End-to-end: create a user, verify it in the Users list, edit it, then delete it | `smoke\|high-level\|regression` | 0 |
| `A1-002` | Create a user with all fields populated | `smoke\|high-level\|regression` | 0 |
| `A1-003` | Create a user with only the required fields | `high-level\|regression` | 0 |
| `A1-004` | Every Role option is selectable and a non-administrator user can be created | `high-level\|regression` | 0 |
| `A1-005` | Creating a user with an Initials value already in use is rejected | `regression` | 0 |

All five ship **disabled**: they need SQL cleanup reachable from the run host
(`DB_CLEANUP`, `DB_SERVER`, `DB_CLIENT`), so enabling them on a runner without
database access would leak a test user per run. Enable with `enabled=1` in the CSV
plus `npm run runner:sync`, or temporarily via `src/data/runnerList.json`.

## Open questions for the tester

- [ ] Step 3 — which screen shows the enabled modules and the licensed-user ceiling?
      If it is Program Configuration, does A1 or A11 own asserting it?
- [ ] Are the per-user permission checkboxes the catalog lists (employee rates,
      multi-edit, multi-delete, modify locked job cards, view SSN, view I9) all on
      the Permissions tab? The recording shows Additional Access and Access to
      Reverse; the rest were not exercised.
- [ ] Is there a licensed-user limit that rejects creation past N users? If so it
      needs its own row, and a test that creates users must not exhaust the licence.
