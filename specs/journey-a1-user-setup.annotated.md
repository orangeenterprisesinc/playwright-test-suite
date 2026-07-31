# Journey A1 — User Setup (annotator-derived)

**Module:** Administration ▸ Users (`/settings/users`)
**Source:** `Testing video/Journey A1 User Setup (1).mp4` — 92.7 s, 1920×1080, 15 fps, 1390 frames
**Annotations:** `.video-annotations/journey-a1/` — 56 keyframes (28 action + 28 settled), 6247 detections

Companion to `journey-a1-user-setup.md`, which was derived by reading the video
manually. This one is derived from the annotator pipeline. Kept separate so the
two can be compared.

## Provenance and its limits

Produced by:

```
npm run video:annotate -- --input "Testing video/Journey A1 User Setup (1).mp4" \
    --scene-threshold 0.006 --min-gap-ms 900 --max-gap-ms 5000 --max-frames 60
```

Then reading `annotations.json` plus the annotated PNGs.

**Not a clean-room derivation.** The hand-written plan was read earlier in the
same session, so prior knowledge cannot be fully excluded. Steps below are
marked ✅ where a frame was actually opened and the content read off the screen,
and ○ where only the change timeline and detection counts were available. Treat
the ○ rows as weaker evidence.

**Detector caveats.** Cursor matching is off — the synthetic templates
false-positived on 100% of frames. Targeting comes from `change_region`. The
detector boxes browser chrome and the Windows taskbar alongside the app, ~110
boxes per frame, median confidence 0.50. Boxes localise; the image carries the
meaning. No coordinate belongs in a spec.

## Recorded steps

| Time | Ev | Step |
|---|---|---|
| 0.4 s | ✅ | **Dashboard** at `/dashboard` ("Good morning, Su"). Click **File** in the left sidebar. |
| 2.2 s | ○ | Sidebar expands toward **Administration**. |
| 4.6 s | ✅ | **Users** clicked → `/settings/users`. Grid columns Name / Initials / Role / Email / Active plus a per-row edit icon; filter row with text filters and All dropdowns for Role and Active; **New User** and **Report** buttons top-right. Footer **Total 33 rows**. An existing user **`Jesus` / `JM` / Administrator** is visible in the grid. |
| 9.6–10.8 s | ○ | **New User** form opens at `/settings/users/new`. |
| 15.8–20.8 s | ○ | **Name** and **Password** filled. Only surfaced by forced sampling — typing does not cross the change threshold. |
| 22.9 s | ✅ | **Role** dropdown opened. 17 options: Clerk, Administrator, Field Supervisor, Field Man, Time Card Clerk, Manager, Scan Screens Only, Report Viewer, Report Viewer Limited, Input Clerk, Crew Supervisor, Employee Setup Clerk, Analyst, Crew Reviewer, Warehouse Supervisor, Shortcuts Only, Device Administrator. Defaults visible before selection: Role **Clerk**, Language `__none__`, Access to Reverse **User**, Employee Access **Undefined**. |
| 27.9–37.9 s | ○ | **Initials** and **Email Address** filled. |
| 42.9 s | ○ | Permissions section — Additional Access checkboxes toggled. |
| 47.9–62.9 s | ✅ | **Personal Info**: First Name `Jesus`, Last Name `Mendoza`, **Middle Name left empty**, Title focused and still empty at 57.9 s. Same frame confirms Additional Access: **View Confidential Data**, **View SSN**, **Can Modify Locked Job Cards** checked (orange "changed" dots), **Allow Employee I9 Information Access** already on as a role default. **Access to Reverse** left at **User**. Time Card Defaults left unset (Select Ranch / Field / Job). Entirely invisible without `--max-gap-ms`. |
| 63.8 s | ○ | **Save** clicked. |
| 66.0 s | ✅ | **Rejected.** Orange **`1 error ▼`** badge in the footer, **Save disabled**, "Unsaved changes" still shown. The error text sits in General, scrolled out of view — the annotator cannot see it from this frame. |
| 70.4 s | ○ | Scrolled back to General; **Initials** amended. |
| 73.6 s | ○ | **Save** succeeds — large layout change (89% of screen). |
| 75.9–77.7 s | ○ | Post-save settle. |
| 80.9 s | ○ | Back on the **Users list** — 77% layout change consistent with a grid reload. |
| 85.9–90.8 s | ○ | Created user's **Edit** page re-opened; persisted values reviewed. |

### What the annotator could not establish

- **The rejection reason.** At 66.0 s only `1 error` and a disabled Save are
  visible; "Already in use" is off-screen. That the failure is *duplicate
  Initials* is inferable from the pre-existing `Jesus`/`JM` row at 4.6 s, but
  it is inference, not observation.
- **Exact typed values** for Name, Password, Initials and Email — the frames
  covering them were not opened, and Password is masked regardless.
- **The corrected Initials value** at 70.4 s.
- **Final row contents and the new total** at 80.9 s.

## Preconditions

- Logged in as an administrator. Browser projects load `.auth/user.json`, so the
  recording's opening state is reached directly; no login is re-implemented.
- Users list non-empty (33 rows in the recording).

## Scenarios

1. **All fields populated** — create a user with Name, Password, Role
   *Administrator*, Initials, Email, the three Additional Access permissions and
   Personal Info (First / Last / Title; Middle Name empty, as recorded); assert
   the success toast and that the row appears with the entered Initials, Role
   and Email.
2. **Required fields only** — Name, Password, Role, Initials, Email; assert
   creation and listing.
3. **All 17 Role options** — open the Role dropdown and assert exactly the 17
   recorded options; create with a non-administrator role.
4. **Duplicate Initials rejected** — create a user, then attempt a second with
   the same Initials; assert the error badge, disabled Save, and that the second
   user never reaches the list. Create the Initials owner in-test rather than
   depending on the recording's seeded `Jesus`/`JM`.

## Test data

`src/data/user-setup-data.json`. Name / Initials / Email generated per run by
`src/utils/testData/userFactory.ts` — PET Tiger enforces uniqueness on all
three, so the recording's literal `Jesus Mendoza` / `JM` / `jmendoza@test.com`
would collide on a second run.

Initials are capped at 3 characters, so random values *will* eventually
collide — `createUser` must regenerate and retry on a `duplicate-initials`
outcome.

## Cleanup

No delete-user action exists in the UI and PET Tiger soft-deletes, so each
created user is removed in `afterEach` via `runSql` (`src/utils/db/sqlClient.ts`),
gated by `DB_CLEANUP`. `src/fixtures/global-teardown.ts` sweeps leftovers by the
`test_user_prefix` as a backstop.
