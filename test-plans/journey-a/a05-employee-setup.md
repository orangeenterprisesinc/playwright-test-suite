# A5 · Employee setup

The Employee record — identity, department and crew assignment, the fields the
app locks after first save, and the Documents tab.

| | |
|---|---|
| Workflow | `A5` — Employee setup |
| Journey | A — Setup |
| Module | Windows |
| Coverage depth | `screens` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A5-001`…`A5-018` |

`A5-001` remains a `draft`, `enabled=0` row describing the end-to-end employee
build. `A5-002`…`A5-018` were relocated from `tests/webpet/employee.spec.ts` and
`tests/webpet/employee-documents.spec.ts`. The requirements below were written
from their assertions — they describe what the 17 tests actually prove.

## Why the coverage depth stays `screens`

The catalog's employee workflow builds a complete employee: identity, badges,
home crew, pay rates, meal waivers and compliance. These tests cover the form,
its validation, the permission states around the Name field, and the documents
slice. **Pay, meal waivers and compliance fields are never asserted**, so the
workflow's substance is unautomated and `A5-001` stays the reserved slot.

A13 (onboarding forms) takes cross-credit for the Documents test via a note
citing `A5-018` — a journey row carries one `workflow`, so the credit is recorded
rather than duplicated. Same mechanism as D7 in
[a02](a02-ranch-field-crop-variety-setup.md).

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `A5-R1` | When the new Employee form is opened, PET Tiger shall render Name, Code, Export Identifier, First Name, Last Name, Department, Crew and Active. | `A5-002` |
| `A5-R2` | When the Department picker is opened, PET Tiger shall list departments loaded from the database. | `A5-003` |
| `A5-R3` | When the Crew picker is opened, PET Tiger shall list crews loaded from the database. | `A5-004` |
| `A5-R4` | While the new Employee form has no valid, blurred Name, PET Tiger shall keep Save disabled. | `A5-005` |
| `A5-R5` | When Name is blurred on the new Employee form, PET Tiger shall leave Export Identifier empty. | `A5-006` |
| `A5-R6` | Where Export Identifier was filled manually, PET Tiger shall not overwrite it on a Name blur. | `A5-007` |
| `A5-R7` | When a dirty new-Employee form is discarded, PET Tiger shall return to the Employee list. | `A5-008` |
| `A5-R8` | When a new Employee is discarded, PET Tiger shall not persist the record. | `A5-008` |
| `A5-R9` | If a new Employee's Name duplicates an existing employee, then PET Tiger shall reject the save and keep the user on the create form. | `A5-009` |
| `A5-R10` | When an existing Employee is opened for edit, PET Tiger shall populate Name, First Name and Last Name from the saved record. | `A5-010` |
| `A5-R11` | When an existing Employee is opened for edit, PET Tiger shall render Code and Export Identifier read-only. | `A5-011` |
| `A5-R12` | Where the session is SU or name modification is allowed, PET Tiger shall render the edit form's Name editable. | `A5-011` |
| `A5-R13` | Where the session is neither SU nor allowed to modify names, PET Tiger shall render the edit form's Name read-only. | `A5-012` |
| `A5-R14` | Where an employee's stored name begins with a temporary-badge or temporary-name prefix, PET Tiger shall keep Name editable even for a non-SU user without the name-modification permission. | `A5-013` |
| `A5-R15` | When an existing Employee is opened for edit, PET Tiger shall leave First Name and Last Name editable. | `A5-014` |
| `A5-R16` | When an existing Employee is opened for edit, PET Tiger shall show the Department picker populated with that employee's department. | `A5-015` |
| `A5-R17` | When the edit Employee form is cancelled, PET Tiger shall return to the Employee list. | `A5-016` |
| `A5-R18` | If an Employee id that does not exist is opened, then PET Tiger shall display a not-found error. | `A5-017` |
| `A5-R19` | When a document is uploaded with a type and file selected, PET Tiger shall list it by file name. | `A5-018` |
| `A5-R20` | When the document list is sorted, PET Tiger shall re-render without losing the uploaded row. | `A5-018` |
| `A5-R21` | When a listed document is downloaded PET Tiger shall return a successful response, and when its deletion is confirmed it shall remove the row from the list. | `A5-018` |

`A5-R22` onward is reserved for the unautomated `A5-001` journey.

## The three-term Name gate (WEBPET-2006)

`A5-R12`, `A5-R13` and `A5-R14` are the three terms of one product rule: the edit
form's Name unlocks for an SU session, **or** a user holding the
name-modification preference, **or** any employee whose stored name carries a
temporary prefix. They are separate requirements because they fail
independently — and because the read-only leg is only reachable as a non-SU user.

`A5-013` therefore carries `test.skip(!WEBPET_NONSU_USER || !WEBPET_NONSU_PASSWORD, …)`
with a visible reason. **A skip there means the non-SU credentials are absent from
the environment, not that the rule holds.** A pass means a real non-SU login
exercised the third term. `A5-011`'s editable-Name leg depends on dev genuinely
serving `isSU=true` for the session user — if it reds as non-SU that is
environment triage, not a locator fix.

## `A5-018` is quarantined — its page object rotted behind a skip

`A5-018` is `enabled=0`. It is **not** an environment problem and **not** a
product bug: `EmployeeDocumentsComponent` was written for a standalone Documents
tab panel, but the panel actually renders *inside* the employee form, surrounded
by that form's own controls. Almost every locator in it was wrong.

Nothing caught this because **the test was `skipped` in web-pet** — see
`docs/catalog/runs/31692620907-webpet.json`. It had never executed in recorded
history, so its component was unverified code being carried along as if it were
working coverage. The relocation is what finally ran it.

Five defects found, each one surfacing only after the previous was fixed:

| # | Locator | Defect | Status |
|---|---|---|---|
| 1 | `getByRole('tab', { name: 'Documents' })` | the control is a `button`, not an ARIA `tab` — the doc comment even claimed "a real ARIA tab" | fixed |
| 2 | `input[type="file"]` | resolved to 2 elements, strict-mode violation; the other is hidden | fixed |
| 3 | `[data-slot="select-trigger"].first()` | `.first()` on the whole page grabbed the form's `EIC Type` select, so the document type was never set and Upload stayed permanently disabled | fixed |
| 4 | `button:has-text("Upload")` | correct, but unreachable behind #3 | verified |
| 5 | `[data-slot="select-item"]` (and `[role="option"]`) | the opened type-select's options still do not match | **outstanding** |

Fixes 1–4 are real and each was confirmed by the test progressing further. The
row stays `enabled=0` until #5 is resolved against the live DOM, because a
red suite is worse than a visible, explained skip — and "fixing" it into a pass
without a working upload would be exactly the vacuous coverage this plan exists
to prevent.

**`A5-R19`, `A5-R20` and `A5-R21` are therefore unproven.** The Documents tab has
no working automated coverage today.

A per-test `test.setTimeout(240_000)` was briefly added here on the theory that
the test was merely slow. That was wrong and has been removed: Playwright's
default `actionTimeout` is `0`, so one unmatched locator is bounded only by the
test timeout and consumed the whole budget. Raising the budget only made the same
hang take four minutes. The test now fails in ~15s, which is the correct
behaviour for a broken locator.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Employee list | `/setup/employees` | `src/pages/webpet/setup/EmployeeListPage.ts` |
| Employee form | `/setup/employees/{new,:id}` | `src/pages/webpet/setup/EmployeeFormPage.ts` |

Both are still under `src/pages/webpet/` and imported across the tree: the form is
still used by `parent-picker.spec.ts` and the list by `setup-batch-b-smoke.spec.ts`.
Per the rule set in batch 3, a page object moves only in the batch that relocates
its **last** web-pet consumer.

## Parallelism

No `mode: 'serial'`. Every record is provisioned in `beforeAll` per worker and no
test reads back a record another *test* created, so serialising would only convert
a failure into a hidden skip. The `afterAll` delete order is child-first —
employee → crew → department.

## Data

* **Factories** — `src/data/generated/data-factory.ts` (`ensureEmployee`,
  `deleteEmployee`, plus the crew and department parents).
* **Run-unique names are mandatory.** Employee has **no purge endpoint**
  (WEBPET-1798), so a soft-deleted name is owned forever and a fixed literal would
  eventually collide with a ghost. `A5-013`'s temporary employee is cleaned up in
  its own `finally`, not `afterAll`, so a mid-test failure still releases it.
* The documents test uploads a real file and needs S3 configured.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The session user is SU on dev staging — `A5-011` depends on it.
- [ ] `WEBPET_NONSU_USER` / `WEBPET_NONSU_PASSWORD` for `A5-012` and `A5-013`.
      Registered for dev; a skip means they were not resolved.
- [ ] S3 configured for `A5-018`. **Deliberately unguarded** — a red there is an
      environment ticket, not a test defect. Do not reintroduce a skip.
      (`A5-018` is currently `enabled=0` for an unrelated reason — see below.)

## Cleanup

Every spec deletes its own records through `sessionApi` in `afterAll`,
child-first. Nothing depends on a seeded row.

## Test cases

| ids | Spec | Group |
|---|---|---|
| `A5-002`…`A5-009` | `a05-employee-form` | new form and validation |
| `A5-010`…`A5-017` | `a05-employee-form` | edit form, read-only fields, the Name gate |
| `A5-018` | `a05-employee-documents` | Documents tab upload, sort, download, delete |

`A5-010` is the file's single `@Smoke` — the only test proving persisted state
round-trips back into the UI. Four render tests carry `@HighLevel`; the rest are
`@Regression`.

## Open questions for the tester

- [ ] `A5-001` needs pay rates, meal waivers and compliance to reach journey depth.
- [ ] `A5-018` bundles upload, sort, download and delete into one test. Splitting it
      would let a download regression be distinguished from an upload regression,
      at the cost of re-uploading per test.
- [ ] Does dev reliably resolve the non-SU credentials? If `A5-013` skips on most
      runs, the third term of the Name gate is effectively uncovered.
