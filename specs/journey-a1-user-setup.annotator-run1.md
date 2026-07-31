# Journey A1 — User Setup (annotator run `journey-a1-user-setup-1`)

**Module:** Administration ▸ Users (`/settings/users`)

**Source:** `.video-annotations/journey-a1-user-setup-1/` — `annotations.json` plus all 56
annotated keyframes, produced from `Testing video/Journey A1 User Setup (1).mp4`
(92.7 s, 15 fps, 1920×1080, recorded against `192.168.1.74`). 28 action/settled pairs,
10 forced samples. Coverage check: `max_action_gap_ms` 5000 = `settings.max_gap_ms` 5000
and `truncated: false`, so no stretch of the journey went unsampled.

**Format:** see `specs/README.md`.

**Related:** `specs/journey-a1-user-setup.ears.md` is an earlier, superseded plan for the
same journey. This plan is written *only* from what these frames show; where the two
disagree, see **Divergences from the earlier plan** at the end.

## Preconditions

Browser projects load `.auth/user.json`, so tests begin authenticated as an administrator.
The recording opens on `/dashboard` already logged in, so there is no login step to
reproduce. The Users list is non-empty (33 rows at the start of the recording) and contains
at least one user whose Initials are known, which is what the duplicate-Initials path needs.

---

## Requirements

### Navigation and list

**R1.** Selecting **File ▸ Administration ▸ Users** in the left navigation displays the
Users list at `/settings/users`.

**R2.** The Users list shows the columns Name, Initials, Role, Email and Active, a
per-column filter row, and a `Total N rows` footer.

**R3.** Selecting **New User** displays the New User form at `/settings/users/new` with the
sections General, Permissions, Time Card Defaults and Personal Info, and defaults Role to
*Clerk*, Language to `__none__`, Access to Reverse to *User*, Employee Access to *Undefined*,
and Active to enabled.

**R4.** At its defaults, the New User form shows every Record Access permission enabled
except *View Audit Records*, and within Additional Access shows only *Allow Employee I9
Information Access* enabled.

### Filling the form

**R5.** Opening the **Role** dropdown displays 17 options — Clerk, Administrator, Field
Supervisor, Field Man, Time Card Clerk, Manager, Scan Screens Only, Report Viewer, Report
Viewer Limited, Input Clerk, Crew Supervisor, Employee Setup Clerk, Analyst, Crew Reviewer,
Warehouse Supervisor, Shortcuts Only, Device Administrator — and marks the currently
selected one.

**R6.** Modifying any field marks that field with a change indicator and replaces the
footer's Cancel action with an *Unsaved changes* bar offering **Discard changes**.

**R7.** Enabling an Additional Access permission shows it checked and marks it with the
change indicator.

### Saving

**R8.** Selecting **Save** with all required fields valid and unique creates the user,
navigates to `/settings/users/<id>`, displays the header `Edit User: <name>`, and displays a
*User created* confirmation.

**R9.** A created user's Edit form renders the Name field read-only and extends the form's
section list with Crew, Departments, Job Groups and Devices.

**R10.** Returning to the Users list after creating a user lists the new user with the
entered Initials, Role and Email, shows Active as *Yes*, and increases the `Total N rows`
footer by one.

**R11.** Re-opening a created user's Edit form displays the saved Role, Initials, Email,
Active state, enabled Additional Access permissions, Access to Reverse and Employee Access
values.

**R12.** A newly created user's Edit form shows Crew as *No crews assigned.*, Departments as
*No departments assigned.* and Job Groups as *No job groups assigned.*

### Constraints

**R13.** Creating a user requires Name, Password, Role, Initials and Email Address — each
marked with an asterisk.

**R14.** Initials are unique across users.

**R15.** Initials uniqueness is validated on submission; a duplicate value raises no error
while the field is merely edited or blurred.

### Negative and edge cases

**R16.** Selecting **Save** with an Initials value already held by another user displays
*Already in use* beneath Initials, displays an error-summary badge reading *1 error*,
disables Save, stays on `/settings/users/new`, and does not create the user.

**R17.** Replacing a rejected Initials value with an unused one clears the *Already in use*
message, re-enables Save, and creates the user on the next submission.

**R18.** While Password has no value, *This field is required* appears beneath Password
together with an error-summary badge reading *1 error*; both clear once Password holds a
value.

**R19.** Leaving Middle Name and all Time Card Defaults (Default Ranch, Default Field,
Default Job) empty still creates the user.

