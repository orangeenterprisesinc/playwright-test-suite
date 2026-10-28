# R1 · Reports hub: listing, filtering, and favorites

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `R1` |
| Journey | `R` — Reports |
| Segments | `all` |
| Modules | `Reports` |
| Surface | `ui` → `tests/web/journey-r-reports/` |
| Demo candidate | no |
| Catalog status | draft (source `reports-passfail-2026-08-05.csv`, Jira PET-12681, manual case WEBPET-1840) |

**Summary** (from the catalog)
> Find a report on the Reports hub by name and module, keep the ones used most as favorites, and see at a glance which reports cannot run yet.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `R1` |
| This plan | `test-plans/journey-r/r01-reports-hub-listing-filtering-favorites.md` |
| Spec | `tests/web/journey-r-reports/r01-reports-hub-listing-filtering-favorites.spec.ts` |
| Data | `src/data/journey-r/r01-reports-hub-listing-filtering-favorites.json` |
| Runner row | `src/data/runner/journey-r.csv` → `R1` (exists, draft, enabled 0) |

## Catalog steps

Measured live on dev (`app.ptdev.xyz`, su, 2026-10-28). su lists **489** hub rows today. Never hard-code that number; read it on screen.

| # | Catalog / manual step (WEBPET-1840) | What the screen does | Automatable? |
|---|---|---|---|
| 1 | Open Administration ▸ Reports; the list loads with rows, no stuck spinner, no "Failed to load reports. Please try again." | Sidebar **File ▸ Administration ▸ Reports** → `/settings/reports`. H1 "Reports", `grid "Reports"` (`data-testid="data-grid"`, `aria-rowcount=489`), footer status `data-testid="data-grid-count"` "Total 489 rows". The app-level `status "Loading..."` goes away. | yes |
| 2 | Type part of a name into the Report filter; list narrows; restores when cleared | Text box with placeholder "Filter…" in filter-row cell `[data-col="name"]`. The match is a case-insensitive "contains"; the URL gains `?name=`. "Summary by" leaves 32 rows. Clearing returns the full total. | yes |
| 3 | For filter → a module; only that module's reports remain, plausible count | Typable combobox in `[data-col="module"]` (accessible name "All" from its placeholder, kept after selection), 101 options. Picking adds a "Clear" button and `?module=`. "Time In" → 71 rows. | yes |
| 4 | Both filters intersect | "Summary by" + "Time In" → 7 rows: Daily Summary by Field, Excel Daily Summary by Field, Piece Summary by Employee Detailed, Piece Summary by Employee with Rank, Piece Summary by Field Detailed, Piece Summary by Pack per Field, Piece Summary by Packing Types. | yes |
| 5 | Star three → top; reload → persisted | Star button `Add <name> to favorites` (`aria-pressed=false`) becomes `Remove <name> from favorites` (`aria-pressed=true`). The row jumps to the top immediately, because the default sort is favorites desc, then For asc, then Report asc. A reload keeps it. **Stored in browser localStorage only, no request.** | yes |
| 6 | Unstar one, reload → it dropped back | Toggles back to "Add …"; after reload the row is back in its alphabetical place. | yes |
| 7 | Sort by Report then Last Run; ordering changes | Clicking a header cycles `aria-sort` and the URL `sort` parameter. Report: `name` (ascending), then `name.desc`, then the default with no parameter. Last Run: `lastRunAt.desc`, then `lastRunAt`, then off. The first Report click from the default state gives `sort=favorite.desc`, so click until the target state is reached rather than counting clicks. | Report: yes. Last Run order: **no** (every row reads "Never" in a fresh browser, see outcomes) |
| 8 | A "Not available" row offers neither Run nor Configure | Badge `<span data-slot="badge">Not available</span>` inside the Report cell; the actions cell is empty; the star button is still there. On su at planning time: Job Card ▸ Equipment Summary by Field / by Job, Bar Codes and Packaging Size Codes (For "—"). The Equipment pair turned available later that day, so the spec uses **Bar Codes** (no For value, found with the module filter cleared). | yes |
| 9 | Scroll the whole list; no blank names; note raw database identifiers | The grid renders only about 27 of 489 rows at a time. Scanning it by scrolling is banned, so this is checked on every filtered view plus a read of the For option list. | partly (see outcomes) |

