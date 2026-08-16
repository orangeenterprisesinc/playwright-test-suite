# A13 · Onboarding forms

The Onboarding Badge surface (`/setup/badge`) — a filtered view of the Employee
table showing only badge records.

| | |
|---|---|
| Workflow | `A13` — Onboarding forms |
| Journey | A — Setup |
| Modules | Onboarding, Human Resources, Document, Signature |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A13-001`…`A13-007` |

`A13-001` remains a `draft`, `enabled=0` row. `A13-002`…`A13-007` were relocated
from `tests/webpet/onboarding-badges.spec.ts`. The requirements below were
written from their assertions.

## Why the coverage depth stays `partial`

The workflow's substance is **onboarding forms configuration and the form sets
that apply per situation** — none of which is automated. What exists here is the
badge list and its create form, plus cross-credit for the employee Documents
test (`A5-018`), which exercises the Document module this workflow depends on.

That cross-credit is recorded as a note rather than a row, because a journey row
carries a single `workflow`. Same mechanism as D7 in
[a02](a02-ranch-field-crop-variety-setup.md).

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `A13-R1` | When the Onboarding Badges list is opened, PET Tiger shall display the heading "Onboarding Badges". | `A13-002` |
| `A13-R2` | When the Onboarding Badges list is opened, PET Tiger shall render the Name, Barcode, Export Identifier, Crew, Department and Active columns. | `A13-003` |
| `A13-R3` | When New Badge is activated, PET Tiger shall navigate to the new-badge form. | `A13-004` |
| `A13-R4` | When the new-badge form is opened, PET Tiger shall render Name, Barcode, Export Identifier and Active. | `A13-005` |
| `A13-R5` | While the new-badge form has no Name, PET Tiger shall keep Save disabled. | `A13-006` |
| `A13-R6` | PET Tiger shall exclude regular (non-badge) Employee records from both `GET /api/onboarding-badges` and the Onboarding Badges list. | `A13-007` |

`A13-R7` onward is reserved for forms configuration, once `A13-001` is automated.

## `A13-R6` is the one that matters

Badges and employees share a table, separated only by `RecordType`. `A13-R6` is
the guard against that separation leaking — it creates a **regular** employee and
asserts it appears in neither the API response nor the grid.

That test previously ended with a bare `gotoList()` navigation and no assertion,
so its UI half proved nothing: it could not have failed if the grid had shown the
employee. The relocation repaired it in the house pattern — assert the grid root
is visible, **then** assert the employee's name is absent. The positive anchor is
what makes the negative meaningful, since an empty or unrendered grid would
otherwise satisfy the absence check on its own.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Onboarding Badge list | `/setup/badge` | `src/pages/setup/OnboardingBadgeListPage.ts` |
| Onboarding Badge form | `/setup/badge/{new,:id}` | `src/pages/setup/OnboardingBadgeFormPage.ts` |

Both moved out of `src/pages/webpet/` in this batch — it relocated their last
web-pet consumer.

## Parallelism

No `mode: 'serial'`. Records are provisioned in `beforeAll` per worker; no test
reads back a record another *test* created.

## Data

`src/data/generated/data-factory.ts` — `A13-007` creates a regular employee (with
its crew and department parents) purely to prove it is excluded, and deletes it
child-first in `afterAll`. Run-unique names are mandatory: Employee has no purge
endpoint (WEBPET-1798).

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [ ] The Onboarding module licensed on the target environment. **These specs carry
      no module guard** — if it is absent they fail loudly, which is correct.

## Cleanup

`A13-007` deletes its employee, crew and department in `afterAll`. The other five
are read-only or never save.

## Test cases

| ids | Group |
|---|---|
| `A13-002`, `A13-003` | list chrome |
| `A13-004`, `A13-005`, `A13-006` | new-badge form |
| `A13-007` | RecordType separation |

**No row carries `smoke`.** Three did in the web-pet vocabulary; they are list and
form renders, which are not a happy path worth gating a smoke run on. They carry
`@HighLevel` instead. If A13 should own a smoke case, `A13-007` is the honest
candidate — it is the only test that creates a record and proves a behaviour.

## Open questions for the tester

- [ ] Forms configuration and per-situation form sets are the workflow's real
      substance and are entirely uncovered.
- [ ] `A13-007` asserts exclusion but nothing asserts the positive: that a genuine
      badge record *does* appear in the list. Worth adding in the edge-case phase.
