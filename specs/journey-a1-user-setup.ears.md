# Journey A1 — User Setup ⚠️ SUPERSEDED — DO NOT WRITE TESTS FROM THIS FILE

> **Superseded by `specs/journey-a1-user-setup.annotator-run1.md`.** Kept only as the
> record of what an earlier pass claimed, because the current plan's *Divergences* table
> refers to it.
>
> Two reasons not to use it:
>
> 1. **Five of its claims were retracted.** It asserts a 3-character Initials cap, a
>    *Fix errors to save* tooltip, uniqueness on Name and Email as well as Initials,
>    role-driven permission defaults, and the absence of any delete action — none of
>    which the annotator frames support. Writing a test against any of them produces a
>    wrong assertion.
> 2. **It is a derivative.** It is a notation conversion of two earlier prose plans, not
>    a fresh reading of the recording, so it adds no independent evidence.
>
> It is also written in EARS notation, which this repo no longer uses — see
> `specs/README.md` for the current plan format. Requirement numbers here do **not**
> correspond to those in the current plan.

**Module:** Administration ▸ Users (`/settings/users`)
**Source:** `Testing video/Journey A1 User Setup (1).mp4` — 92.7 s, 1920×1080, recorded
against `192.168.1.74`. Cross-checked against `specs/journey-a1-user-setup.md` and
`specs/journey-a1-user-setup.annotated.md`.
**Notation:** EARS (retired) — retained verbatim below for the historical record.

## Preconditions

Browser projects load `.auth/user.json`, so tests begin authenticated as an administrator;
the recording's opening login is not re-implemented. The Users list is non-empty (33 rows in
the recording) and contains at least one user whose Initials are known, for the
duplicate-Initials path.

---

## Requirements

### Navigation and list

**R1.** **When** the user selects **File ▸ Administration ▸ Users** in the left navigation,
the system **shall** display the Users list at `/settings/users`.

**R2.** **While** the Users list is displayed, the system **shall** show the columns Name,
Initials, Role, Email and Active, a filter row, and a total row count in the footer.

**R3.** **When** the user selects **New User**, the system **shall** display the New User form
at `/settings/users/new` with Role defaulted to *Clerk*, Language to `__none__`, Access to
Reverse to *User*, and Active enabled.

### Creating a user

**R4.** **When** the user opens the **Role** dropdown, the system **shall** display exactly
17 options: Clerk, Administrator, Field Supervisor, Field Man, Time Card Clerk, Manager, Scan
Screens Only, Report Viewer, Report Viewer Limited, Input Clerk, Crew Supervisor, Employee
Setup Clerk, Analyst, Crew Reviewer, Warehouse Supervisor, Shortcuts Only, Device
Administrator.

**R5.** **When** the user selects a Role, the system **shall** apply that role's default
permissions — selecting *Administrator* **shall** enable *Allow Employee I9 Information
Access*.

**R6.** **When** the user checks an Additional Access permission, the system **shall** mark
that permission as changed with an indicator distinguishing it from a role default.

**R7.** **When** the user selects **Save** with all required fields valid and unique, the
system **shall** create the user, navigate to that user's edit page, display the header
`Edit User: <name>`, and display a *User created* confirmation.

**R8.** **When** a user has been created, the system **shall** list it with the entered
Initials, Role and Email, show Active as *Yes*, and **shall** increase the footer total by one.

**R9.** **When** the user re-opens a created user's edit page, the system **shall** display
the previously saved General, Permissions and Personal Info values, including the Additional
Access selections and Access to Reverse.

### Constraints

**R10.** The system **shall** limit the Initials field to a maximum of 3 characters.

**R11.** The system **shall** require Name, Password, Role, Initials and Email Address to
create a user, and **shall not** require Middle Name, Title, or the Time Card Defaults.

**R12.** The system **shall** enforce uniqueness of Name, Initials and Email across users.

**R13.** The system **shall** validate uniqueness **on submission**, not on field blur — a
duplicate value **shall not** raise an error while the field is merely edited or blurred.

**R14.** The system **shall not** provide a delete action for a user in the user interface.

### Negative and edge cases

**R15.** **If** the user selects Save while Password is empty, **then** the system **shall**
display *"This field is required"* beneath Password, display the error-summary badge showing
one error, and **shall not** create the user.

**R16.** **If** the user selects Save with an Initials value already held by another user,
**then** the system **shall** display *"Already in use"* beneath Initials, display the
error-summary badge, disable Save, remain on `/settings/users/new`, and **shall not** create
the user.

**R17.** **While** a validation error is present, the system **shall** keep Save disabled and
**shall** display the tooltip *"Fix errors to save"* on hover.

**R18.** **If** the user replaces a rejected Initials value with an unused one, **then** the
system **shall** clear the error, re-enable Save, and permit creation on the next submission.

**R19.** **If** a user is created with only the required fields, **then** the system **shall**
create it successfully and list it with the same completeness as a fully populated user.

**R20.** **If** a user is created with a non-administrator Role, **then** the system **shall**
list that Role in the grid unchanged.

---

## Test data

Name, Initials and Email are generated per run by `src/utils/testData/userFactory.ts`,
because R12 makes the recording's literal values (`Jesus Mendoza` / `JM` /
`jmendoza@test.com`) collide on a second run. Fixed values — roles, permission labels,
messages — come from `src/data/user-setup-data.json`.

Because R10 caps Initials at 3 characters, the random space is small and collisions are
expected. Creation **shall** regenerate Initials and retry on a `duplicate-initials` outcome
(see R16), so a genuine collision does not fail an unrelated test.

## Cleanup

R14 means removal cannot be done through the UI, and the application soft-deletes. Each
created user is removed in `afterEach` via `runSql` (`src/utils/db/sqlClient.ts`), gated by
`DB_CLEANUP`. `src/fixtures/global-teardown.ts` sweeps leftovers by the `test_user_prefix`
as a backstop.

---

## Not established

The recording does not demonstrate these. They are **not** requirements yet — the planner
agent must discover the actual behaviour against the running application before any
assertion is written.

| Open question | Why it matters |
|---|---|
| Behaviour when **Name** is empty on save | R11 says it is required; the message and error placement are unobserved |
| Behaviour when **Email** is malformed | Format validation may or may not exist, client- or server-side |
| Behaviour on **duplicate Name** or **duplicate Email** | R12 asserts uniqueness across all three, but only the Initials path was demonstrated |
| Behaviour when **Initials exceeds 3 characters** | R10 states the cap; whether input is truncated, blocked, or rejected on save is unobserved |
| Whether Save is disabled **before** any interaction | Only the post-error disabled state was seen |

Four of the five required negative scenarios are already covered by R15–R18. This table is
where the remaining coverage comes from once the live application answers it.
