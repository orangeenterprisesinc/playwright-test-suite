# `D8` · Delete to recycle and restore

> **A deleted record is kept, not destroyed, and it comes back on screen.** D8 creates four scratch crops on screen. It deletes crop A from its form and restores A from **File ▸ Administration ▸ Deleted Records ▸ Crop**. It then multi-deletes B, C and D from the Crop list and undoes that batch from **File ▸ Restore or Reverse ▸ Reverse Multi Delete**. Read-only GETs prove that each deleted crop is still in the database, sitting in the recycle bin, and back afterwards.
>
> **Binding safety constraints:**
> * Only this run's four crops are ever ticked, deleted, restored or undone. The list is always filtered to the run's own name stem first.
> * **Empty recycle bin** is never clicked, and no page object exposes it. The selection bar's **Undo** is never clicked either.
> * Undo on Reverse Multi Delete is clicked only on this run's batch, which is identified by the history id read before the click. A `page.route` guard aborts any `bulk-update-history/{id}/undo` request carrying a different id.

**Source:** QA sign-off of WEBPET-2053 (2026-10-14, entity Crop). The recording annotations are in `.video-annotations/d8-delete-recycle-restore-happy-path-2026-10-14/`.

**Live check:** on 2026-10-14 the planner ran the whole path on `su`, on its own scratch crop `E2ECrop_PLAN_185730` (id 3502). It created, deleted, restored, multi-deleted and undid that crop, then deleted it again, so the crop is left soft-deleted.

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `D8` |
| Jira | `PET-12665`, [D8] Delete to recycle and restore (manual source WEBPET-2053) |
| This plan | `test-plans/journey-d/d08-delete-recycle-restore.md` |
| Spec | `tests/web/journey-d-office/d08-delete-recycle-restore.spec.ts` |
| Scenario | `src/data/journey-d/d08-delete-recycle-restore.json` |
| Runner row | `src/data/runner/journey-d.csv` → `D8` (exists as `draft`, `enabled=0`) |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `D8` |
| Journey | `D`, daily office processing (the engine) |
| Segments / Modules | `all` / `Windows` |
| Surface | `ui`. Spec in `tests/web/journey-d-office/`; runner category `ui` |
| Demo candidate | no (`demo=0`) |

**Summary** (from the catalog)
> Deleted records are soft-deleted to a recycle bin, excluded from reports but recoverable, so a mistaken delete is reversible. A separate multi-delete restore protects against an interrupted bulk delete.

## Catalog steps

| # | Catalog step | Office surface (WEBPET-2053 + live 2026-10-14) | Automatable? |
|---|---|---|---|
| 1 | Delete a record; it is flagged deleted, kept in the database, and excluded from reports. | Edit Crop form **Delete** → alertdialog `Delete "<name>"?` (*Are you sure? This action cannot be undone.*) → **Delete** → `/setup/crops`, toast **"Crop deleted"**, row gone. `GET crops/{id}` → 404, and the crop is listed in `GET crops/deleted` | **yes**, except "excluded from reports" (deferred) |
| 2 | Recover via File → Administration → Switch to Deleted Records Restore Mode, one at a time. | The web app has no Restore Mode, by design. **File ▸ Administration ▸ Deleted Records** (`/settings/deleted-records`) → link **"Crop View deleted records"** → `/setup/crops/deleted`. That page holds the grid **"Deleted Crops"** (Name / Export ID / Code / Worker Comp Code / Restore) with no row checkboxes. Restore → toast **"Crop restored"**. **Back to Crop list** → `/setup/crops` | **yes** (documented divergence) |
| 3 | Never interrupt a multi-delete; its restore file recovers the batch. | Crop list **Multi Update** → tick rows → selection bar **More actions ▸ Delete** → `Delete 3 selected rows?` → **Delete 3** → toast **"Records deleted"**. **Reverse Multi Delete** → row **Undo** → `Undo this bulk update?` → **Undo update** → toast **"Bulk update undone"**, status Active → Undone | **yes** for the batch undo; the interruption itself is **not automatable** |

## Scope

**In:** one happy path, exactly as QA signed it off:
1. Delete A from its form, then restore A from Deleted Records.
2. Multi-delete B, C and D, then undo that batch from Reverse Multi Delete.
3. Reload the Crop list and assert that all four crops are back.

