# A2 · Ranch, field, crop, and variety setup

Build the ranch and field location hierarchy that field capture, pay, and
reporting hang off, along with the crop and variety records jobs reference. Every
setup record carries a database-unique barcode and an accounting export
identifier.

## Catalog entry

| | |
|---|---|
| Workflow | `A2` — Ranch, field, crop, and variety setup |
| Journey | A — Setup |
| Module | Windows |
| Segments | all |
| Coverage depth | `screens` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A2-001`…`A2-055` |

`A2-001` remains a `draft`, `enabled=0` row. It describes the end-to-end build of
the ranch → field → crop → variety hierarchy as one journey, which is still not
automated — it is the reserved happy-path slot, not a placeholder to be
cannibalised.

`A2-002`…`A2-055` were relocated from the web-pet suite (`ranch.spec.ts`,
`field.spec.ts`, `crop.spec.ts`, `variety.spec.ts`,
`traceability-batch-a-smoke.spec.ts`, and
`equiv/variety-equivalence-cucumbers-european.spec.ts`). The requirements below
were written from their assertions, not the other way round — they describe what
the 54 tests actually prove.

## Why the coverage depth stays `screens`

Relocating 54 tests changes where coverage lives, not what it covers. These are
form CRUD, list chrome, inline and multi-row edit, and one single-record create.
The catalog's stated gap is untouched: **no end-to-end build of the
ranch → field → crop → variety hierarchy in one journey, and no assertion that
field capture resolves against it.** Even `A2-055`, the only test that creates a
record end to end, creates one variety under one factory-provisioned crop.

Since batch 1 removed automatic depth promotion from `scripts/catalog/traceability.js`,
depth now comes from `workflow-coverage-map.json` alone — so leaving A2 at
`screens` is a deliberate statement, and promoting it later must be earned by
automating `A2-001`.

**D7 credit.** Ranch and field multi-row edit also prove D7's propagation
behaviour, but a journey row carries a single `workflow` value. D7's coverage-map
note therefore points at `A2-009`/`A2-010` and `A2-021`/`A2-022`; `coverage:trace`
reads that note. D7 stays `partial`.

## Acceptance criteria (EARS)

### Ranch list

| id | Requirement | Cases |
|---|---|---|
| `A2-R1` | When the Ranch list is opened, PET Tiger shall display the title "Ranches" and never the historic misspelling. | `A2-002` |
| `A2-R2` | When the Ranch list is opened, PET Tiger shall render the Name, Barcode, Department, Worker Comp Code and Active column headers. | `A2-003` |
| `A2-R3` | PET Tiger shall link each ranch row's edit-icon column to that ranch's own record. | `A2-004` |
| `A2-R4` | When Multi Update is toggled, PET Tiger shall reflect its state in `aria-pressed`. | `A2-005` |
| `A2-R5` | When the New Ranch link is rendered, PET Tiger shall preserve the list's current URL search suffix on it. | `A2-006` |
| `A2-R6` | When the Active toggle is flipped inline, PET Tiger shall apply the change, and when Undo is used it shall restore the prior value. | `A2-007` |
| `A2-R7` | When a Worker Comp Code is edited inline, PET Tiger shall apply the change, and when Undo is used it shall revert it. | `A2-008` |
| `A2-R8` | Where rows are multi-selected and "Apply to all" is chosen, PET Tiger shall propagate the inline edit to every selected row. | `A2-009` |
| `A2-R9` | Where rows are multi-selected and "Just this row" is chosen, PET Tiger shall limit the inline edit to the directly-edited row. | `A2-010` |
| `A2-R10` | When the Name filter or a sortable column header changes, PET Tiger shall reflect that state in the list URL. | `A2-011`, `A2-012` |

### Ranch boundary

| id | Requirement | Cases |
|---|---|---|
| `A2-R11` | When a ranch is opened for edit, PET Tiger shall render the boundary section's Edit Map control and a collapsed Advanced disclosure. | `A2-013` |
| `A2-R12` | When Edit Map is activated, PET Tiger shall open the full-screen boundary map editor, and shall close it on Escape. | `A2-013` |
| `A2-R13` | When the Advanced disclosure is expanded, PET Tiger shall expose the raw point and polygon text inputs. | `A2-013` |
| `A2-R14` | When a polygon or point is saved through the Advanced text fallback, PET Tiger shall persist it and round-trip it on reload. | `A2-014` |

### Field list

| id | Requirement | Cases |
|---|---|---|
| `A2-R15` | When the Field list is opened, PET Tiger shall render its documented column headers. | `A2-015` |
| `A2-R16` | PET Tiger shall link each field row's edit-icon column to that field's own record. | `A2-016` |
| `A2-R17` | When Multi Update is toggled, PET Tiger shall reflect its state in `aria-pressed`. | `A2-017` |
| `A2-R18` | When the New Field link is rendered, PET Tiger shall preserve the list's current URL search suffix on it. | `A2-018` |
| `A2-R19` | When the insights strip is expanded or shrunk, PET Tiger shall reflect that state in the list URL. | `A2-019` |
| `A2-R20` | When the Active toggle is flipped inline, PET Tiger shall apply the change, and when Undo is used it shall restore the prior value. | `A2-020` |
| `A2-R21` | Where rows are multi-selected and "Apply to all" is chosen, PET Tiger shall propagate the inline edit to every selected row. | `A2-021` |
| `A2-R22` | Where rows are multi-selected and "Just this row" is chosen, PET Tiger shall limit the inline edit to the directly-edited row. | `A2-022` |
| `A2-R23` | When the Code filter is typed into, PET Tiger shall reflect it in the list URL. | `A2-023` |
| `A2-R24` | When a sortable column header is clicked, PET Tiger shall reflect the sort in the list URL. | `A2-024` |

### Crop form

| id | Requirement | Cases |
|---|---|---|
| `A2-R25` | When the new Crop form is opened, PET Tiger shall render the Name, Export Identifier and Active fields. | `A2-025` |
| `A2-R26` | While the Crop form's required Name is absent, PET Tiger shall keep Save disabled. | `A2-026` |
| `A2-R27` | When Name is blurred on the new Crop form, PET Tiger shall auto-populate Export Identifier from it. | `A2-027` |
| `A2-R28` | Where Export Identifier was pre-filled, PET Tiger shall not overwrite it on a Name blur. | `A2-028` |
| `A2-R29` | When a dirty new-Crop form is cancelled and the discard confirmed, PET Tiger shall return to the Crop list. | `A2-029` |
| `A2-R30` | When a new Crop is discarded, PET Tiger shall not persist or list it. | `A2-029` |
| `A2-R31` | If a Crop Name duplicates an existing crop, then PET Tiger shall block the save client-side and remain on the create form. | `A2-030` |
| `A2-R32` | If a duplicate Crop is submitted anyway, then PET Tiger shall map the server's 409 to an inline Name error and an error summary. | `A2-031` |
| `A2-R33` | When Name is blurred on the new Crop form, PET Tiger shall run the uniqueness check before submission. | `A2-032` |
| `A2-R34` | When an existing Crop is opened for edit, PET Tiger shall load its saved Name and Export Identifier. | `A2-033` |
| `A2-R35` | When an existing Crop is opened for edit, PET Tiger shall render Name read-only. | `A2-034` |
| `A2-R36` | When an existing Crop is opened for edit, PET Tiger shall render Export Identifier read-only. | `A2-034` |
| `A2-R37` | When an existing Crop is opened for edit, PET Tiger shall render its traceability assignment sections. | `A2-035` |
| `A2-R38` | When the edit Crop form is cancelled, PET Tiger shall return to the Crop list. | `A2-036` |
| `A2-R39` | If a Crop id that does not exist is opened, then PET Tiger shall display a not-found error. | `A2-037` |

### Variety form

| id | Requirement | Cases |
|---|---|---|
| `A2-R40` | When the new Variety form is opened, PET Tiger shall render the Crop picker and the Name, Code, Export Identifier and Active fields. | `A2-038` |
| `A2-R41` | When the Crop picker is filtered, PET Tiger shall list crops sourced from the database. | `A2-039` |
| `A2-R42` | While the Variety form's required Name is absent, PET Tiger shall keep Save disabled. | `A2-040` |
| `A2-R43` | While a Crop has not been selected, PET Tiger shall keep Save disabled even when Name is present. | `A2-040` |
| `A2-R44` | When Crop and Name are set on the new Variety form, PET Tiger shall auto-populate Export Identifier from both. | `A2-041` |
| `A2-R45` | Where Export Identifier was pre-filled, PET Tiger shall not overwrite it. | `A2-042` |
| `A2-R46` | When a dirty new-Variety form is cancelled and the discard confirmed, PET Tiger shall return to the Variety list. | `A2-043` |
| `A2-R47` | When a new Variety is discarded, PET Tiger shall not persist or list it. | `A2-043` |
| `A2-R48` | If a Variety Name duplicates another variety under the same Crop, then PET Tiger shall reject it with a conflict error and remain on the create form. | `A2-044` |
| `A2-R49` | When an existing Variety is opened for edit, PET Tiger shall load its saved Name, Code and Export Identifier. | `A2-045` |
| `A2-R50` | When an existing Variety is opened for edit, PET Tiger shall render Name and Code read-only. | `A2-046` |
| `A2-R51` | When an existing Variety is opened for edit, PET Tiger shall render Export Identifier read-only. | `A2-046` |
| `A2-R52` | When an existing Variety is opened for edit, PET Tiger shall leave the Active toggle editable. | `A2-047` |
| `A2-R53` | When the edit Variety form is cancelled, PET Tiger shall return to the Variety list. | `A2-048` |
| `A2-R54` | If a Variety id that does not exist is opened, then PET Tiger shall display a not-found message. | `A2-049` |

### Traceability lookup lists

| id | Requirement | Cases |
|---|---|---|
| `A2-R55` | When the Grade list is opened, PET Tiger shall render its documented column headers. | `A2-050` |
| `A2-R56` | When Multi Update is toggled on the Grade list, PET Tiger shall reflect its state in `aria-pressed`. | `A2-050` |
| `A2-R57` | When the Grade list is opened, PET Tiger shall render the New Grade link. | `A2-051` |
| `A2-R58` | PET Tiger shall preserve the list's current sort suffix on the New Grade link. | `A2-051` |
| `A2-R59` | When the Variety list is opened, PET Tiger shall render the Crop foreign-key column under its alias label. | `A2-052` |
| `A2-R60` | When the Variety list is opened, PET Tiger shall render its documented column headers. | `A2-052` |
| `A2-R61` | When the Variety list's alias-aware header is rendered, PET Tiger shall show the Report button. | `A2-053` |
| `A2-R62` | PET Tiger shall label that control "Report", not the legacy "Print Report". | `A2-053` |
| `A2-R63` | When the Size list is opened, PET Tiger shall render its documented column headers including Bulk Item. | `A2-054` |
| `A2-R64` | When the Size list is opened, PET Tiger shall render the Quantity and Unit columns read-only. | `A2-054` |

### Variety creation

| id | Requirement | Cases |
|---|---|---|
| `A2-R65` | When a Variety is created, PET Tiger shall persist it under the selected Crop. | `A2-055` |
| `A2-R66` | When a Variety is created, PET Tiger shall default it to Active. | `A2-055` |
| `A2-R67` | When a Variety is created, PET Tiger shall persist its Name exactly as entered. | `A2-055` |
| `A2-R68` | When a Variety is created, PET Tiger shall derive its Export Identifier from the Crop and Name. | `A2-055` |
| `A2-R69` | When a Variety is created, PET Tiger shall assign it an auto-generated Code. | `A2-055` |

`A2-R70` onward is reserved for the unautomated `A2-001` journey.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Ranch list | `/setup/ranches` | `src/pages/setup/RanchListPage.ts` |
| Ranch form | `/setup/ranches/{new,:id}` | `src/pages/setup/RanchFormPage.ts` |
| Field list | `/setup/fields` | `src/pages/setup/FieldListPage.ts` |
| Crop form | `/setup/crops/{new,:id}` | `src/pages/webpet/setup/CropFormPage.ts` |
| Crop list | `/setup/crops` | `src/pages/webpet/setup/CropListPage.ts` |
| Variety form | `/setup/varieties/{new,:id}` | `src/pages/webpet/setup/VarietyFormPage.ts` |
| Variety list | `/setup/varieties` | `src/pages/setup/VarietyListPage.ts` |
| Grade / Size lists | `/setup/traceability/{grades,sizes}` | `src/pages/setup/TraceLookupListPage.ts` |

`CropFormPage`, `CropListPage` and `VarietyFormPage` are still under
`src/pages/webpet/` and imported across the tree, because `mobile-tab-labels`,
`setup-batch-b-smoke` and `parent-picker` still use them. Per the rule set in
batch 3, a page object moves only in the batch that relocates its **last**
web-pet consumer. `TraceLookupListPage` is parameterised — route and title are
constructor arguments, so one class serves both lookups.

## Parallelism

`fullyParallel: true` at `workers: 2` splits a file's tests across workers, so
`test.describe.configure({ mode: 'serial' })` is load-bearing wherever tests share
mutable rows:

| Spec | Serial | Why |
|---|---|---|
| `a02-ranch-list` | yes | inline and multi-row edits mutate then Undo-restore shared rows |
| `a02-field-list` | yes | same |
| `a02-trace-lists` | yes | carried over from the source spec |
| `a02-ranch-boundary` | **no** | isolation is the point — see below |
| `a02-crop-form` | no | every record provisioned in `beforeAll`; no test reads another test's record |
| `a02-variety-form` | no | same |
| `a02-variety-create` | no | single test |

**The boundary polygon round-trip was un-skipped here.** It was skipped in web-pet
as unstable in the full serial suite, and its own skip reason prescribed isolating
it into a non-serial file — which is what `a02-ranch-boundary.spec.ts` is. If it
proves flaky, restore the skip and set `A2-014` to `enabled=0` citing
`TRIAGE-DELLLANO` / WEBPET-831. Do not weaken the round-trip assertions to keep it
green.

## Assertions that depend on English text

`base.fixture` has no `pt.locale` pin, unlike the web-pet fixture. A positive
assertion on English copy fails loudly and is acceptable; a bare absence assertion
passes vacuously and is not. Three anchored negatives carry the pairing and their
order must not change:

* `A2-002` — `titleText` visible, then the misspelled title absent.
* `A2-029` — the crop grid root visible, then `cropNamed('ShouldNotBeSaved')` absent.
* `A2-043` — the variety grid root visible, then `varietyNamed('ShouldNotBeSaved')` absent.

The searched names are test-authored literals, not translated UI copy, so they
carry no locale risk of their own — the anchor is what proves the grid rendered.

## Data

* **Factories** — `src/data/generated/data-factory.ts` (`ensureRanch`,
  `ensureField`, `ensureCrop`, `ensureVariety`, `deleteVariety`, …), taking an
  `APIRequestContext`, so both suites use them unchanged.
* **Provisioning** — every spec provisions in `beforeAll` through `sessionApi`,
  which supplies `Origin` and `X-CSRF-Token`. No spec depends on a seeded row by
  name.
* Ranch list and field list mutate their own provisioned rows and restore them via
  Undo within the same test.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The `Windows` module — A2's catalog module, licensed on dev staging.
- [ ] The session user needs create and edit rights on ranches, fields, crops and
      varieties.

## Cleanup

`a02-variety-create` deletes its variety through `deleteVariety(sessionApi, …)`.
The list specs restore their inline edits via Undo. Crop and variety form specs
delete their factory records in `afterAll`.

## Test cases

`src/data/runner/journey-a.csv`, rows `A2-002`…`A2-055`, all `workflow=A2`,
`journey=A`, `category=ui`, `segments=all`, `modules=Windows`, `status=automated`,
`enabled=1`.

| ids | Spec | Group |
|---|---|---|
| `A2-002`…`A2-012` | `a02-ranch-list` | chrome, inline edit, multi-edit, URL state |
| `A2-013`, `A2-014` | `a02-ranch-boundary` | boundary editor and polygon round-trip |
| `A2-015`…`A2-024` | `a02-field-list` | chrome, inline edit, multi-edit, URL state |
| `A2-025`…`A2-037` | `a02-crop-form` | new form, edit form |
| `A2-038`…`A2-049` | `a02-variety-form` | new form, edit form |
| `A2-050`…`A2-054` | `a02-trace-lists` | grade, variety and size lookup lists |
| `A2-055` | `a02-variety-create` | end-to-end create with a persisted-state assertion |

`A2-055` is the workflow's single `@Smoke` case — it is the only test that creates
a record end to end and asserts the persisted result, which is what a smoke run
should prove. Nine list- and form-render cases carry `@HighLevel`; the rest are
`@Regression`.

## Open questions for the tester

- [ ] `A2-001` is the real prize: an end-to-end ranch → field → crop → variety
      build in one journey, plus an assertion that field capture resolves against
      it. Until it exists A2 cannot honestly claim journey depth.
- [ ] Is the boundary polygon round-trip stable outside the serial suite? Track
      `A2-014` over the next few runs before trusting it.
- [ ] Ranch and field multi-edit are D7's only automated evidence, recorded in
      D7's coverage-map note rather than in a row. If D7 gains its own spec, decide
      whether these tests should be cited there too.
