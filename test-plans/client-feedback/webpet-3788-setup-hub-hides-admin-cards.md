# `WEBPET-3788` · Setup hub – a Clerk (neither super user nor Administrator) does not see Alias Field or Mobile Phone Carrier and is not authorized on their pages

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3788 |
| Plan | test-plans/client-feedback/webpet-3788-setup-hub-hides-admin-cards.md |
| Spec | tests/web/client-feedback/setup/webpet-3788-setup-hub-hides-admin-cards.spec.ts |
| Data | src/data/client-feedback/webpet-3788-setup-hub-hides-admin-cards.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3788` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3788`) |
| Journey | none |
| Surface | ui |
| Bucket | A: screen only, no data, no (crew, day) pair |

## Traceability

| Field | Value |
|---|---|
| Gate | `users.manage` (Administrator), web-pet ce9160326 |
| Measured | 2026-11-11 on dev (new shell) as E2ENonSU (Clerk): the Setup hub opens without either card, and both direct routes render "Not authorized" in place |
| TC text | "File > Administration > Setup" does not exist in the new shell; this supersedes the 11-02 classic-shell block |

## Steps

| # | Step | Expected |
|---|---|---|
| 1 | As su: sidebar Setup → Setup hub | Alias Field and Mobile Phone Carrier cards listed (positive control) |
| 2 | Log in as the non-SU Clerk (`loginAsNonSu`, CF_NONSU_USER/PASSWORD, environment-gate) | |
| 3 | Sidebar Setup → Setup hub | Crew, Job, Field cards present; Alias Field and Mobile Phone Carrier cards absent |
| 4 | Type /setup/alias-fields (a Clerk has no card, so the address is the only way) | stays on the route; "Not authorized", the permission sentence, "Back to Dashboard" |
| 5 | Same for /setup/mobile-phone-carriers | same |

## Expected outcomes

- A Clerk's Setup hub offers neither Alias Field nor Mobile Phone Carrier.
- Both pages answer "Not authorized" in place when opened by address.
- Not asserted: the group-heading counts ("Operations · 14" and so on); they drift with every new screen.

## Screens and page objects

| Screen | Page object | Status |
|---|---|---|
| Setup hub | `src/pages/shell/LeftNavigationPage.ts` | adds `openHub` and `notAuthorized` |

## Data

None.

## Preconditions

- [ ] su login from storageState; CF_NONSU_USER / CF_NONSU_PASSWORD set (the Clerk E2ENonSU).

## API allowances

None. No write, and no read beyond the login.

## Cleanup

None. The Clerk's browser context is closed.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3788` | A Clerk (neither super user nor Administrator) does not see Alias Field or Mobile Phone Carrier on the Setup hub and is not authorized on their pages | `regression` | 1 after the first green run |

## Open questions for the tester

None.