**Out:**
- **"Excluded from reports"** is deferred; WEBPET-2852 is still In Review.
- **Legacy Restore Mode** is a documented divergence: `plan-delete.md` (WEBPET-2053) replaces it with a Deleted Records page per entity.
- **An interrupted multi-delete** is not automatable; the test cannot kill the server mid-request.
- **The selection-bar Undo** and **Empty recycle bin** are forbidden by the safety constraints.

## Expected outcomes

**Arrange**
- Saving crop A from **New Crop** opens `/setup/crops/{id}` with the heading `Edit Crop: A` and the toast **"Crop created"**. The id is recorded before any assertion.
- Filtered to the run's stem, the Crop list shows **Total 4 rows**.

**Step 1: delete from the form**
- Confirming A's form **Delete** shows the dialog title `Delete "A"?` and then the toast **"Crop deleted"**.
- The re-filtered list shows **Total 3 rows**, and A's row is gone.
- `GET crops/{A}` returns 404, while `GET crops/deleted` still holds A's `cropCounter` and name. So A is kept in the database and flagged deleted.

**Step 2: restore one record**
- On **Deleted Crops**, A's row shows A's Name and Code. The grid has **no checkboxes**, so a restore is one row at a time.
- Clicking A's **Restore** sends `POST crops/{A}/restore` and shows the toast **"Crop restored"**. A's row leaves the deleted grid.
- After **Back to Crop list**, the filtered list shows Total 4 rows, and `GET crops/{A}` returns 200.

**Step 3: multi-delete**
- With **Multi Update** pressed (`aria-pressed=true`), ticking B, C and D makes the selection bar read **3 selected**.
- The confirm dialog reads `Delete 3 selected rows?` with the note *You can undo this from the selection bar before changing your selection.*
- Confirming shows the toast **"Records deleted"**, and the filtered list shows Total 1 rows (A).
- `GET crops/deleted` holds B, C and D.
- `GET bulk-update-history` has exactly one new row since the pre-delete head, with `tableName` Crop, `recordCount` 3, `authorName` Su, `undoneOn` null and `undoable` true.

**Step 3: undo the batch**
- On **Reverse Multi Delete**, exactly one row matches this batch: Performed = the formatted `createdOn`, Performed by **Su**, Record type **Crop**, Field **deleted**, Records **3**, Status **Active**, and an **Undo** button.
- The undo dialog reads `Undo this bulk update?`, and its text contains `This restores 3 record(s)`.
- **Undo update** sends exactly `POST bulk-update-history/{ownId}/undo` and shows the toast **"Bulk update undone"**.
- The row then reads **Undone** and has no Undo button. `GET bulk-update-history` shows a non-null `undoneOn` for our id.
- After a **browser reload**, the filtered Crop list shows Total 4 rows (A–D), and `GET crops/{id}` returns 200 for all four.

**Not asserted**
- The Crop list showing the restored crops **without** a reload. This is the known issue WEBPET-3803: the list stays stale until a reload. The pre-reload row count is attached as evidence, not asserted, and the test carries `{type:'known-issue', description:'WEBPET-3803 …'}`.
- The deleted page's empty state, `No deleted Crops.` Not automatable on dev, where about 2,870 crops sit in the bin.
- The Restore toast and the per-row Restore click are (POM). On 2026-10-14 the first click after a scroll was swallowed (no POST), so `restore()` retries until the POST is seen.

## Screens and page objects

| Screen | Menu path | Page object (registry name) | Status |
|---|---|---|---|
| Setup ▸ Crop list + form | `['Setup','Crop']` → `/setup/crops` | `src/pages/setup/CropPage.ts` (`crop`) | **new** |
| Deleted Records index + Deleted Crops | `['File','Administration','Deleted Records']` | `src/pages/admin/DeletedRecordsPage.ts` (`deletedRecords`) | **new** |
| Reverse Multi Delete | `['File','Restore or Reverse','Reverse Multi Delete']` | `src/pages/admin/BulkDeleteHistoryPage.ts` (`bulkDeleteHistory`) | **new** |

Register all three in `src/fixtures/pages.fixture.ts`. Never import `@pages/webpet/setup/Crop*`.

### `CropPage extends SetupScreenPage`

It mirrors `RanchPage`, with this config:

- `listUrl: '/setup/crops'`
- `gridName: 'Crops'`
- `entity: 'Crop'`
- `menuPath: ['Setup','Crop']`
- `rejectionMessage: /Already in use|A crop with this name already exists\./`

| Member | Locator / behaviour (measured live 2026-10-14) |
|---|---|
| `nameInput` / `exportIdentifierInput` / `codeInput` | `#name` / `#exportIdentifier` / `#code`. Barcode is left empty and auto-assigns (35205 measured). Export Identifier copies Name on blur |
| `createCrop({name})` | `createOnScreen(() => nameInput.fill(name))`. New is `page-header-action-new`; the base `New Crop` role locator also works |
| `successToast(t)` / `heading(t)` | as in `CrewPage` (exact text; h1) |
| `formDeleteButton` | `page.getByRole('main').getByRole('button',{name:'Delete',exact:true})`. The dialog renders outside `<main>` |
| `deleteDialog(name)` | `page.getByRole('alertdialog',{name:`Delete "${name}"?`})`; confirm with `.getByRole('button',{name:'Delete',exact:true})` |
| `deleteFromForm(name)` | click → dialog → confirm → wait for URL `/setup/crops(\?|$)` → wait for `newButton` |
| `filterToStem(stem)` | `grid.nameFilter.fill(stem)`. A contains match; the URL gains `?name=`. Re-apply after every navigation |
| `ownRows(stem)` | `grid` rows with a link `/^Edit Crop: <stem>/` |
| `multiUpdateButton` | `getByTestId('page-header-action-multi-update')`; after the click, `toHaveAttribute('aria-pressed','true')` |
| `rowCheckbox(name)` | `page.getByRole('checkbox',{name:`Select ${name}`})`. Never `Select all rows` |
| `selectionBar` / `selectedCount()` | `getByRole('region',{name:'Selected rows actions'})`. Read `/(\d+) selected/` from the text inside its `Clear selection` button (copy the reader from `JobCardsPage`) |
| `deleteSelected(n)` | See the steps below |
| `bulkDialogText` | `page.getByText('You can undo this from the selection bar before changing your selection.')` |
| `selectionUndoButton` | `selectionBar.getByRole('button',{name:'Undo'})`. Exposed for a visibility check only; never clicked |

`deleteSelected(n)` steps:
1. `selectionBar.getByRole('button',{name:'More actions'})`. The page header has another "More actions", so scope to the bar.
2. `page.getByRole('menuitem',{name:'Delete'})`.
3. Wait for the alertdialog `Delete ${n} selected rows?`, then click `button {name:`Delete ${n}`, exact:true}`.
4. Wait for the dialog to be hidden.

### `DeletedRecordsPage extends BasePage`

`pageUrl='/settings/deleted-records'`, h1 `Deleted Records`.

| Member | Locator / behaviour |
|---|---|
| `gotoIndex()` | `LeftNavigationPage.openViaMenu(['File','Administration','Deleted Records'], '/settings/deleted-records')`. The leaf is unique, so there is no `.first()` collision with Setup ▸ Crop |
| `entityLink(label)` | `page.getByRole('main').getByRole('link',{name:`${label} View deleted records`,exact:true})` → `/setup/crops/deleted`. Clicked on screen, never reached via goto |
| `deletedGrid(plural)` | `getByRole('grid',{name:`Deleted ${plural}`})`; h1 `Deleted Crops`; `aria-rowcount` = total |
| `deletedRow(name)` | `deletedGrid.getByRole('row').filter({has: page.getByRole('cell',{name,exact:true})})` |
| `revealRow(name, hintIndex)` | Scrolls the virtualized grid until the row is attached; see below |
| `restore(name, id)` | `expect(async()=>{ click the row's 'Restore'; await page.waitForResponse(POST /crops/${id}/restore, 5s) }).toPass({timeout:20s})`, then the row is hidden and the toast `Crop restored` appears |
| `backToList(label)` | `getByRole('button',{name:`Back to ${label} list`})` |
| — | **"Empty recycle bin" is deliberately not exposed** |

