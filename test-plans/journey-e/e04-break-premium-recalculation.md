# `E4` · Break-premium recalculation

## Status: not showable on dev (su) without a tenant-wide preference write

**Revision 1, 2026-10-26.** Feasibility verdict, no spec. Jira `WEBPET-2060` (passed QA 2026-09-23) · automation ticket `PET-12670`. Catalog entry `workflow-catalog.json` → `E4` (line 1370). Runner row `journey-e.csv:5` stays `draft`, `enabled 0`; only `jira` → `PET-12670` is filled.

**Catalog summary:** recompute paid-break pay as the weekly average rate moves through the week. On each day's calculation, revisit the week's prior paid breaks, re-price them at the updated weekly average and iterate until totals stabilise.

## Why it cannot run under the constraint

- **A paid break becomes a job card only when `paidBreakJob` is set.** D10 measured this live on 2026-10-05 on su: with `paidBreakJob` null, a crew time-in onto a break job "is an ordinary job change … No break card, no auto-return". With it set, the same day yields the break card. There is nothing to re-price without that card.
- **Missing setting:** `paidBreakJob` (Preferences ▸ Job ▸ Job Assignments ▸ **Paid Break Job**), tenant-wide, null on dev. `zeroTimeBreakJob`, `paidBreakOffClockJob` and `paidBreakPenaltyRule` are null too.
- Input ▸ Meal or Break / Input ▸ Crew Break require start **and** end (D10). How such a record transfers with `paidBreakJob` null is unmeasured, and no app source is available to settle it.
- **Concurrency:** D10 already writes `paidBreakJob` on screen and clears it with `PUT {paidBreakJob: 0}` first in its teardown. An E4 designation running alongside D10 would be overwritten mid-transfer, in either direction.
- The pricing side is already in place: `payIdleTimeAsAverage = "WeeklyAll"` (employer), and departments carry "Pay Idle-Time as Average". Once a break card exists, the weekly-average re-price is reachable. The single blocker is the break card.

## Ways to unblock (human decision)

1. **Approve one on-screen `paidBreakJob` write** following the D10 precedent, under a new cross-spec lock (`withPaidBreakJobLock`, lockfile like `withPreferencesLock`) held from designation to transfer to restore. D10 adopts the same lock. Restore stays the first teardown step.
2. **A dedicated tenant** where Paid Break Job is permanently set (dev is multi-tenant; client 3 has no relay registration, so it would need provisioning).
3. **A 10-minute read-only probe, no save:**
   - Job form ▸ Payment Type option list: does a break-type payment exist?
   - The non-committing `transfer-to-job-cards/job-cards-preview` for an E4-owned crew day carrying an Input ▸ Crew Break record, with `paidBreakJob` null.
   If either yields a break job card, E4 becomes showable with no preference write and gets a full plan.

## Manual case outline (until automated)

Preconditions: Paid Break Job designated; employer Pay Idle-Time as Average = WeeklyAll; one employee on two Time jobs, $20 and $35, AG CA 2022.

1. Mon 06:00–14:00 on the $20 job with a paid 10-min break at 10:00. Transfer Mon. Expect the break card priced at 20.00/h (weekly average 20).
2. Tue 06:00–14:00 on the $35 job with a paid 10-min break. Transfer **Tue only**. Expect Tue's break priced at the new weekly average (27.50/h over 16 h), **and Mon's break re-priced to 27.50/h**. Week totals change by Mon's re-price.
3. Re-run the transfer or recalculate with no change. Expect no further movement: totals have converged.
4. Failure signature from QA (Hilario, 09-15): the break job rate stays at a fixed rate (e.g. 16.90) instead of the weekly average.