> R16–R18 are the failure paths. R19 is an edge case rather than a failure — it asserts that
> a minimal-field creation succeeds. Genuine rejection behaviour beyond duplicate Initials
> and empty Password is unobserved; see **Not established**.

---

## Test data

R14 makes the recording's literal values (`Jesus Mendoza` / `JM` → `JM1` /
`jmendoza@test.com`) collide on a second run, so Name, Initials and Email are generated per
run by `makeUser()` in `src/utils/testData/userFactory.ts`. Fixed values — the role list,
permission labels, Personal Info values and messages — come from
`src/data/user-setup-data.json`, which already carries all of them.

The Password is masked in every frame of the recording, so its value cannot come from the
source; `defaults.password` in `src/data/user-setup-data.json` is used instead.

Because Initials is a short field, the random space is small and genuine collisions are
expected. Creation regenerates Initials and retries on a `duplicate-initials` outcome (R16),
so an unrelated collision does not fail a test about something else.

## Cleanup

The recording never exercises deletion, and no delete control appears in any frame of the
Users list or the Edit form. Cleanup therefore does not go through the UI: each created user
is removed in `afterEach` via `runSql` (`src/utils/db/sqlClient.ts`), gated by the
`DB_CLEANUP` env switch, and `src/fixtures/global-teardown.ts` sweeps leftovers by
`test_user_prefix` as a backstop.

---

## Not established

These frames do not demonstrate the following. They are **not** requirements — the planner
agent must discover the real behaviour against the running application before any assertion
is written.

| Open question | Why it matters |
|---|---|
| The Password value | Masked in every frame; the recording cannot supply it, so a data-file value stands in |
| The exact trigger of the Password *This field is required* message | It appeared between two forced samples (15.8 s → 20.8 s) with a value already partly typed; whether it fires on blur of another field, on a form-wide validation sweep, or on focus-then-leave is unobserved |
| The maximum length of Initials | Only 2- and 3-character values were entered; whether a 4th character is blocked, truncated, or rejected on save is unobserved |
| Whether Save is disabled before any interaction | The footer Save renders dim at defaults, but no click on it was attempted — "disabled" is inference, not observation |
| Whether Role selection changes the default permission set | *Allow Employee I9 Information Access* was already enabled while Role was still *Clerk*, and stayed enabled after switching to *Administrator*; no role-driven permission change was visible |
| Behaviour on duplicate **Name** or duplicate **Email** | Only the Initials uniqueness path was exercised; R14 is scoped to Initials for that reason |
| Behaviour when **Name** or **Email Address** is empty on save | Never attempted in the recording |
| Behaviour when **Email Address** is malformed | Never attempted; format validation may exist client- or server-side |
| Whether a *Fix errors to save* tooltip exists on the disabled Save | The earlier plan asserts one; no hover over the disabled Save appears in these frames |
| Whether the UI offers any delete action for a user | Never looked for in the recording; the SQL-cleanup design depends on the answer |
| Which control returned to the list at ~80.9 s | The cursor sits beside the footer **Cancel** and the next frame is the list, but the click itself falls between samples. Cancel is the inference; the header **X** is the alternative |

Four negative and edge cases are covered by R16–R19. The remaining coverage comes out of
this table once the live application answers it.

---

## Divergences from the earlier plan

`journey-a1-user-setup.ears.md` states five things these frames do not support. Recorded
here so the difference is visible rather than silently resolved one way or the other.

| Earlier plan | This run |
|---|---|
| Selecting *Administrator* enables *Allow Employee I9 Information Access* | Not supported: I9 was already enabled at the Clerk default (keyframe 9) and unchanged after the switch to Administrator (keyframe 17) |
| Initials is capped at 3 characters | Not observed; moved to **Not established** |
| A *Fix errors to save* tooltip is shown while Save is disabled | Not observed; moved to **Not established** |
| Uniqueness is enforced on Name, Initials **and** Email | Only Initials was demonstrated; R14 is narrowed accordingly |
| The UI provides no delete action | Not something this recording can establish; moved to **Not established** |

Three requirements are new here, from frames the earlier plan did not draw on:
**R4** (the default permission set on a fresh form), **R9** (Name becomes read-only and four
extra sections appear once the user exists) and **R12** (the empty-state text under Crew,
Departments and Job Groups).

> The earlier plan's requirement numbers are deliberately not cited above. Both files number
> from `R1`, and the same number means different things in each — `R14` is "no delete action"
> there and "Initials are unique" here. Cite claims by description, not by number, when
> comparing the two.