How `revealRow` works. The grid is **virtualized**: about 27 of 2,870 rows are in the DOM, each row is about 37 px, and the scroller is a `div.overflow-auto` inside the grid. The `?name=` filter is broken (it empties the grid), and there is no filter row. Row order matches the `GET crops/deleted` order (verified: index 1215 = `data-index` 1215). So:
1. Hover the grid.
2. `mouse.wheel(0, hintIndex*rowHeight - clientHeight/2)`.
3. If the row is not attached, step one `clientHeight` per wheel until it attaches or the bottom is reached (bounded).

### `BulkDeleteHistoryPage extends BasePage`

`pageUrl='/restore-or-reverse/bulk-delete-history'`, with the h1 `Reverse Multi Delete — Bulk Delete History` (em dash). The screen fires `GET bulk-update-history?status=all&type=delete`. File ▸ Restore or Reverse exists both at File level and under Administration; `expandGroup` handles the duplicate, so use the 3-step path.

| Member | Locator / behaviour |
|---|---|
| `goto()` | `openViaMenu(['File','Restore or Reverse','Reverse Multi Delete'], pageUrl)` |
| `table` | `page.getByRole('main').getByRole('table')`: a plain table, not a grid. Columns: 0 Performed · 1 Performed by · 2 Record type · 3 Field · 4 New value · 5 Records · 6 Status · 7 Undo |
| `batchRow(b)` | rows filtered by `has cell {name:b.performedText, exact}` + `cell 'Crop' exact` + `cell String(b.recordCount) exact` |
| `statusCell(row)` / `undoButton(row)` | `row.getByRole('cell').nth(6)` / `row.getByRole('button',{name:'Undo',exact:true})` |
| `undoDialog` / `confirmUndo` | alertdialog `Undo this bulk update?` / button `Undo update` |
| `undoBatch(b)` | See the steps below |

`undoBatch(b)` steps:
1. Assert that `batchRow(b)` has count 1 and its status is `Active`.
2. Route `**/api/bulk-update-history/*/undo`: `continue()` only when the id equals `b.id`; otherwise `abort()` and throw.
3. Click Undo, read the dialog text, then confirm.
4. Wait for the response from `POST …/${b.id}/undo` (204 measured).
5. `unroute`, then expect the toast `Bulk update undone`.

## Data

- **No fixture day and no fixture rows.** The flow mints four run-unique crops with `uniqueName(scenario.crops.prefix)` from `runToken.ts`, using the prefix `E2ECrop_D8`. Names look like `E2ECrop_D8_<RUN_TOKEN>_<seq>`.
  - The sweep's existing `factory('E2ECrop_')` matches them, and `decodeNameAge` dates them.
  - The `D8` infix makes the filter stem `E2ECrop_D8_<RUN_TOKEN>_` unique to this spec.
- **Scenario JSON** `src/data/journey-d/d08-delete-recycle-restore.json`, validated by a new **`JourneyD8RecycleCaseSchema`** (`.strict()`) in `src/data/schemas/journeyDScenario.ts`:
  - `workflow:'D8'`, `label`
  - `crops:{prefix:'E2ECrop_D8', count:4}`: index 0 = A (the single delete), 1..3 = B..D (the batch)
  - `expected` (UI texts and values):

    ```text
    createdToast:'Crop created'
    deleteDialogText:'Are you sure? This action cannot be undone.'
    deletedToast:'Crop deleted'
    deletedRecordsLabel:'Crop'
    deletedPlural:'Crops'
    restoredToast:'Crop restored'
    bulkDialogText:'You can undo this from the selection bar before changing your selection.'
    bulkToast:'Records deleted'
    recordType:'Crop'
    field:'deleted'
    performedBy:'Su'
    undoDialogText:'This restores 3 record(s)'
    undoneToast:'Bulk update undone'
    statusBefore:'Active'
    statusAfter:'Undone'
    ```

  - `annotations[]`: the WEBPET-3803 known issue; `deferred` for WEBPET-2852 (reports) and for the interrupted batch
  - `cleanup[]`: `{kind:'delete',entity:'crop',name:'{cropA}'}` … `{cropD}`, plus `{kind:'unremovable',entity:'bulkDeleteHistory',reason:'history rows are an audit trail; an Active row is left only if the test dies before the undo'}`
  - `superRefine`: `prefix.startsWith('E2ECrop_')`, `count===4`, and all four `{cropA..D}` delete steps are present

## Preconditions

