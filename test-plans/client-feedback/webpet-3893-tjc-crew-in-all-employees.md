# `WEBPET-3893` · Transfer to Job Cards – Crew In with Crew = ALL EMPLOYEES lists every timed-in employee, all ticked, and saves

| Artifact | Path |
|---|---|
| Ticket | WEBPET-3893 |
| Plan | test-plans/client-feedback/webpet-3893-tjc-crew-in-all-employees.md |
| Spec | tests/web/client-feedback/transfer-to-job-cards/webpet-3893-tjc-crew-in-all-employees.spec.ts |
| Data | src/data/client-feedback/webpet-3893-tjc-crew-in-all-employees.json |
| Runner row | src/data/runner/client-feedback.csv → `WEBPET-3893` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | none (client-feedback ticket `WEBPET-3893`) |
| Journey | none |
| Surface | ui |
| Bucket | B: own data + one tenant preference (set and restored on screen) |

## Traceability

| Field | Value |
|---|---|
| Sign-off | Amy 2026-10-27 (client 3, new shell): footer Employees 46, Crew In ALL EMPLOYEES 08:30, "Created 46 Time-In records.", no "employeeIds: Select at least 1" |
| Rule | ALL EMPLOYEES = the crew named by Preferences ▸ Defaults ▸ "Crew of All the Employees Currently on the Job" (`crewEmpCurrentOnJob`). The roster lists every employee with an open Time In on the day, on any crew, limited to the analyzed grid's employees (web-pet crew_time_in.go: allEmployees + limitEmployeeIds) |

## Steps

| # | Step | Expected |
|---|---|---|
| 0 | Arrange: `prepareCfRun` (A@-20 + extra D@-20), `ensureCfAllEmployeesCrew` (CF ALL EMPLOYEES, no members), `seedCrewDay` x2: 07:00 Time In on CF JOB for A ONE/TWO and D ONE/TWO, no Time Out | 4 open Time Ins |
| 1 | Preferences ▸ Defaults: set "Crew of All the Employees Currently on the Job" to CF ALL EMPLOYEES, Save (under the preferences lock) | fresh load shows CF ALL EMPLOYEES |
| 2 | Transfer to Job Cards from the menu; the day; Time Card Crew = CF CREW A + CF CREW D; Analyze | footer Employees 4 |
| 3 | New record ▸ Crew In: 08:30, Use Employee Crew and Based on Later unticked, Crew = CF ALL EMPLOYEES | "4 of 4 selected"; the 4 labels listed and ticked; "Deselect All" shown; not "No employees found for this crew." |
| 4 | Save | "Created 4 Time-In records."; no "Select at least 1"; 4 own Time Ins recorded |
| 5 | Preferences ▸ Defaults back to "— None —", Save | fresh load shows "— None —" |

## Expected outcomes

- With the preference naming a crew, Crew In with that crew lists every employee timed in on the analyzed grid (two home crews), all ticked, with Deselect All, and Save creates one Time In each.
- Not asserted: tenant-wide size (Amy's 46); the roster is limited to the grid. The Crew Counter stamped on the new Time Ins is recorded as evidence only.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Preferences | Admin ▸ Preferences | `src/pages/admin/PreferencesPage.ts` | adds section `'Defaults'` |
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | adds `crewInToggleAll(label)` |

## Data

CF CREW A, CF CREW D (+ their ONE/TWO), CF JOB, CF RANCH/FIELD, new fixture crew CF ALL EMPLOYEES (9061). Pairs A@-20, D@-20.

## Preconditions

- [ ] su login; `maximumDaysForTransferExport` ≥ 20.
- [ ] `crewEmpCurrentOnJob` reads unset (or CF ALL EMPLOYEES residue); any other crew fails by name, never overwritten.

## API allowances

| Allowance | Use |
|---|---|
| arrange | CF fixture rows incl. CF ALL EMPLOYEES via ensureOnScreen, when missing |
| plumbing read | GET preferences (save landed), GET time-cards (own ids after seed and after the status dialog). Proof is on screen |
| cleanup | before-phase sweep, by-id teardown; kill-safety `PUT preferences {crewEmpCurrentOnJob: 0}` only if the on-screen restore did not run |

## Cleanup

On-screen restore of the preference (step 5); teardown: preference safety PUT if still set, own time cards by id, A/D day sweeps.

## Test case

| id | Title | Tags | enabled |
|---|---|---|---|
| `WEBPET-3893` | Crew In with Crew = ALL EMPLOYEES lists every timed-in employee, all ticked, and saves | `regression` | 1 after the first green run |

## Open questions for the tester

None.
