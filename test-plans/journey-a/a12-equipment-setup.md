# A12 · Equipment setup

The Equipment record — identity, the required Equipment Type foreign key, the
fields the app locks after first save, and the create-form validation gate.

| | |
|---|---|
| Workflow | `A12` — Equipment setup |
| Journey | A — Setup |
| Module | Equipment |
| Coverage depth | `screens` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A12-001`…`A12-012` |

`A12-001` remains a `draft`, `enabled=0` row describing the end-to-end equipment
build. `A12-002`…`A12-012` were relocated from `tests/webpet/equipment.spec.ts`
(WP-0159…WP-0169). The requirements below were written from their assertions —
they describe what the 11 tests actually prove.

## Why the coverage depth stays `screens`

The catalog's equipment workflow registers equipment for **cost accounting,
contractor billing and hours-of-use tracking** — asset tracking, not payroll.
These tests cover the form, its validation gate, the Equipment Type picker and
the read-only field set after first save. **Hourly cost is only ever asserted to
be editable; no cost figure is entered, saved or read back, and no hours-of-use
or billing behaviour is exercised at all.** That is the workflow's substance, so
`A12-001` stays the reserved slot and the depth stays `screens`.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `A12-R1` | When the new Equipment form is opened, PET Tiger shall render the Name input, the Equipment Type picker and the Active checkbox. | `A12-002` |
| `A12-R2` | When the Equipment Type picker is opened on the new Equipment form, PET Tiger shall list the equipment types that exist in the system. | `A12-003` |
| `A12-R3` | While Name and Equipment Type are not both provided on the new Equipment form, PET Tiger shall keep Save disabled. | `A12-004` |
| `A12-R4` | When Name is blurred on the new Equipment form, PET Tiger shall populate Export Identifier with the Name value. | `A12-005` |
| `A12-R5` | When a dirty new Equipment form is discarded, PET Tiger shall return to the Equipment list without persisting the record. | `A12-006` |
| `A12-R6` | If a new Equipment's Name duplicates an existing record, then PET Tiger shall surface an error to the user. | `A12-007` |
| `A12-R7` | If a duplicate-name save is rejected, then PET Tiger shall keep the user on the create form with Save re-enabled. | `A12-007` |
| `A12-R8` | When an existing Equipment record is opened for edit, PET Tiger shall populate Name and Code from the saved record. | `A12-008` |
| `A12-R9` | When an existing Equipment record is opened for edit, PET Tiger shall render Name, Barcode and Export Identifier read-only and the Equipment Type picker disabled. | `A12-009` |
| `A12-R10` | When an existing Equipment record is opened for edit, PET Tiger shall leave the Active checkbox and Hourly Cost editable. | `A12-010` |
| `A12-R11` | When the edit Equipment form is cancelled, PET Tiger shall return to the Equipment list. | `A12-011` |
| `A12-R12` | If an Equipment id that does not exist is opened, then PET Tiger shall display a not-found message. | `A12-012` |

`A12-R13` onward is reserved for the unautomated `A12-001` journey.

### Why the two Cancel tests do not share a requirement

`A12-R5` and `A12-R11` look like one rule and are not. `A12-006` fills the form,
discards, **and then asserts the record is absent from the list** — it proves
non-persistence. `A12-011` cancels a pristine edit form and asserts navigation
only. Sharing an id would claim the edit-cancel test verifies non-persistence,
which it never checks.

### Why the duplicate-name test carries two

`A12-007` asserts two independently-failing things: that the failure is reported
at all (the error toast), and that the form is not abandoned (Save re-enabled and
the URL still `/setup/equipments/new`). Either can regress without the other.

`A12-R6` deliberately does **not** name the toast text — see below.

## The unpinned toast assertion is deliberate

`A12-007` asserts an error toast appears; it does not assert what the toast says.
That is a documented decision carried over from the source spec, not an oversight.

The Job screen names its conflict properly (*"A job with this Name already
exists…"*). This form was observed showing **"Couldn't reach the server. Check
your connection."** for a duplicate name that the API answers `409` in ~1.6s
(curl-verified). Pinning that string would enshrine wording that looks wrong;
pinning the correct string would fail today. So the assertion proves the user was
told *something* went wrong, and stops there.

Without it, "Save came back and the URL held" would also describe a form that
showed the user nothing at all — which is why the bare URL assertion is not
sufficient on its own.

**Open question for the product team:** does Equipment report a 409 as a network
error? If it is fixed, tighten `A12-R6` to name the message.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Equipment list | `/setup/equipments` | `src/pages/setup/EquipmentListPage.ts` |
| Equipment form | `/setup/equipments/{new,:id}` | `src/pages/webpet/setup/EquipmentFormPage.ts` |

`EquipmentListPage` moved to `src/pages/setup/` in this batch — this spec was its
last web-pet consumer. `EquipmentFormPage` stays under `src/pages/webpet/`:
`parent-picker.spec.ts` still uses it, and per the rule set in batch 3 a page
object moves only in the batch relocating its **last** web-pet consumer. The
Equipment Type picker is driven through `ParentPickerComponent`.

## Parallelism

No `mode: 'serial'`, and none should be added. The single Equipment record is
provisioned once per worker in `beforeAll`, and no test reads back a record
another *test* created — so serialising would only convert a failure into a
hidden skip.

## Data

* **Factory** — `src/data/generated/data-factory.ts` (`ensureEquipment`, which
  resolves a real Equipment Type FK, and `deleteEquipment`).
* The spec creates its own Equipment rather than depending on a seeded
  `"Forklift"`, which dev staging does not seed. Assert against the returned
  values, never a literal.
* `A12-007` reuses **the file's own** equipment name to trigger the server 409.
* Hooks run through `sessionApi`, which supplies the `Origin` header and CSRF
  token. The source used web-pet's overridden `request` fixture.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] At least one Equipment Type exists — `ensureEquipment` fails loudly if
      `GET /api/equipment-types` returns none.

## Cleanup

`afterAll` deletes the created Equipment through `sessionApi`. Nothing depends on
a seeded row, and nothing is left behind.

## Test cases

| ids | Group |
|---|---|
| `A12-002`…`A12-007` | new form: render, picker, Save gate, export identifier, cancel, duplicate |
| `A12-008`…`A12-012` | edit form: load, read-only set, editable set, cancel, not-found |

`A12-008` is the file's single `@Smoke` — the only test proving persisted state
round-trips back into the UI. The rest are `@Regression`.

## Notes on the relocated rows

Two source rows carried a stale `testDescription`. WP-0161 and WP-0164 both began
*"SKIPPED: …"*, describing a skip removed on 2026-08-06 — their own `notes`
column recorded the fix, and both tests have run and passed since. The behavioural
sentence was carried across verbatim; the false `SKIPPED` claim was dropped. It is
the one deliberate exception to reusing the authored text unchanged.

## Open questions for the tester

- [ ] `A12-001` needs cost accounting, contractor billing and hours-of-use to
      reach `journey` depth. None is automated.
- [ ] Hourly Cost is asserted editable but never given a value or read back.
- [ ] Does the duplicate-name 409 really surface as a connection error? See above.
