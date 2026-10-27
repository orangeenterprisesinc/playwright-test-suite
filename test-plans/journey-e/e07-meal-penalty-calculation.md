# `E7` · Meal-penalty calculation

## Status: blocked by product (WEBPET-3850) — verdict only, no spec

**Revision 1, 2026-10-27.** Feasibility verdict, no spec. Jira `WEBPET-2063` (**BLOCKED** since 2026-10-20 on `WEBPET-3850`; three FAILED QA rounds before that: 2782, 2849, 3850) · automation ticket `PET-12672`. Catalog entry `workflow-catalog.json` → `E7`. Runner row `journey-e.csv:8` stays `draft`, `enabled 0`; only `jira` → `PET-12672` is filled.

**Catalog summary:** detect short, late or missed meals against the California thresholds and add a one-hour penalty on a Non Labor penalty job, honouring waivers. The penalty job carries its own earning code so it exports cleanly.

## Scope decision (2026-10-27, orchestrator — for Gukan to confirm)

Not automated until `WEBPET-3850` ships. The workflow's one on-screen proof is the penalty card itself — **one hour at the employee's rate** — and that is exactly what dev gets wrong today: the web card reads 0 hours, Rate Source *Job* instead of *Employee* (QA, 2026-10-15, crew 164 on Sycamore). The Done-ticket rule does not apply: E7 never passed QA. A spec written now would be red by product on its first assertion, so it waits like E6 and E11.

## What dev has (read-only probe as su, 2026-10-27)

- Penalty rules: `1 California Meal Penalty Rule` → job 8 `CA Meal Penalty` (payment type 15, rate 5, earning code `MP`, net-hour steps 5.01/10.01/15.01/20/25); `14 Meal Penalty Rule` (net ≥ 5 h) → job 974 `Meal Penalty` (payment type 8, rate 5, no code), attached to `B8 TEST DEPT`; `2 California Break Penalty Rule` (no penalty job — the "Moonlight" configuration, a choice, not a defect per WEBPET-2063); `13 Ghe`.
- Employer `mealPenaltyRule` and `paidBreakPenaltyRule` are null, so the engine reaches a rule **only through a department** (`mealPenaltyRuleCounter`). WEBPET-2063's investigation: generation needs a rule that resolves to a live Penalty Job; web-pet PR #1088 only made the Transfer totals bar say which state the deployment is in.
- Screens: Setup ▸ **Penalty Rules** `/setup/penalty-rules` (+ `/new`): Name, Penalty Job (job combobox filtered by payment type), Required Net Hours for Break (list), Active, Comment. No page object. The Department form renders Meal Penalty Rule / Paid Break Penalty Rule comboboxes; `DepartmentPage.ts` has only Name and Weekly Overtime Method. `JobPage.ts` knows the Time and Piece payment types only; a penalty job is a Non-Labor type (enum value unmeasured; jobs 8 and 974 use 15 and 8).
- Meal prefs on su: `employeeMealStart 4`, `employeeMealTime 0.5`, `employeeMinNetForMeal 5`, `checkMinimumAutoMealLength false`, `mealJob null`. They deducted nothing on E2's 13-hour day; E2 CREW takes no meal.
- WEBPET-3850 is labelled `[D7]` by QA; catalog D7 is Multi-edit — unrelated. The penalty engine has no other catalog owner.

## Plan when unblocked (E13's own-rule / own-department pattern)

1. **Fixture rows, on screen, reused across runs:** `E7 PENALTY JOB` (Non-Labor type, Earning Code set, hourly rate — measure whether the card prices from the job or the employee once 3850 is fixed; the ticket expects Rate Source *Employee*, so `E7 PICKER ONE` may need an hourly rate on the Employee form), `E7 MEAL RULE` (Required Net Hours 5, Penalty Job = `E7 PENALTY JOB`), `E7 DEPARTMENT` with Meal Penalty Rule = `E7 MEAL RULE`, `E7 CREW` + `E7 PICKER ONE` on that department, `E7 JOB` (Time, AG CA 2022).
2. **Day:** crew time-in 06:00 on `E7 JOB`, crew time-out 12:15 — 6.25 h gross, no meal, so the first meal is *missing* past the fifth net hour. One arm only (the happy path); short/late meals, the second meal, both waivers and the paid-break rule are manual cases.
3. **Transfer:** Job Cards preview lists the work card **and** a penalty card (Job `E7 PENALTY JOB`, Gross/Net **1**, Amount = 1 × rate); the totals bar shows no "no penalty rule" notice. Commit, then View ▸ Job Cards (crew-scoped) shows both cards; the penalty card's calculation description names the reason (Edit Job Card form — measure; otherwise an `api-only-evidence` row).
4. **Named contrasts:** a 0-hour penalty card (3850), no penalty card at all (2849), the "no penalty rule configured" notice (misconfiguration).
5. **Cleanup:** penalty cards are job cards — record their ids from the screen (`recordOwnJobCardIds` pattern) and delete them with the day's cards before the time cards; the crew-scoped sweeps cover residue.

## Re-check trigger

`WEBPET-3850` Done and a QA re-test comment on `WEBPET-2063`. Then: Planner (E13 plan as the sibling), new `PenaltyRulePage` + `ensurePenaltyRuleOnScreen`, Department and Job page-object additions, manual cases `docs/test-cases/WEBPET-2063-E7-meal-penalty.csv` for the deferred arms.
