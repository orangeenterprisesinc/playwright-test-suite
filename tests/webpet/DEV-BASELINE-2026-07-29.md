# Dev-staging baseline — first full run (2026-07-29)

Command: `npm run test:webpet:dev` (workers 1, app.ptdev.xyz, API via
https://api.ptdev.xyz). Report-only baseline per the migration decision — dev's
DB is not the seeded DelLlano and the suite mutates dev data.

## Result

| | dev staging | localhost baseline |
|---|---|---|
| passed | **319** | 362 |
| failed | **47** | 26 |
| skipped | **22** | 18 |
| did not run | **19** (serial-file remainders after an earlier failure in the same file) | 0 |
| duration | 56.5 m | ~47.6 m |

Auth design validated end-to-end on dev: admin login against the API host
captured `__Host-pt_session @ api.ptdev.xyz` + `pt_csrf @ .ptdev.xyz`, and 319
tests ran authenticated. Known setup issue: dev's `POST /api/users` returns
**500**, so RestrictedTest provisioning skipped → data-scoping's restricted
block skips.

## The 47 failures, grouped by likely cause

**Feature/data infrastructure absent on dev (14)** — needs a seeded report /
device mailbox infra:
- `report-editor-wysiwyg.spec.ts` — 11 tests (whole acceptance journey; needs the seeded report)
- `equiv/biometric-device-commands-equivalence.spec.ts` — 3 contract tests (Gather Logs / Request Partial Data / Set Timezone)

**Module licensing / permission differences vs DelLlano (14)**:
- `export-to-accounting.spec.ts` — 6 (incl. the FieldSupervisor-403 and not-licensed-banner paths)
- `export-to-accounting-v2-*.spec.ts` — 4 (exportrun, mobile ×2, row-selection)
- `reconcile-job-cards.spec.ts` — 2 (accounting.export permission presence)
- `billing-center.spec.ts` — 1 (Save-disabled; GrowerBilling gating differs)
- `bonus-shell.spec.ts` — 1 (403-on-/api/bonus/types error path)

**Seed-data shape differences (12)** — dev rows/FKs differ from the DelLlano seed:
- `parent-picker.spec.ts` — 7 (Department/Crop/Ranch pickers expect seeded values)
- `employee.spec.ts` — 1 (renders all expected fields)
- `setup-batch-b-smoke.spec.ts` — 1 (Employee grid FK columns)
- `variety.spec.ts` — 1 (nonexistent-id not-found copy)
- `onboarding-badges.spec.ts` — 1 (cross-contamination guard)
- `data-scoping.spec.ts` — 1 (SU sees non-empty /api/employees)

**API-mutation / page.request class (7)** — predicted dev-failure class
(page.request inherits the SPA host baseURL) plus API-heavy flows:
- `equiv/create-user-amy-sandoval.spec.ts`, `equiv/scan-device-create-de15-pocket-pda.spec.ts`, `equiv/variety-equivalence-cucumbers-european.spec.ts` — 3
- `timesheet_validation.spec.ts` — 1 (soft-delete/restore via API)
- `notifications.spec.ts` — 1 (logout toast; page.request sign-in)
- `ranch.spec.ts` — 1 (WorkerCompCode inline edit + undo)
- `time-in.spec.ts` — 1 (multi-edit Ranch persist)

The 19 "did not run" are trailing tests of `describe.configure({mode:'serial'})`
files (ranch / report-editor / setup-batch-b …) whose earlier test failed.

## Next actions

1. Triage each group; for tests that can never pass on dev, set
   `enabled=false` with a `notes` reason in
   `src/data/webpet/webpetRunnerManager.csv` (then `--mirror`), so scheduled
   dev runs go green-by-baseline.
2. Re-check `POST /api/users` 500 on dev (blocks RestrictedTest provisioning —
   also the same class of bug as the existing framework's user-creation specs).
3. This file is the comparison point for the nightly `e2e.yml` `suite: webpet` runs.
