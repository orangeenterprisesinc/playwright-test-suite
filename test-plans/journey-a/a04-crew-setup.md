# A4 · Crew setup

Crews — the grouping employees are assigned to and time cards are captured
against.

| | |
|---|---|
| Workflow | `A4` — Crew setup |
| Journey | A — Setup |
| Modules | Windows, Department, Notification |
| Coverage depth | `screens` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A4-001`…`A4-014` |

`A4-001` remains a `draft`, `enabled=0` row. `A4-002`…`A4-014` were relocated
from `tests/webpet/crew.spec.ts` and `tests/webpet/setup-batch-b-smoke.spec.ts`.
The requirements below were written from their assertions.

## Why the coverage depth stays `screens`

The crew form and list are well covered — required-field gating, export-identifier
derivation, the read-only set after first save, the Department picker, and list
chrome. What the catalog workflow actually turns on — **auto-break rules, exercise
time, and the notification behaviour crews drive downstream** — is never
exercised. Relocation adds no assertions, so depth is unchanged.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `A4-R1` | When the new Crew form is opened, PET Tiger shall render Name, Export Identifier, the Active switch and the Department picker. | `A4-002` |
| `A4-R2` | When the new Crew form's Department picker is opened, PET Tiger shall populate it from the database. | `A4-003` |
| `A4-R3` | While Name is empty or invalid, PET Tiger shall keep Save disabled, and shall enable it once a valid Name is blurred. | `A4-004` |
| `A4-R4` | When Name is blurred on the new Crew form, PET Tiger shall auto-populate Export Identifier from it. | `A4-005` |
| `A4-R5` | When a dirty new-Crew form is discarded, PET Tiger shall return to the Crew list. | `A4-006` |
| `A4-R6` | When a new Crew is discarded, PET Tiger shall not persist it in the list. | `A4-006` |
| `A4-R7` | When an existing Crew is opened for edit, PET Tiger shall load its saved Name. | `A4-007` |
| `A4-R8` | When an existing Crew is opened for edit, PET Tiger shall render Name, Barcode and Export Identifier read-only. | `A4-008` |
| `A4-R9` | When an existing Crew is opened for edit, PET Tiger shall leave Short Name editable. | `A4-009` |
| `A4-R10` | When the edit Crew form's Department picker is opened, PET Tiger shall populate it from the database. | `A4-010` |
| `A4-R11` | When the edit Crew form is cancelled, PET Tiger shall return to the Crew list. | `A4-011` |
| `A4-R12` | If a Crew id that does not exist is opened, then PET Tiger shall display an error message. | `A4-012` |
| `A4-R13` | When the Crew list is opened, PET Tiger shall render its grid including the Department foreign-key column. | `A4-013` |
| `A4-R14` | When Multi Update is toggled on the Crew list, PET Tiger shall reflect its state in `aria-pressed`. | `A4-014` |

`A4-R15` onward is reserved for auto-break, exercise time and the unautomated
`A4-001`.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Crew form | `/setup/crews/{new,:id}` | `src/pages/webpet/setup/CrewFormPage.ts` |
| Crew list | `/setup/crews` | `src/pages/webpet/setup/CrewListPage.ts` |

Both stay under `src/pages/webpet/` and are imported across the tree:
`form-field-states`, `notifications`, `parent-picker` and `select-smoke` still
use `CrewFormPage`, and `select-smoke` still uses `CrewListPage`. Per the batch-3
rule, an object moves only in the batch relocating its last web-pet consumer —
which for these is the final non-catalog batch.

## Parallelism

`a04-crew-form.spec.ts` has no `mode: 'serial'` — every record is provisioned in
`beforeAll` and no test reads back another test's record.

`a04-setup-list-smoke.spec.ts` **does** declare serial, verbatim from its source,
as the first statement after its imports. It is the only file in batch 6 with it.
That file spans three workflows — its rows are `A2-056`, `A2-057`, `A4-013`,
`A4-014` and `A5-019` — because each of its list-render tests belongs to the
workflow whose screen it renders. Each describe carries its own workflow tag.

## Data and cleanup

Factories from `src/data/generated/data-factory.ts` (`ensureCrew`, `deleteCrew`,
plus the department parent). Every spec deletes its own records through
`sessionApi` in `afterAll`, child-first.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The `Windows`, `Department` and `Notification` modules.
- [ ] Create and edit rights on crews and departments.

## Test cases

| ids | Spec | Group |
|---|---|---|
| `A4-002`…`A4-006` | `a04-crew-form` | new form and validation |
| `A4-007`…`A4-012` | `a04-crew-form` | edit form and read-only fields |
| `A4-013`, `A4-014` | `a04-setup-list-smoke` | crew list chrome |

`A4-007` is the crew file's single `@Smoke` — the edit-form-loads case, the only
one proving persisted state round-trips into the UI.

## Open questions for the tester

- [ ] Auto-break rules, exercise time and crew-driven notifications are A4's real
      substance and are uncovered.
- [ ] `a04-setup-list-smoke` is a three-workflow file. If it grows, splitting it
      per workflow would make ownership clearer — at the cost of triplicating its
      serial declaration and changing execution shape.
