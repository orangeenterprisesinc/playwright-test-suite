# Setup records

The four Setup record screens that no catalog journey reaches: **Customer**,
**Department**, **Billing Center** and **Terms**. All four are list + form CRUD
screens; the coverage here is form-centric, because the list pages moved to
`tests/webpet/setup-batch-b-smoke.spec.ts` during the PET-424 DataGrid migration
and did not come with them.

No catalog journey reaches these screens, so no row carries a `workflow` or a
`journey` — see `test-plans/screens/README.md` for why inventing one would
corrupt the catalog coverage matrix.

All four specs were relocated here from the web-pet suite (`customer.spec.ts`
WP-0109…WP-0125, `department.spec.ts` WP-0134…WP-0143, `billing-center.spec.ts`
WP-0001…WP-0006 / PET-213, `term.spec.ts` WP-0377 / PET-214). The requirements
below were written from their assertions, not the other way round — they describe
what the 34 tests actually prove.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/screens/records/customer.spec.ts` | `SCR-078`…`SCR-094` | new form, edit form, and the contacts sub-form's four validators |
| `tests/web/screens/records/department.spec.ts` | `SCR-095`…`SCR-104` | new form, edit form, and the read-only field set |
| `tests/web/screens/records/billing-center.spec.ts` | `SCR-105`…`SCR-110` | new and edit form — **module-gated on GrowerBilling** |
| `tests/web/screens/records/term.spec.ts` | `SCR-111` | list renders, or the sidebar entry is hidden — **module-gated on GrowerBilling** |

Customer and Department are near-identical screens that differ in exactly the
places these tests pin: Customer locks only `Name` on edit where Department locks
`Name`, `Code` and `Export Identifier`; Customer leaves `Export Identifier` empty
on a Name blur where Department auto-populates it. That is why the two screens get
separate requirement blocks instead of a shared "Save gate" id — a shared id would
blur the difference the tests exist to prove.

## Two defects this batch fixes

### 1. Two tests that never ran

The pinned run `docs/catalog/runs/31692620907-webpet.json` records billing-center as
**4 passed, 2 skipped**, and the live run before this batch reproduced it exactly.
The two skips are the edit-form pair, which skip when no record named `TEST_NAME`
exists — a record the *create* test makes.

The cause is an order dependency, not a missing module. The config is
`fullyParallel: true` at `workers: 2`, which splits a single file's tests across
workers, so the edit tests ran **concurrently with** the create test and looked for
its record before it existed. The run output shows it directly: tests 6 and 7
reported skipped while test 5, the create, was still running.

So `SCR-109` and `SCR-110` had never executed on any recorded run. Both describes are
one ordered sequence, which the file now declares with
`test.describe.configure({ mode: 'serial' })`. All six billing-center tests pass.

This is the failure mode a skip count hides: the suite was green, and two of its
requirements — `SCR-R140` and `SCR-R141` — were unproven every time.

### 2. Guards that could report *passed* while asserting nothing

Billing Center and Terms are gated on the `GrowerBilling` module; when it is absent
every route returns HTTP 403, which the source specs handled like this:

```ts
if (!(await form.gotoNewOrForbidden())) return;   // reports PASSED, asserts nothing
```

`GrowerBilling` **is** licensed on dev staging — verified live, all seven module-gated
tests execute their assertions — so this guard was latent rather than active. But it is
still wrong: the day the module is unlicensed, or a route 403s for any other reason,
seven tests would go green having tested nothing, and the run report could not show it.

Every such guard is now `test.skip(true, '<reason naming GrowerBilling>')`. No bare
`return` guard survives in either file, so reading a run report is unambiguous:

* **skipped**, reason names GrowerBilling → the module is off; the test did not run.
* **passed** → the assertions ran.

Neither fix is backported to web-pet, whose rows this batch deletes.

## Acceptance criteria (EARS)

### Customer

| id | Requirement | Cases |
|---|---|---|
| `SCR-R100` | When the new Customer form is opened, PET Tiger shall render the Name input, the Customer Type picker and the Active checkbox. | `SCR-078` |
| `SCR-R101` | When the Customer Type picker is filtered, PET Tiger shall list a matching customer type sourced from the database. | `SCR-079` |
| `SCR-R102` | While the Customer form's Name is empty or invalid, PET Tiger shall keep Save disabled, and shall enable Save once Name is valid and blurred. | `SCR-080` |
| `SCR-R103` | When Name is blurred on the new Customer form and Export Identifier has not been touched, PET Tiger shall leave Export Identifier empty. | `SCR-081` |
| `SCR-R104` | Where Export Identifier was filled manually before Name was set, PET Tiger shall not overwrite it. | `SCR-082` |
| `SCR-R105` | When a dirty new-Customer form is cancelled and the discard confirmed, PET Tiger shall return to the Customer list. | `SCR-083` |
| `SCR-R106` | When an unsaved new Customer is discarded, PET Tiger shall not persist it in the Customer list. | `SCR-083` |
| `SCR-R107` | If a new Customer's Name duplicates an existing customer, then PET Tiger shall reject the save and keep the user on the create form. | `SCR-084` |
| `SCR-R108` | When the edit form is opened for an existing Customer, PET Tiger shall load and display that customer's Name. | `SCR-085` |
| `SCR-R109` | When the edit form is opened for an existing Customer, PET Tiger shall render Name read-only. | `SCR-086` |
| `SCR-R110` | When the edit form is opened for an existing Customer, PET Tiger shall leave Code and Export Identifier editable. | `SCR-086` |
| `SCR-R111` | When the edit form is opened for an existing Customer, PET Tiger shall render the Active checkbox enabled. | `SCR-087` |
| `SCR-R112` | When the edit Customer form is cancelled, PET Tiger shall return to the Customer list. | `SCR-088` |
| `SCR-R113` | If a Customer id that does not exist is opened, then PET Tiger shall display an error message. | `SCR-089` |
| `SCR-R114` | While the Customer contact add-row has no value, PET Tiger shall keep the contact Add button disabled. | `SCR-090` |
| `SCR-R115` | If an E-mail contact with a malformed address is appended, then PET Tiger shall keep Save disabled. | `SCR-091` |
| `SCR-R116` | If a Web page contact with a malformed URL is appended, then PET Tiger shall keep Save disabled. | `SCR-092` |
| `SCR-R117` | If a Phone contact with a malformed value is appended, then PET Tiger shall keep Save disabled. | `SCR-093` |
| `SCR-R118` | When a Phone contact with a valid value is appended, PET Tiger shall enable Save. | `SCR-094` |

### Department

| id | Requirement | Cases |
|---|---|---|
| `SCR-R120` | When the new Department form is opened, PET Tiger shall render Name, Export Identifier, the Active switch, First Day of Week and Crew Required. | `SCR-095` |
| `SCR-R121` | While the Department form's Name is empty or invalid, PET Tiger shall keep Save disabled, and shall enable Save once Name is valid and blurred. | `SCR-096` |
| `SCR-R122` | When Name is blurred on the new Department form, PET Tiger shall auto-populate Export Identifier from Name. | `SCR-097` |
| `SCR-R123` | When a dirty new-Department form is cancelled and the discard confirmed, PET Tiger shall return to the Department list. | `SCR-098` |
| `SCR-R124` | When an unsaved new Department is discarded, PET Tiger shall not persist it in the Department list. | `SCR-098` |
| `SCR-R125` | If a new Department's Name duplicates an existing department, then PET Tiger shall reject the save and keep the user on the create form. | `SCR-099` |
| `SCR-R126` | When the edit form is opened for an existing Department, PET Tiger shall load and display its Name and Code. | `SCR-100` |
| `SCR-R127` | When the edit form is opened for an existing Department, PET Tiger shall render Name, Code and Export Identifier read-only. | `SCR-101` |
| `SCR-R128` | When the edit form is opened for an existing Department, PET Tiger shall leave First Day of Week and Crew Required editable. | `SCR-102` |
| `SCR-R129` | When the edit Department form is cancelled, PET Tiger shall return to the Department list. | `SCR-103` |
| `SCR-R130` | If a Department id that does not exist is opened, then PET Tiger shall display an error message. | `SCR-104` |

### Billing Center

| id | Requirement | Cases |
|---|---|---|
| `SCR-R135` | Where the GrowerBilling module is licensed, PET Tiger shall render the Name field on the new Billing Center form. | `SCR-105` |
| `SCR-R136` | While the Billing Center form's Name is empty or invalid, PET Tiger shall keep Save disabled, and shall enable Save once Name is valid and blurred. | `SCR-106` |
| `SCR-R137` | When the new Billing Center form is cancelled, PET Tiger shall return to the Billing Center list. | `SCR-107` |
| `SCR-R138` | When a valid new Billing Center is saved, PET Tiger shall navigate to that record's edit form. | `SCR-108` |
| `SCR-R139` | When a Billing Center has been saved once, PET Tiger shall render its Name field read-only thereafter. | `SCR-108` |
| `SCR-R140` | When the edit form is opened for an existing Billing Center, PET Tiger shall render Name read-only. | `SCR-109` |
| `SCR-R141` | When the Active toggle is flipped on an existing Billing Center and saved, PET Tiger shall persist the change and return to the Billing Center list. | `SCR-110` |

### Terms

| id | Requirement | Cases |
|---|---|---|
| `SCR-R145` | Where the GrowerBilling module is licensed, PET Tiger shall render the Terms list heading and the New Term affordance. | `SCR-111` |
| `SCR-R146` | Where the GrowerBilling module is not licensed, PET Tiger shall hide the Terms entry from the sidebar navigation. | `SCR-111` |

Unused within the allocated blocks: `SCR-R119`, `SCR-R131`…`SCR-R134`,
`SCR-R142`…`SCR-R144`, `SCR-R147`…`SCR-R149`. They are deliberate headroom for
the edge/negative-case phase, so a later case can extend a screen without
renumbering the block or spilling into the next one.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Customer list | `/setup/customers` | `src/pages/setup/CustomerListPage.ts` |
| Customer form | `/setup/customers/:id` | `src/pages/webpet/setup/CustomerFormPage.ts` |
| Department list | `/setup/departments` | `src/pages/webpet/setup/DepartmentListPage.ts` |
| Department form | `/setup/departments/:id` | `src/pages/webpet/setup/DepartmentFormPage.ts` |
| Billing Center form | `/setup/billing-centers/:id` | `src/pages/setup/BillingCenterFormPage.ts` |
| Terms list | `/setup/terms` | `src/pages/setup/TermListPage.ts` |
| App shell / sidebar | — | `src/pages/webpet/shell/AppShellPage.ts` |

Four of these are still under `src/pages/webpet/`, which is deliberate. A page
object moves to its journey home in the batch that relocates its **last** remaining
web-pet consumer; until then `pages.fixture.ts` imports it across the tree, exactly
as batch 2 did for `ToastComponent`. `CustomerFormPage` is still used by
`parent-picker.spec.ts` and `notifications.spec.ts`; `DepartmentFormPage`,
`DepartmentListPage` and `AppShellPage` likewise.

The alternative rule — move every page object with its first consumer — does not
scale here: `parent-picker.spec.ts` alone touches eight page objects spanning most
of the remaining batches, so it would collapse them all into one.

## Assertions that still depend on English text

`base.fixture` does not pin `pt.locale`, where the web-pet fixture did. The rule
carried over from batch 2: a positive assertion on English copy fails *loudly*
under a locale mismatch and is acceptable; a bare absence assertion on English copy
passes *vacuously* and is not.

* `SCR-083` and `SCR-098` assert the grid root is visible **before** asserting the
  discarded record is absent. That ordering is what stops the vacuous pass — do not
  reorder it. The names they search for (`ShouldNotBeSaved`) are run-authored
  literals, not translated UI copy, so they carry no locale risk of their own.
* `SCR-111` asserts `navLink('terms')` has count 0, which is inherently English —
  it matches the literal word "Terms". It is paired with a positive
  `shell.sidebarNav` visible anchor, so it cannot pass merely because the sidebar
  failed to render. A fully locale-neutral fix needs a page-object change and was
  left out of the relocation.
* All other text assertions here are positive (`notFoundMessage`, `saveButton`,
  `heading`, `newTermButton`, the contact-type option labels).

## Data

* **Factories** — `src/data/generated/data-factory.ts` (`ensureCustomer`,
  `deleteCustomer`, `ensureDepartment`, `deleteDepartment`). This batch moved that
  file out of `tests/webpet/`, where it was the migration's widest shared
  dependency: 20 of the remaining web-pet specs import it. It takes an
  `APIRequestContext` parameter and is fixture-agnostic, so both suites use it
  unchanged.
* **Run-unique identities** — Billing Center mints `_PET213TestBillingCenter_<token>`
  per run. `Customer_Name_Unique` and the Code / ExportIdentifier constraints are
  **not** filtered by `Deleted`, so a soft-deleted ghost from an earlier run
  permanently owns a fixed name and the create silently 500s. Never replace the
  token with a fixed literal.
* Customer and Department clone an existing record via the API rather than
  depending on a seeded row, so the ~10 create-time validators are satisfied by
  construction.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] `sessionApi` for `beforeAll`/`afterAll` provisioning — it supplies `Origin`
      and `X-CSRF-Token`, which the web-pet fixture's `request` override hand-rolled.
- [x] `GrowerBilling` in `PT_MODULES` for `SCR-105`…`SCR-111`. **Licensed on dev
      staging** — verified live 2026-08-16; all seven execute their assertions. If it
      is ever unlicensed they skip with a reason naming the module rather than
      passing silently.
- [ ] The session user needs create/edit rights on Customer and Department.

## Cleanup

Customer and Department delete their own record in `afterAll` via the API.
Billing Center creates `_PET213TestBillingCenter_<token>` and does **not** delete
it — carried over from the source spec, which is why the name is run-unique.
Terms is read-only.

## Test cases

`src/data/runner/screens.csv`. All 34 rows are `regression`, `enabled=1`,
`status=automated`, and carry no `workflow`/`journey`.

| id range | Spec | Group |
|---|---|---|
| `SCR-078`…`SCR-084` | customer | new form |
| `SCR-085`…`SCR-089` | customer | edit form |
| `SCR-090`…`SCR-094` | customer | contacts sub-form validators |
| `SCR-095`…`SCR-099` | department | new form |
| `SCR-100`…`SCR-104` | department | edit form |
| `SCR-105`…`SCR-108` | billing centre | new form |
| `SCR-109`, `SCR-110` | billing centre | edit form |
| `SCR-111` | term | list page |

The `modules` column is empty on every row even though seven tests are module-gated:
`runner:check` validates that column against `catalog.modules`, and `GrowerBilling`
is not a registered catalog module. The gate is expressed in the `testDescription`
and in the skip reason instead.

**No row carries `smoke`.** Six did in the web-pet vocabulary — two each in
customer and department, one each in billing-center and term. The tier was dropped
rather than arbitrarily reassigned, on the same reasoning as bonus: `runner:check`
allows one `@Smoke` per file and treats it as *the* happy path. If records should
gate a smoke run, the natural candidates are `SCR-078` and `SCR-095` (each screen's
new form renders its expected fields); make that a deliberate choice.

## Open questions for the tester

- [ ] Billing Center leaves its created record behind — every run adds one, and now
      that `SCR-108` actually reaches the create, it does so on every run. Worth an
      `afterAll` delete, or an `ensureBillingCenter` factory so the edit tests
      provision their own record and the file can drop `serial` mode.
- [ ] Are there other files with the same intra-file order dependency? Any spec whose
      later tests read back a record an earlier test created is racing under
      `fullyParallel`, and the symptom is a *skip*, not a failure — so it hides. Worth
      a sweep of the remaining web-pet specs before they relocate.
- [ ] Should records own a `@Smoke` case at all? See the note above.
- [ ] `SCR-111` bundles two requirements (`SCR-R145` licensed, `SCR-R146` not) into
      one test that branches at runtime, so exactly one of them is ever exercised
      per run. Splitting it into two `enabled`-gated tests would make the coverage
      honest in the report, at the cost of one always-skipped row.