- [ ] Logged in as `su` (suite auth). No preference write and no before-phase sweep; the global residue sweep reclaims older `E2ECrop_` crops.
- [ ] `test.slow()`, for the four on-screen creates plus the virtualized-grid reveal.

## API allowances

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| delete proof | `GET crops/{id}` (expect 404 / 200) | read | live vs gone after each screen action |
| kept-in-DB proof + row hint | `GET crops/deleted` | read | the binned row with its id, and its index for `revealRow` |
| batch identity | `GET bulk-update-history?status=all&type=delete` (head before; poll after; undone after) | read | finds the one new Crop row (id, `createdOn`, `recordCount`) before the Undo click |
| undo guard | `page.route` on the screen's own `…/undo` request | — | not an API call; it only blocks a wrong id |
| after-phase teardown | `GET crops` → `GET crops/{id}` → `DELETE crops/{id}` (rowversion), via `deleteByName` | cleanup | soft-deletes whichever own crop is still live. **Never** Empty recycle bin or purge (tenant-wide) |

Create, delete, restore, bulk delete and undo all happen **on screen**. Their writes are the browser's own: `POST crops`, `DELETE crops/{id}`, `POST crops/{id}/restore`, `DELETE crops/bulk-delete` and `POST bulk-update-history/{id}/undo`. Nothing goes over `sessionApi`.

## Cleanup

| Phase | Step | How |
|---|---|---|
| after, 1 | **[declarative]** 4 × `delete crop {cropX}` | `runCleanup(..., {phase:'after'})`. `deleteByName` is a no-op for a crop already in the bin |
| after, 2 | **[nothing]** recycle bin | Own crops end soft-deleted, like every other `E2ECrop_` residue. The bin is never emptied |
| after, 3 | **[unremovable]** bulk-delete history row | Annotated `cleanup-not-possible`. It ends `Undone` on a green run |

## Flow helper — `src/utils/journeys/journeyDFlow.ts`

New read helpers live in **`src/utils/api/recycleBinApi.ts`**: `getRecordStatus(api, listPath, id)`, `listDeleted(api, listPath)` and `listBulkDeleteHistory(api)`. The spec reaches them only through the flow.

```ts
export interface BulkDeleteBatch { id: number; createdOn: string; recordCount: number; authorName: string;
    undoneOn: string | null; undoable: boolean; performedText: string; }
export interface JourneyD8Run {
    scenario: JourneyD8RecycleCase; names: [string, string, string, string]; stem: string;
    ids: Map<string, number>; cleanup(): Promise<void>; }
export function prepareJourneyD8(scenario: JourneyD8RecycleCase, opts: { testInfo: TestInfo }): JourneyD8Run;
export function recordCropId(run: JourneyD8Run, name: string, id: number): void;
export async function cropState(opts: { sessionApi: APIRequestContext }, id: number): Promise<'live' | 'binned' | 'absent'>;
export async function deletedCropIndex(opts: { sessionApi: APIRequestContext }, id: number): Promise<number>;
export async function bulkDeleteHead(opts: { sessionApi: APIRequestContext }): Promise<number>;
export async function findOwnBatch(run: JourneyD8Run, opts: { sessionApi: APIRequestContext }, sinceId: number): Promise<BulkDeleteBatch>;
export async function readBatch(opts: { sessionApi: APIRequestContext }, id: number): Promise<BulkDeleteBatch>;
export function performedText(createdOn: string): string;
```

- **`prepareJourneyD8`**
  1. Mints the 4 names and sets `stem = `${prefix}_${RUN_TOKEN}_``.
  2. Calls `substituteTokens(scenario, {cropA..cropD})` and pushes the annotations.
  3. Registers `runCleanup(after)` on `currentScope(testInfo)`, as `prepareJourneyD3` does.
- **`findOwnBatch`** polls `listBulkDeleteHistory` for 15 s. It requires **exactly one** row with `id > sinceId && tableName==='Crop'`, and that row must have `recordCount===3`, `authorName===expected.performedBy`, `undoneOn===null` and `undoable`. Anything else throws ("refusing to pick a batch").
- **`performedText`** formats the **naive** `createdOn` as `M/D/YYYY, h:mm:ss AM|PM`, with no time-zone conversion. The browser parses the naive string as local time, so the UI shows the server value verbatim on any machine. Measured: `2026-10-14T19:01:01.550` → `10/14/2026, 7:01:01 PM`, with the browser in Asia/Calcutta.

