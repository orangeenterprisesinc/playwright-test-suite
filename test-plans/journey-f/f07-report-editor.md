# F7 · Report generation and export

The WYSIWYG report editor — opening a report, editing its layout, and seeing the
change in the preview.

| | |
|---|---|
| Workflow | `F7` — Report generation and export |
| Journey | F — Analysis |
| Module | Windows |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-f.csv`, `F7-001`…`F7-014` |

`F7-001` remains a `draft`, `enabled=0` row describing running a report with
parameters and exporting it. `F7-002`…`F7-014` were relocated from
`tests/webpet/report-editor-wysiwyg.spec.ts` (WP-0308…WP-0320).

## One of thirteen tests actually runs

**`F7-009` is the only live row. The other twelve are `enabled=0` and assert
nothing.** Read that before trusting any coverage number on this workflow.

The app rebuilt the report editor: a sandboxed iframe became an inline
`ReportCanvas` (web-pet `bfe869b10`), and marker overlays plus the inspector
index became popovers (`bb9065e1e`). Twelve specs still assert the old structure,
so each carries `test.fixme(true, STALE_EDITOR)` as its first statement, with two
citing their own causes — `F7-013` (widgets were deliberately hidden from the
editor flow, web-pet `219d5ac83`) and `F7-014` (the WYSIWYG canvas was never
built; it is the WEBPET-732…740 sign-off stub).

### Why the rows became `enabled=0` during relocation

In web-pet all thirteen rows were `enabled=1, status=automated`, and
`scripts/catalog/traceability.js` counts a row as coverage when
`status === 'automated' && String(r.enabled) === '1'`.

So the matrix credited F7 with **thirteen automated rows while one test asserted
anything**. That is the same false-coverage class the staleness guard was added
to prevent in batch 6 — reached by a different route, because the guard reads
runner rows and cannot see a `test.fixme` inside a spec body.

Disabling the twelve is what makes the data layer tell the truth. It is a
deliberate change from the web-pet state, and the only one in this batch.

### Why the `test.fixme` statements were kept anyway

An `enabled=0` gate skip fires before the body, so the fixme reason will not
appear in a routine run report. They are preserved regardless, for two reasons.

They are the source's own first statements, and a relocation changes fixture,
ids and tags — not bodies. More practically: Playwright's default `actionTimeout`
is `0`, so if a future bulk CSV edit or sync mishap flipped these rows back to
`enabled=1`, twelve tests would hang to the full test timeout against locators
that can never resolve, and the run would read as a dev regression. The fixme
turns that into twelve named skips. The reason also resurfaces automatically the
moment a row is legitimately re-enabled during the rewrite.

`test.fixme` was kept rather than converted to `test.skip(true, …)`. §6 bans only
the title-hiding `test.skip('title', …)` form. Semantically fixme means *this test
needs fixing*, which is exactly the situation; `test.skip(true, …)` is this repo's
idiom for an environment or licensing gate, which this is not.

## Acceptance criteria (EARS)

| id | Requirement | Cases | |
|---|---|---|---|
| `F7-R1` | When a user opens the editor for a registered report, PET Tiger shall display the edit heading naming that report and render a live preview. | `F7-002` | **unproven** |
| `F7-R2` | When the user clicks an editable area in the preview, PET Tiger shall reflect the selection in the host UI. | `F7-003` | **unproven** |
| `F7-R3` | When the user activates an area marker, PET Tiger shall open that area's editor and support drill-in and back navigation from the index. | `F7-004` | **unproven** |
| `F7-R4` | When the user edits the Company Name branding field, PET Tiger shall re-render the preview with the new value as an unsaved draft. | `F7-005` | **unproven** |
| `F7-R5` | When the user opens the Table area editor, PET Tiger shall expose its tabbed sections. | `F7-006` | **unproven** |
| `F7-R6` | When the user drags a preview column header onto a neighbour, PET Tiger shall reorder the report columns accordingly. | `F7-007` | **unproven** |
| `F7-R7` | While the preview is displayed, PET Tiger shall label each main section with its region name. | `F7-008` | **unproven** |
| `F7-R8` | When the user zooms in, PET Tiger shall enlarge the preview sheet, and when the user resets zoom, PET Tiger shall restore the auto-fit size. | `F7-009` | |
| `F7-R9` | PET Tiger shall expose each preview area marker's region name as an accessible label. | `F7-010` | **unproven** |
| `F7-R10` | While a draft re-render is in flight, PET Tiger shall keep the preview sheet mounted. | `F7-011` | **unproven** |
| `F7-R11` | When the user switches page orientation to landscape, PET Tiger shall render the preview sheet wider than tall. | `F7-012` | **unproven** |
| `F7-R12` | PET Tiger shall make the widgets and filter-summary areas reachable from the section index. | `F7-013` | **unproven, and possibly retired** |
| `F7-R13` | When the user completes the hover-to-marker-to-sheet edit journey and saves, PET Tiger shall reflect the edits in both the preview and the printed PDF. | `F7-014` | **unproven, never implemented** |

`F7-R14` onward is reserved for the unautomated `F7-001` journey.

`F7-R12` may no longer have a subject: widgets were removed from the editor flow
on purpose. The rewrite has to decide whether the requirement survives, which is
why it is recorded rather than quietly dropped.

## Why the depth stays `partial`

Editing a report layout is not running a report. No parameters are supplied and
there is no screen, printer, file or Excel output anywhere — that is the
workflow's substance and `F7-001` reserves it.

`partial` is the floor above `none`, and the traceability guard sees exactly one
enabled row, so the depth is honest. It rests entirely on `F7-R8`.

## The smoke tag moved

The source's `@wp-smoke` sat on `WP-0308`, now `F7-002`, which is fixme'd. A test
that asserts nothing must not hold a file's only `@Smoke` — the smoke lane would
be blind to the whole screen. It moved to `F7-009`, which genuinely exercises
route → editor → preview render before zooming. Batch 9 moved a smoke tag off a
quarantined row for the same reason.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Report editor | `/settings/reports/:name` | `src/pages/analysis/ReportEditorPage.ts` |

Moved out of `src/pages/webpet/settings/` in this batch — this spec was its last
web-pet consumer. It extends `BasePage` directly rather than a web-pet list or
form base, which is why it lands under `analysis/` rather than staying near the
web-pet tree.

**The page object is as stale as the specs.** It still models the removed iframe
and markers. The rewrite owns both, together.

## Parallelism

No `mode: 'serial'`, and none should be added.

## Data

`F7-009` drives the seeded `Ranch` report. Nothing is created or cleaned up.

A note on a retracted diagnosis: every row's `testDescription` used to end with
*"Red on dev staging: needs a seeded report."* The spec's own header retracts it —
the report renders; the architecture moved underneath. That sentence was dropped
during relocation rather than carried forward, because a wrong cause is worse
than none.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The `Ranch` report registered on dev — `F7-009` needs it.

## Open questions for the tester

- [ ] **The rewrite is the whole story here.** Twelve specs and their page object
      need rebuilding against the `ReportCanvas` UI, re-enabling `F7-002`…`F7-014`
      incrementally as each lands.
- [ ] Does `F7-R12` still have a subject now that widgets are hidden from the
      editor flow?
- [ ] `F7-001` needs run-with-parameters and export to reach `journey` depth.
      Nothing about generating output is automated.
- [ ] If `F7-009` ever reds on dev, check deployed-bundle lag before editing it —
      the `ReportCanvas` commits date from 2026-06-10 and should be live, but that
      is the triage order.
