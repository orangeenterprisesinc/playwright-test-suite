# Journey A1 — User Setup

**Module:** Administration ▸ Users (`/settings/users`)
**Spec:** `tests/ui/user-setup.spec.ts`
**Source:** `Testing video/Journey A1 User Setup (1).mp4` — 92.7 s, 1920×1080, recorded 2026‑07‑20 against `192.168.1.74`

## How the steps were derived

The repo annotator (`tools/video-annotator/`) is not bootstrapped on this machine
(no `.venv/`, no `weights/icon_detect.pt`, and only Python 3.14 is installed —
outside the 3.11/3.12 the detector needs), so the recording was read directly
instead of through YOLO [historical note: that detector has since been removed
entirely; the current annotator (`tools/video-annotator/annotate_video.py`) is
OpenCV frame-diff only, with no model weights or Python-version constraint]:

- Playwright's bundled ffmpeg is a webm-only build with no H.264 decoder, so it
  cannot open this MP4. Frames were decoded by driving real Chrome — the video
  served over HTTP with Range support, seeked, and drawn to a canvas.
- The same frame-diff scene detection the annotator uses (coarse grayscale
  signature, `action` + `settled` pairs) picked 18 change points; gaps where
  only a few pixels move (typing) were then sampled explicitly.

Because the frames were read as images, control *labels* are known directly and
no bounding-box → element inference was needed. No coordinates appear in the
spec.

## Preconditions

- Logged in as an administrator. Browser projects load `.auth/user.json`, so the
  recording's opening login is not re-implemented.
- The Users list has at least one existing user (for the duplicate-Initials
  check the spec creates its own, rather than depending on seeded data).

## Recorded steps

| Time | Step |
|---|---|
| 0–4.6 s | Users list open at `/settings/users` via **File ▸ Administration ▸ Users**. Grid columns Name / Initials / Role / Email / Active; footer reads **Total 33 rows**. |
| 4.6 s | Click **New User** → `/settings/users/new`. Form defaults: Role **Clerk**, Language `__none__`, Active on, Access to Reverse **User**. |
| 11–16 s | Fill **Name** = `Jesus Mendoza`. Password briefly left empty → *"This field is required"*, `1 error` badge. |
| 16–22 s | Fill **Password**. |
| 23.0 s | Open the **Role** dropdown — 17 options: Clerk, Administrator, Field Supervisor, Field Man, Time Card Clerk, Manager, Scan Screens Only, Report Viewer, Report Viewer Limited, Input Clerk, Crew Supervisor, Employee Setup Clerk, Analyst, Crew Reviewer, Warehouse Supervisor, Shortcuts Only, Device Administrator. Select **Administrator**. |
| 30–37 s | Fill **Initials** = `JM`, **Email Address** = `jmendoza@test.com`. |
| 40–43 s | Permissions ▸ Additional Access: check **View Confidential Data**, **View SSN**, **Can Modify Locked Job Cards** (each shows the orange "changed" dot; *Allow Employee I9 Information Access* was already on as a Role default). |
| 43 s | Time Card Defaults left unset (Select Ranch / Field / Job). |
| 55–62 s | Personal Info: **First Name** `Jesus`, **Last Name** `Mendoza`, **Title** `HR Manager`. Middle Name left empty. |
| 63.5 s | Click **Save** → button shows *Saving…* |
| 63.8–67 s | Rejected: **"Already in use"** under Initials, `1 error ▼` badge, Save disabled, hover tooltip *"Fix errors to save"*. `JM` was already held by the existing user *Jesus*. |
| 70.4 s | Scroll back to General, change **Initials** to `JM1` → error clears, Save enables. |
| 72–76 s | Click **Save** → `/settings/users/34`, header **"Edit User: Jesus Mendoza"**, toast **"User created"**. |
| 81 s | Users list again: row **Jesus Mendoza / JM1 / Administrator / jmendoza@test.com / Yes**; footer **Total 34 rows**. |
| 87–92 s | Re-open the created user's Edit page; the three Additional Access boxes and Access to Reverse **User** persisted; Crew shows *"No crews assigned."* |

Note that the duplicate-Initials check is **server-side on save**, not on blur —
at 37 s the Initials field held `JM` and had already been blurred with no error.
Any test for it must click Save.

## Scenarios

1. **All fields populated** (the recording) — create a user with Name, Password,
   Role *Administrator*, Initials, Email, the three Additional Access
   permissions and all Personal Info fields; assert the *User created* toast,
   that the grid total grows by one, and that the row shows the entered
   Initials / Role / Email and Active *Yes*.
2. **Required fields only** — Name, Password, Role, Initials, Email only;
   assert the user is created and appears in the list.
3. **All 17 Role options** — open the Role dropdown and assert exactly the 17
   recorded options, in order; then create a user with a non-administrator role
   (*Report Viewer*) and confirm the grid shows that role.
4. **Duplicate Initials rejected** — create a user, then attempt a second user
   with the same Initials; assert *"Already in use"*, the error-summary badge, a
   disabled Save, and that the second user never reaches the list.

## Test data

`src/data/user-setup-data.json` (roles, defaults, personal info, permissions,
messages). Name / Initials / Email are generated per run by
`src/utils/testData/userFactory.ts` so repeated runs do not collide — PET Tiger
enforces uniqueness on all three.

## Deliberate deviations from the recording

- **Middle Name is filled.** The recording left it blank; scenario 1 is
  specified as "all fields populated", so it is set from the data file.
- **Access to Reverse is left at its default.** The recording never changed it
  (`User` for the Administrator role), so the spec does not either.
- **Language and Time Card Defaults are left at their defaults**, as recorded.
- **Fixed values are not reused.** `Jesus Mendoza` / `JM` / `jmendoza@test.com`
  would collide on a second run, so the factory generates them.

## Cleanup

PET Tiger has no delete-user action in the UI, so each created user is removed
in `afterEach` by setting `Deleted = 1` in both the client and master databases
via `src/utils/db/sqlClient.ts` (gated by `DB_CLEANUP`; a no-op where SQL is
unreachable). This frees the Name / Initials / Email for the next run.