## Expected outcomes

Each sentence names its proof on screen.

- Opening File ▸ Administration ▸ Reports shows the "Reports" heading and the "Reports" grid with at least one row. The footer reads "Total N rows" with N > 0, the loading status disappears, and "Failed to load reports. Please try again." is not shown. *Proof: H1, grid, `data-grid-count`, rendered rows, error text absent.*
- Typing the configured text into the Report filter leaves fewer rows than the total, and every rendered row's name contains that text (case-insensitive). Clearing the filter brings the footer back to the original total. *Proof: footer count before, during and after; row names (`aria-label`).*
- Choosing a module in the For filter leaves more than zero and fewer than the total rows, and every rendered row's For cell equals that module. *Proof: footer count; For cell of each rendered row.*
- With both filters set, the result is no larger than either filter alone, every row satisfies both, the whole result is rendered, and it includes the configured known reports. *Proof: footer counts, rendered rows equal the footer count, cell text.*
- Starring three reports turns each star to "Remove … from favorites" (pressed), and those three become the first three rows in name order under the default sort. *Proof: button name and `aria-pressed`; first three rows' names.*
- After a reload (F5) with the filters unchanged (they are in the URL), the same three are still starred and still first. *Proof: as above, after `openScreen` reloads.*
- Unstarring one turns it back to "Add … to favorites". After a reload it is unstarred, the other two are the first two rows, and it sits below them. *Proof: button state; row order.*
- Sorting by Report puts the filtered rows in ascending name order, sorting again puts them in descending order, and the two orders differ. *Proof: header `aria-sort` "ascending"/"descending" plus the rendered row order.*
- Sorting by Last Run marks the header "descending". *Proof: `aria-sort`.* — the **order change is not asserted (not automatable)**: Last Run comes from the browser's `localStorage` (`reportLastRun`) and every test starts from a storageState where it is empty, so every row reads "Never" and there is nothing to reorder. Instead the spec asserts every rendered Last Run cell reads "Never". R2 proves Last Run updates after a run.
- A report badged "Not available" shows the badge and has neither a "Run <name>" nor a "Configure <name>" button, but can still be starred. *Proof: badge text; the two buttons have count 0; the star button is visible.*
- Every row rendered in every filtered view above has a non-blank name. *Proof: `aria-label` and Report cell text.*
- Every For filter option is non-blank. — **raw database identifiers are recorded, not asserted** (`observation` annotation). Today they are H2AContract, HarvestTag, PieceRemoval, RunPacking, and the misspelling "Constractor Time Sheet". Naming them is a product finding, not a pass/fail rule.
- No blank names anywhere in all 489 rows. — **not automatable here.** The grid only renders the rows on screen, and the suite rule is filter first, never scroll-scan. The check above covers every filtered view instead.
- "Failed to load reports. Please try again." on a failed load. — **out of scope (negative)**; only its absence is asserted.
- Configure, Design and "Edit Company-wide Base". — **out of scope**: they open editors that save shared layouts.
- Favorites carrying over to another browser or machine. — **not asserted (finding)**: favorites are browser-local by design today.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| App shell sidebar | — | `src/pages/shell/LeftNavigationPage.ts` (`openScreen(['File','Administration','Reports'], '/settings/reports')`) | exists |
| Reports hub | `File ▸ Administration ▸ Reports` | **`src/pages/reports/ReportsHubPage.ts`** | to write |
| Run dialog (R2) | hub row ▸ Run | **`src/pages/reports/ReportRunDialog.ts`** | to write (composed into the hub page) |
| PDF viewer (R2; also used by E8's ReportDialog) | — | **`src/pages/reports/PdfViewerDialog.ts`** | to write (extracted) |

This is the single description of these files; R2 refers back to it.

**`ReportsHubPage extends BasePage`**
- `pageUrl = '/settings/reports'`, `pageTitle = /.*/`.
- Composes `DataGridComponent(page, 'Reports', 'Report')` for `totalRowCount()` and `totalRowsStatus`. Use it, do not change it: it is shared core. Its `rowFor`/`editLink` do not apply (no edit links).
- Holds `PickerComponent`, `LeftNavigationPage`, `runDialog: ReportRunDialog`.

Measured locators:
- grid: `page.getByRole('grid', { name: 'Reports' })` (= `getByTestId('data-grid')`).
- count: `getByTestId('data-grid-count')` ("Total N rows", also "Total 1 rows").
- heading: `getByRole('heading', { level: 1, name: 'Reports' })`.
- load error: `getByText('Failed to load reports. Please try again.')`.
- name filter: `grid.locator('[role="columnheader"][data-col="name"]').getByRole('textbox')` (placeholder "Filter…", with the ellipsis character).
- module filter: `grid.locator('[role="columnheader"][data-col="module"]').getByRole('combobox')`; its clear button is `getByRole('button', { name: 'Clear' })` in the same cell.
- body rows: `grid.getByRole('row').filter({ has: page.getByRole('cell') })`. Each body row has `aria-label` = the clean report name, without the "+1 variant" or "Not available" badge text.
- row: `grid.getByRole('row', { name, exact: true })` under a For filter, because names repeat across modules.
- cells by column order (favorite, For, Report, Last Run, actions). su has no saved grid layout (`grid-layouts` returns 404), so the default order holds. Read For as `row.getByRole('cell').nth(1)` and Last Run as `.nth(3)`.
- star: `row.getByRole('button', { name: /^(Add .+ to favorites|Remove .+ from favorites)$/ })`; state from `aria-pressed`.
- Run / Configure: `row.getByRole('button', { name: \`Run ${name}\`, exact: true })` / `` `Configure ${name}` ``. Some rows also have "Design the layout of <name>".
- Not-available badge: `row.locator('[data-slot="badge"]', { hasText: 'Not available' })`. Variant badge: `+N variant` with title "N+1 forms of this report are available when you run it".
- sort header: `grid.getByRole('columnheader', { name: /Report$/ })` and `/Last Run$/` (accessible names are "Reorder column Report" etc.). Click the header's own text `header.getByText('Report', { exact: true })`, never the `column-reorder-handle` button (drag). State is the header's `aria-sort`.

Methods (spec-facing, every wait bounded):
- `openFromMenu()`: `openScreen(...)`, then wait for the grid and the count status. Calling it again while on the route is the user's F5, and the query string (filters, sort) survives.
- `totalRows()`.
- `renderedRowNames()`.
- `expectFullyRendered()`: rendered body rows must equal the footer count, otherwise fail with "grid is virtualizing N rows — narrow the filter".
- `filterByName(text)` / `clearNameFilter()`: fill, then poll the footer count until it changes or settles. Never wait on a fixed row.
- `filterByModule(module)`: `picker.pickCombobox`. `clearModuleFilter()`.
- `rowsForCells()`: for each rendered row returns `{ name, module, lastRun }`.
- `row(name)`, `isFavorite(name)`, `setFavorite(name, on)`: click only if the state differs, then expect the new `aria-pressed`.
- `sortBy(column: 'Report'|'Last Run', dir: 'ascending'|'descending')`: click the header text until `aria-sort === dir`, at most 4 clicks, otherwise fail by name with the states seen.
- `moduleOptions()`: open the combobox, read `getByRole('listbox').getByRole('option')` texts, press Escape.
- `openRun(name)`: R2.

**`ReportRunDialog` and `PdfViewerDialog`**: specified in R2's plan; they are added to the same folder in the same change.

**Registry:** `src/fixtures/pages.fixture.ts`: import `ReportsHubPage` and add `readonly reportsHub: ReportsHubPage;` under "File ▸ Administration" with the doc line `/** File ▸ Administration ▸ Reports, \`/settings/reports\` — hub, Run dialog, PDF viewer (R1/R2). */`, plus `get reportsHub() { return lazy('reportsHub', () => new ReportsHubPage(page)); }`. Do not use `src/pages/webpet/settings/ReportEditorPage.ts`; lint bans it from journey specs.

## Data

`src/data/journey-r/r01-reports-hub-listing-filtering-favorites.json`, validated by `ReportsHubCaseSchema` in **`src/data/schemas/journeyRScenario.ts`**. That schema file is new and shared with R2, which adds `RunDialogCaseSchema` to the same file. Every value the spec uses lives here; the only literals in the spec are `testCaseId`, tags, titles and `expect` messages.

```json
{
  "_notes": [
    "Favorites and Last Run are browser-local (localStorage pt.userPreferences.v1); every test starts from .auth storageState with both empty — nothing server-side to clean.",
    "Names repeat across modules (All Data, Barcodes, Equipment Summary by Field), so favorites and the Not-available row are always addressed under a For filter."
  ],
  "workflow": "R1",
  "hub": { "menuPath": ["File", "Administration", "Reports"], "url": "/settings/reports", "heading": "Reports", "gridName": "Reports", "loadFailureText": "Failed to load reports. Please try again." },
  "nameFilter": { "text": "Summary by" },
  "moduleFilter": { "module": "Time In" },
  "intersection": { "mustInclude": ["Daily Summary by Field", "Piece Summary by Employee Detailed"] },
  "favorites": {
    "module": "Job Card",
    "nameFilter": "Summary by",
    "star": ["Payroll Summary by Job", "Summary by Employee", "Summary by Pieces"],
    "unstar": "Summary by Employee"
  },
  "sorting": { "neverRunText": "Never" },
  "notAvailable": { "nameFilter": "Bar Codes", "report": "Bar Codes", "badge": "Not available" },
  "observation": { "rawIdentifierPattern": "^[A-Za-z0-9]*[a-z0-9][A-Z][A-Za-z0-9]*$" },
  "annotations": [
    { "type": "not-asserted", "description": "Last Run sort order: Last Run is browser-local and every row reads Never in a fresh context; header state only (R2 proves Last Run updates)." },
    { "type": "not-asserted", "description": "Whole-list blank-name scan: the grid virtualizes 489 rows; checked on every filtered view instead." }
  ],
  "cleanup": []
}
```

`ReportsHubCaseSchema` is `.strict()` with these `superRefine` checks:
- `favorites.star` has exactly 3 distinct names.
- `favorites.unstar` is one of them.
- every `favorites.star` and every `intersection.mustInclude` name contains its filter text (case-insensitive).
- `notAvailable.report` contains `notAvailable.nameFilter`.
- `observation.rawIdentifierPattern` compiles.

`annotations` defaults to `[]` and `cleanup: z.array(CleanupStepSchema).default([])`. Keep `cleanup` for uniformity; R1 never fills it.

Uniqueness rules: none, R1 creates no records. Favorites are chosen from stable, available Job Card reports on su: Payroll Summary by Job, Summary by Employee, Summary by Pieces. All three have Run and are unique inside Job Card. Under "Summary by" + Job Card (20 rows) the default top three are Cost Summary by Crop, Cost Summary by Field and Cost Summary by Field by Database, so the jump to the top is visible.

## Preconditions

- An authenticated su session (storageState). su has `reports.configure` (the hub renders). If the hub ever answers with the load error, fail by name; there is no gate to read.
- No arrange. The reports catalog comes from the app's code and the client's modules, not from records the test creates.

## API allowances

R1 makes **no API call**. There is no `sessionApi` use and no favorites endpoint exists (stars are `localStorage` only; measured: no request on star, unstar or reload). Its only network activity is the app's own reads (`GET /reports/config/reports`, `GET /user/grid-layouts/report-config.hub.gridState` → 404). Verify with `UI_FIRST_GUARD=enforce` and `UI_FIRST_READS=ledger`: zero violations and zero test-initiated reads.

| Step / call | Endpoint | Allowance | Why | Proof on screen |
|---|---|---|---|---|
| — | — | — | none | — |

## Cleanup

Nothing is created, and there is nothing server-side to restore.
- **Before-phase self-heal (defensive):** after filtering to `favorites.module` + `favorites.nameFilter` and before starring, any of the three that is already pressed is unstarred on screen, with an annotation `self-heal`. Today this never fires, because the storageState seeds `reportFavorites: []`.
- **Unstar before sorting:** the remaining two favorites are unstarred on screen right after step 5. Starred rows stay pinned on top under any explicit sort (measured on the first dev run 2026-10-28), so the sort is checked on an unpinned list; the browser also ends as it started. A teardown is unnecessary, because the browser context is thrown away and the stars never left it.
- No `cleanupTargets.ts` entry and no `runCleanup` call.

## Test case

`src/data/runner/journey-r.csv` row `R1` already exists (`category ui`, `tags regression`, `jira PET-12681`, `status draft`, `enabled 0`). Flip it to `automated`/`1` only after a green run. Then `npm run runner:sync && npm run runner:check`.

| id | Title | Tags | enabled |
|---|---|---|---|
| `R1` | Reports hub: listing, filtering, and favorites | `regression` | 0 |

```ts
test.describe('R1 · Reports hub: listing, filtering, and favorites', { tag: ['@JourneyR', '@R1'] }, () => {
    test('End-to-end: load the hub, filter by name and module, star, persist and unstar favorites, sort, and see a Not available report without Run or Configure', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: 'R1' }],
    }, async ({ pages }, testInfo) => { /* loadScenario(ReportsHubCaseSchema, testInfo) … */ });
});
```

Fixture: `@fixtures/base.fixture` (`pages` only). Suggested `test.setTimeout(180_000)`.

Step order:
1. Open from the menu; record the total N.
2. Name filter: narrowed, contains-check, then clear and check the count is back to N.
3. Module filter: count between 0 and N, every row's For equals the module; then clear.
4. Both filters: expect fully rendered, both predicates hold, `mustInclude` present, count ≤ each single-filter count; then clear.
5. Favorites view (`favorites.module` + `favorites.nameFilter`): self-heal, star three, check the top three, reload, check again; unstar one, reload, check it dropped back; then unstar the remaining two.
6. Sort in the same view (no favorites pinned): Report ascending and descending orders checked against sorted copies of the rendered names, and the two must differ; Last Run descending `aria-sort` plus all cells read "Never".
7. Not-available view: badge present, Run/Configure count 0, star visible.
8. Read the For options: none blank; annotate the ones matching `rawIdentifierPattern` as `observation`.

At every filtered view, assert that no rendered name is blank.

## Validation

- `npm run typecheck`, `npm run lint`, `npm run runner:check`.
- `UI_FIRST_GUARD=enforce npm run test:dev -- tests/web/journey-r-reports/r01-reports-hub-listing-filtering-favorites.spec.ts`, plus `npm run ui-first:audit -- --reads`, which should show no reads.
- These also cover R2's shared changes: R2's own spec, and `tests/web/journey-e-payroll/e08-finalize-gross-pay.spec.ts`, because `ReportDialog` is refactored onto `PdfViewerDialog`. Running E8 is the regression gate for that extraction.

## Open questions for the tester

None that block. Non-blocking findings for the tester:
- [ ] Favorites and Last Run are stored per browser (`localStorage`), not per user, so they do not follow a user to another machine or browser. Is that intended?
- [ ] The For filter shows raw identifiers (H2AContract, HarvestTag, PieceRemoval, RunPacking), a misspelling ("Constractor Time Sheet"), and "—" for Bar Codes / Packaging Size Codes.