## Test case

Flip the existing row: `jira` → `PET-12665`, `status` → `automated`, `enabled` → `1`. Keep `category=ui`, `testName=deleteToRecycleAndRestore`, `tags=regression`, `demo=0`. Then run `npm run runner:sync && npm run runner:check`.

```ts
test.describe('D8 · Delete to recycle and restore', { tag: ['@JourneyD', '@D8'] }, () => {
    test('[Recycle Bin] Delete a crop and restore it from Deleted Records, then undo a multi-delete from Reverse Multi Delete.', {
        tag: ['@Regression'], annotation: [{ type: 'testCaseId', description: 'D8' }],
    }, async ({ sessionApi, pages }, testInfo) => { test.slow(); /* ... */ });
});
```

**Steps:**

1. `loadScenario(JourneyD8RecycleCaseSchema, testInfo)` → `run = prepareJourneyD8(...)`.
2. **Arrange on screen.**
   - For each of A..D: `pages.crop.createCrop({name})` → `expect(outcome, 'New Crop rejected <name>').toBe('created')`.
   - Call `recordCropId(run, name, pages.crop.savedIdFromUrl())` **before** asserting the toast `Crop created` and the heading `Edit Crop: <name>`.
   - `gotoList()` → `filterToStem(stem)` → `expect(totalRowCount(), 'all four own crops listed').toBe(4)`.
3. **Catalog step 1.**
   - `openEdit(A)` → `deleteFromForm(A)`. Assert the dialog title `Delete "A"?` and body `expected.deleteDialogText`, then the toast `Crop deleted`.
   - Re-filter: `'A is gone from the list'` → total 3, and `rowFor(A)` count 0.
   - `expect(cropState(A), 'GET crops/{A} 404 but listed in crops/deleted — kept in the database').toBe('binned')`.
4. **Catalog step 2.**
   - `deletedRecords.gotoIndex()` → `entityLink('Crop').click()` → URL `/setup/crops/deleted`, h1 `Deleted Crops`.
   - `expect(deletedGrid.getByRole('checkbox'), 'restore is one record at a time').toHaveCount(0)`.
   - `revealRow(A, await deletedCropIndex(A))` → A's Name and Code cells are visible.
   - `restore(A, idA)` → toast `Crop restored`; `'A left the recycle bin'` (row hidden).
   - `backToList('Crop')` → filter → total 4; `expect(cropState(A), 'A is live again').toBe('live')`.
5. **Catalog step 3, delete.**
   - `head = bulkDeleteHead()`.
   - `crop.enableMultiUpdate()`, then tick B, C and D. `expect(selectedCount(), 'exactly the three own rows selected').toBe(3)`.
   - `deleteSelected(3)`: assert the dialog text, then the toast `Records deleted`.
   - Re-filter → `'only A remains'` total 1. `expect(selectionUndoButton).toBeVisible()`, but never click it.
   - `cropState` of B, C and D → `binned`.
   - `batch = findOwnBatch(run, …, head)`.
6. **Catalog step 3, recover.**
   - `bulkDeleteHistory.goto()` → `batchRow(batch)` count 1 and reads Su / Crop / deleted / 3 / **Active**.
   - `undoBatch(batch)` → the dialog contains `This restores 3 record(s)` → toast `Bulk update undone`.
   - `statusCell` → **Undone**, and the Undo button is hidden.
   - `expect(readBatch(batch.id).undoneOn, 'history records the undo').not.toBeNull()`.
7. **Verify (WEBPET-3803).**
   - `crop.gotoList()`, then attach the pre-reload `ownRows(stem)` count as evidence.
   - `page.reload()` → filter → `expect(totalRowCount(), 'A–D all back after reload').toBe(4)`.
   - `cropState` → `live` for all four.
8. `await run.cleanup()`.

**Proof the test is real, not vacuously green:**
- Every delete is proved twice: on screen (row count) and by GET (404 + binned).
- Every recovery is proved on screen (toast, row, status `Undone`) and by GET (200, `undoneOn`).
- The batch is the one new history row, and the route guard makes clicking any other batch's Undo impossible.

## Open questions for the tester

None outstanding.
