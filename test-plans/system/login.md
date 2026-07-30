# `UI` · Login

Login is **not a catalog workflow**. It is catalog `A1` step 5 ("Verify login"),
but it is the gate every journey starts behind, so it is automated once here
rather than repeated in each journey's spec. That is why its rows carry no
`workflow`/`journey` and its ids use the `UI-00X` prefix in
`src/data/runner/system.csv` instead of `<WF>-00N`.

| Artifact | Path |
|---|---|
| This plan | `test-plans/system/login.md` |
| Spec | `tests/web/system/login-module.spec.ts` |
| Runner rows | `src/data/runner/system.csv` → `UI-001`…`UI-004` |
| Value bag | `src/data/static/system/loginModuleData.ts` |

Every other spec in the suite runs already authenticated, via the shared
`auth-setup` project and `.auth/user.json`. This file is the exception: it
discards stored authentication with `test.use({ storageState: { cookies: [],
origins: [] } })` so each test starts logged out.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `UI-R1` | When valid credentials are submitted, PET Tiger shall authenticate the user and display the authenticated shell (search menu and welcome message). | `UI-001` |
| `UI-R2` | If the submitted credentials are not valid, then PET Tiger shall reject the login, display "Invalid username or password.", and keep the user on the login form. | `UI-002`, `UI-003`, `UI-004` |
| `UI-R3` | If the submitted credentials are not valid, then PET Tiger shall display the same message whether the username, the password, or both are wrong. | `UI-002`, `UI-003`, `UI-004` |

`UI-R3` is a real requirement, not a detail of `UI-R2`: returning a different
message for a bad username than for a bad password would let an attacker
enumerate accounts. It was previously documented only in a JSDoc comment on
`loginModuleData.invalid_credentials_error_message`. It is covered *collectively*
— the three cases each assert the same single constant, so they can only all pass
if the app's message really is identical.

## One requirement, three examples

`UI-002`, `UI-003` and `UI-004` are not three requirements. They are one rule
(`UI-R2`) exercised with three input combinations:

| id | Username | Password |
|---|---|---|
| `UI-002` | valid | wrong |
| `UI-003` | wrong | valid |
| `UI-004` | wrong | wrong |

They stay as three runner rows and three tests rather than collapsing into a
loop, because `runner:check` resolves a spec's claim on a row by matching a
**literal** id in the `testCaseId` annotation (`scripts/runner/lib/runner-data.js` →
`specClaims`). A generated `description: testCase.id` matches nothing, and all
three rows would be reported as "enabled but no spec claims it". The duplication
is removed instead by sharing one assertion helper, `expectLoginRejected`.

If a fourth combination is ever needed, add a row and a three-line test — not a
new requirement.

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Login form | [`src/pages/shell/LoginPage.ts`](../../src/pages/shell/LoginPage.ts) | exists |
| App shell sidebar (post-login assertion) | [`src/pages/shell/LeftNavigationPage.ts`](../../src/pages/shell/LeftNavigationPage.ts) | exists |

## Data

- **Invalid values and the expected error** —
  [`loginModuleData.ts`](../../src/data/static/system/loginModuleData.ts).
- **Valid credentials** — deliberately *not* in the value bag. They come from
  `USER_NAME` / `PASSWORD` per environment (`src/config/envLoader.ts`), so the
  same spec proves login against local, dev and QA without editing.

## Preconditions and cleanup

None. Login creates nothing, so there is nothing to track or remove.

## Test cases

`src/data/runner/system.csv`:

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `UI-001` | Login succeeds with valid credentials | `UI-R1` | `smoke\|high-level\|regression` | 1 |
| `UI-002` | Login fails with an invalid password | `UI-R2`, `UI-R3` | `regression` | 1 |
| `UI-003` | Login fails with an invalid username | `UI-R2`, `UI-R3` | `regression` | 1 |
| `UI-004` | Login fails with invalid username and password | `UI-R2`, `UI-R3` | `regression` | 1 |

`UI-001` holds the file's single `smoke` slot. `UI-002`–`UI-004` were previously
`high-level|regression`; they are negative cases, and negatives stop at
regression — high-level is reserved for a business path through the product.

Unlike the journey-A rows these ship **enabled**: login touches no database and
needs no SQL cleanup, so it runs anywhere `BASE_URL` and the credentials resolve.

## Open questions for the tester

- [ ] Is there an account-lockout rule after N failed attempts? If so it is a
      further `If … then …` requirement, and these three negative cases must not
      be able to trip it on a shared environment.
- [ ] Does the app rate-limit login attempts? Same concern — it would make the
      negative cases order-dependent, which they currently are not.
- [ ] Is there a session-timeout behaviour worth a `While …` requirement, or is
      that owned by Keycloak rather than PET Tiger?
