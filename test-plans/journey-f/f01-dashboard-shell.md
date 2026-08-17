# F1 · Real-time productivity dashboard

The dashboard shell — the route, its default board, the widget palette, and
whether a board survives a reload.

| | |
|---|---|
| Workflow | `F1` — Real-time productivity dashboard |
| Journey | F — Analysis |
| Modules | Real Time Dashboard, Real Time |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-f.csv`, `F1-001`…`F1-006` |

`F1-001` remains a `draft`, `enabled=0` row describing a report-backed live board.
`F1-002`…`F1-006` were relocated from `tests/webpet/dashboard.spec.ts`
(WP-0126…WP-0130).

## Why F1 owns these rows and B14 takes cross-credit

`dashboard.spec.ts` was claimed by **both** `F1` and `B14` (Real-time field
dashboard) in the coverage map, whose notes described identical coverage. A
journey row carries exactly one `workflow`, so one had to own them.

F1 owns them because **nothing these tests assert is field-specific**: route
bootstrap, the greeting and Edit Widgets header, the palette toggle, appending a
widget, and persistence across a reload. There is no crew, field, job or in-field
datum anywhere. That is the analysis-home shell, not the in-field workday.

The segments column settles it independently. `F1-001` is `all`, which is true of
the shell — every tenant has a dashboard. `B14-001` is `grower|perennial-grower`,
which would have falsely scoped tenant-agnostic assertions to two segments.

B14's credit is recorded as a note on its coverage-map entry, the same mechanism
D7 uses for the multi-edit half and A13 for employee documents. `B14-001` stays
reserved for the genuinely field-flavoured, report-backed board.

## Why the coverage depth stays `partial`

This is the shell and nothing else. **No widget is ever backed by a report**, no
refresh interval is exercised, and no output, speed or cost figure is asserted —
which is the entire substance of a *productivity* dashboard. `F1-001` reserves it,
and it is blocked on F7 report execution, which is itself barely automated.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `F1-R1` | When a user with no persisted boards opens the dashboard route, PET Tiger shall provision a default board and paint at least one widget cell on the canvas. | `F1-002` |
| `F1-R2` | While the dashboard is displayed, PET Tiger shall render a time-of-day greeting and an Edit Widgets control. | `F1-003` |
| `F1-R3` | When the user activates Edit Widgets, PET Tiger shall open the widget palette; when the user finishes, PET Tiger shall hide the palette items. | `F1-004` |
| `F1-R4` | When the user activates a palette item's add control, PET Tiger shall append that widget to the active board. | `F1-005` |
| `F1-R5` | When the page is fully reloaded after a widget is added, PET Tiger shall rehydrate the board from the server-backed store with the same widget count. | `F1-006` |

`F1-R6` onward is reserved for the unautomated `F1-001` journey.

All five are proven — this file has no quarantined rows.

### One caveat on `F1-R1`

`clearStoredBoards` predates the server-backed board store, so what `F1-002`
actually proves is *"the route renders a populated board"* rather than strictly
*"it auto-provisions one for a user who has none"*. The distinction only matters
if the seeding behaviour regresses while an existing board masks it.

It is recorded rather than repaired: tightening it means changing what the
assertion proves, which belongs to the edge-case phase after this consolidation
lands, not to a relocation batch.

## Locale sensitivity

`F1-003` asserts a time-of-day greeting and an Edit Widgets control by their
English copy. `base.fixture` does **not** pin `pt.locale`, unlike the web-pet
fixture these specs came from.

That is acceptable because both are *positive* assertions — under a non-English
session they fail loudly rather than passing vacuously. If one ever reds for that
reason the fix is a locale-neutral locator, never deleting the assertion.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Dashboard | `/dashboard` | `src/pages/analysis/DashboardPage.ts` |

Moved out of `src/pages/webpet/shell/` in this batch — this spec was its last
web-pet consumer. It extends `BasePage` directly, so it lands under `analysis/`
beside the report editor rather than staying near the web-pet shell.

## Parallelism

No `mode: 'serial'`, and none should be added. `F1-005` and `F1-006` both mutate
the active board, but each provisions its own state and reads back only what it
wrote.

## Data

Boards are server-backed. `F1-006` adds a widget and reloads the page to prove
the store rehydrates it, so it leaves a widget behind on the run user's board —
harmless, and the same behaviour the source had.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The Real Time Dashboard module licensed for the run user.

## Test cases

| ids | Group |
|---|---|
| `F1-002` | route and bootstrap |
| `F1-003`, `F1-004`, `F1-005` | header and widget palette |
| `F1-006` | persistence across reload |

`F1-002` is the file's single `@Smoke` — the truest bootstrap check. The source
also marked `F1-003` smoke; it demotes to `@HighLevel` under the
one-`@Smoke`-per-file rule.

No row here carries `demo=1`. `F1-001` keeps it as the draft, marking the
workflow demo-worthy; adding a relocated test to the demo lane would change what
a demo run shows, which is outside a relocation's remit.

## Open questions for the tester

- [ ] `F1-001` needs a report-backed widget with live data to reach `journey`
      depth. It is blocked on F7 report execution, which has one live test.
- [ ] Should `F1-002` be tightened to prove auto-provisioning specifically? See
      the caveat above.
- [ ] No refresh interval is exercised anywhere.
