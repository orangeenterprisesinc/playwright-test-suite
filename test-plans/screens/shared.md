# Shared UI primitives

The building blocks several screens share rather than any one screen owning: the
**ParentPicker**, the form-field dirty/invalid contract, the migrated **Select**
primitives, the **language picker**, the mobile tab collapse, and a console
diagnostic.

No catalog journey reaches these, so no row carries a `workflow` or a `journey` —
see [README.md](README.md) for why inventing one would corrupt the catalog
coverage matrix.

All 36 tests were relocated from the web-pet suite (`parent-picker.spec.ts`
WP-0260…WP-0280, `form-field-states.spec.ts` WP-0207…WP-0212,
`select-smoke.spec.ts` WP-0368…WP-0371, `localization.spec.ts` WP-0239…WP-0241,
`mobile-tab-labels.spec.ts` WP-0242, `console-diagnostic.spec.ts` WP-0084). The
requirements below were written from their assertions.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/screens/shared/parent-picker.spec.ts` | `SCR-118`…`SCR-138` | the ParentPicker across nine consumer forms |
| `tests/web/screens/shared/form-field-states.spec.ts` | `SCR-139`…`SCR-144` | the dirty/invalid contract across six field primitives |
| `tests/web/screens/shared/select-smoke.spec.ts` | `SCR-145`…`SCR-148` | the Select migration — **serial** |
| `tests/web/screens/shared/localization.spec.ts` | `SCR-149`…`SCR-151` | the language picker on two surfaces |
| `tests/web/screens/shared/mobile-tab-labels.spec.ts` | `SCR-152` | tab strip collapse at a narrow viewport |
| `tests/web/screens/shared/console-diagnostic.spec.ts` | `SCR-153` | console harvest — **always green by design** |

### Why six files rather than a consolidation

Batch 7 folded six one-test inventory files into one. That precedent does not
apply here, and following it would have been a semantic change.

Four of these six own **module-level `beforeAll`/`afterAll` hooks provisioning
different entities** — parent-picker builds a department, two crops, a variety, a
ranch and a field; form-field-states a crew; select-smoke a crew and a
paymentType-8 job; mobile-tab-labels a crop. Module-level hooks fire for every
test in the file, so merging would couple one source's provisioning and
FK-ordered cleanup to another source's tests.

`select-smoke` additionally must stay alone because it declares `mode: 'serial'`.
Under serial an earlier failure turns later tests into **skips**, so merging a
non-serial test into it would silently change how that test reports failure.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `SCR-R150` | When the user opens a combobox-mode ParentPicker on a consumer form, PET Tiger shall list real records, and on selection shall place the chosen name in the combobox input. | `SCR-118`, `SCR-120`, `SCR-123`, `SCR-124` |
| `SCR-R151` | While a combobox-mode ParentPicker is open, when the user types text matching no record PET Tiger shall hide the non-matching options, and when the user types a matching prefix shall show them again. | `SCR-118`, `SCR-120` |
| `SCR-R152` | Where a combobox-mode ParentPicker backs a nullable field and holds a value, PET Tiger shall offer a clear control that empties the input. | `SCR-119` |
| `SCR-R153` | Where a ParentPicker registers a create-from-name handler, when the user types a name matching no record PET Tiger shall offer to create it. | `SCR-121`, `SCR-130` |
| `SCR-R154` | Where a ParentPicker registers a create-from-name handler, when the user types a name that already exists PET Tiger shall not offer to create it. | `SCR-122` |
| `SCR-R155` | Where a combobox-mode ParentPicker registers no create-from-name handler, PET Tiger shall list real options and shall never offer to create one. | `SCR-128`, `SCR-133`, `SCR-134` |
| `SCR-R156` | When the user opens a sheet-mode ParentPicker, PET Tiger shall list its real options, excluding the hidden sentinel entry. | `SCR-125`, `SCR-126`, `SCR-127`, `SCR-129` |
| `SCR-R157` | When the user changes the parent selection of a cascading picker pair, PET Tiger shall refilter the dependent picker to the new parent's children and clear the dependent picker's current selection. | `SCR-131`, `SCR-137` |
| `SCR-R158` | When the user opens a consumer form or its picker-bearing tab, PET Tiger shall render every registered ParentPicker field in its registered mode. | `SCR-132`, `SCR-135`, `SCR-136` |
| `SCR-R159` | When the user opens a combobox rendered inside a record-edit sheet, PET Tiger shall portal the popup to the document root and list its options. | `SCR-138` |
| `SCR-R160` | When the user edits any bound field primitive inside a form — Input, Switch, Checkbox, either ParentPicker mode, or the colour picker — PET Tiger shall mark the visible control dirty, having started clean. | `SCR-139`…`SCR-144` |
| `SCR-R161` | When the user clears a required Input and blurs it, PET Tiger shall mark it invalid on blur, without a submit. | `SCR-139` |
| `SCR-R162` | When the user opens a crew edit form, PET Tiger shall render its five boolean fields as Switches. | `SCR-145` |
| `SCR-R163` | When the user opens a crew edit form, PET Tiger shall render the form root and its Department picker row. | `SCR-146` — **capture-only** |
| `SCR-R164` | When the user opens a Non-Labor job's edit form, PET Tiger shall render the Payment Type select with an openable popup, expose Include Idle Time as a tri-state checkbox, and open the Crops tab add-row select. | `SCR-147` |
| `SCR-R165` | When the user opens the crew list, PET Tiger shall render the column-filter Select with an openable popup and engage the Multi-Update selection toggle. | `SCR-148` |
| `SCR-R166` | When the user opens the language picker — the header user menu's Language submenu or the Profile Personal Details select — PET Tiger shall list System, English, Spanish and Spanish (Mexico). | `SCR-149`, `SCR-151` |
| `SCR-R167` | When the user picks the System language sentinel, PET Tiger shall send a null language to the user endpoint. | `SCR-150` |
| `SCR-R168` | When the user opens a crop edit form at a narrow viewport, PET Tiger shall collapse the tab strip into a Select whose trigger opens. | `SCR-152` — proven only by the click succeeding; the **labels are captured, never asserted** |
| `SCR-R169` | When the diagnostic navigates the fields list and profile routes, PET Tiger shall complete both navigations while console output is harvested to the run log. | `SCR-153` — **always green by design** |

`SCR-R170`–`SCR-R199` stay free inside this area's reserved block.

### Where requirements were shared, and where they deliberately were not

Shared only where the assertion is identical apart from the screen noun — the
same rule the inventory plan sets. `SCR-R150` covers four consumer forms;
`SCR-R156` four sheet pickers; `SCR-R160` six field primitives, which is one
product rule with per-primitive traceability carried by the rows.

Kept apart where the rules genuinely differ. Type-to-filter (`SCR-R151`) is not
folded into load-and-select (`SCR-R150`) because the load-only tests never assert
filtering. And the create-from-name behaviour is **three** rules, not one: offered
for an unknown name (`R153`), withheld for an existing one (`R154`), and never
offered at all where no handler is registered (`R155`). Merging them would let a
regression in one pass as another.

## Three tests assert nothing, by design

`SCR-146`, `SCR-152` and `SCR-153` are **capture-only**: they drive a flow, write
screenshots or harvest console output for human review, and assert nothing.
`SCR-153` ends `expect(true).toBe(true)`; the other two import no `expect` at all —
`mobile-tab-labels.spec.ts` deliberately imports only `test`, which is how the
relocation surfaced it (adding `expect` to that import failed typecheck as unused).

They are not equally weak. `SCR-152` and `SCR-146` still fail loudly if a locator
they click is absent, so the flow itself is proven. `SCR-153` cannot fail at all.

They were moved exactly as they are. Adding an assertion during a relocation
would change what the test proves, and these exist to produce artefacts a person
reads. **Their rows are `enabled=1` and the traceability matrix counts them** —
that is worth knowing when reading this area's coverage, and it is why the three
requirements above are marked rather than left to look like ordinary coverage.

`SCR-153` in particular can never fail. It is a diagnostic harvester, not a test,
and it is recorded as such rather than quietly dropped.

## A known title/assertion gap

`SCR-129`'s title says the customer State sheet *"loads real states and offers no
Create"*, but its body asserts only that a known state option is visible — it
never asserts the create affordance is absent. `SCR-R156` is written to match the
**assertion**, not the title.

The gap is recorded rather than closed: adding the missing assertion during a
relocation would change what the test proves, and it belongs to the edge-case
phase. Do not read the title as a specification here.

## Locale sensitivity

`base.fixture` does **not** pin `pt.locale`, and — unlike the web-pet fixture
these specs came from — it does not rewrite `/api/session/me` to force
`language: 'en'` either. The localization spec's header was corrected on arrival,
because a stale claim about fixture behaviour would misdirect whoever triages the
next failure.

Every English-copy assertion in this batch is **positive** ('Edit Ranch', 'Group
Clock-In Times', the locale option labels), so under a non-English session they
fail loudly rather than passing vacuously. The absence assertions — the "no
Create offered" checks in `SCR-122`, `SCR-128`, `SCR-133` and `SCR-134` — are each
anchored by a positive in-popup assertion first, so none is vacuous.

If any of these ever reds because of locale, the fix is a locale-neutral locator,
never a weakened assertion.

`SCR-150` issues a real update setting the signed-in shared user's language to the
System sentinel. Web-pet ran this too, but there is no longer an English pin
downstream, so System resolves through the browser locale.

## Screens and page objects

Nine consumer forms are driven here. Eight page objects moved to their journey
homes in this batch — `CrewListPage`, `CropFormPage`, `FieldFormPage`,
`EmployeeFormPage`, `JobFormPage`, `VarietyFormPage`, `EquipmentFormPage` under
`src/pages/setup/`, and `UsersFormPage` under `src/pages/settings/`.

`ParentPickerComponent` stays at `src/components/webpet/` — eight page objects
import it and two of those (`CrewFormPage`, `CustomerFormPage`) are still consumed
by `notifications.spec.ts` until batch 12. `EntitySheetComponent` and
`EmployeeDocumentsComponent` moved to `src/components/` with their sole consumers.

**`EmployeeDocumentsComponent` still carries the open `A5-018` locator defect**
(see [a05-employee-setup.md](../journey-a/a05-employee-setup.md)). Relocating it
moved the defect; it did not fix it.

## Parallelism

`select-smoke.spec.ts` declares `test.describe.configure({ mode: 'serial' })`
inside its describe, carried over verbatim. Nothing else does, and nothing should
gain it: parent-picker provisions its records in `beforeAll` and its tests only
read them back, so serialising would convert a failure into a hidden skip.

## Data

Four specs provision their own records through `sessionApi` in `beforeAll` and
delete them child-first in `afterAll`. Nothing depends on a seeded row.

`SCR-146`, `SCR-152` and `SCR-153` write screenshots and log output under the
run's artefact directory.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.

## Open questions for the tester

- [ ] `SCR-129`'s title promises an assertion its body does not make — close the
      gap or reword the title.
- [ ] Should the three capture-only tests count as coverage? They are `enabled=1`
      today, so the matrix counts them. Marking them `enabled=0` would be honest
      about assertions but would stop the artefacts being produced.
- [ ] `SCR-153` can never fail. It is useful as a harvester; it is not a test.
