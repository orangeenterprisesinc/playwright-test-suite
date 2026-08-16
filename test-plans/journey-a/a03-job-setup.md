# A3 · Job and job-group setup

Jobs and job groups — the records time cards and piece payment reference.

| | |
|---|---|
| Workflow | `A3` — Job setup |
| Journey | A — Setup |
| Modules | Windows, Piece Payment |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-a.csv`, `A3-001`…`A3-021` |

`A3-001` remains a `draft`, `enabled=0` row. `A3-002`…`A3-021` were relocated
from `tests/webpet/job.spec.ts` and `tests/webpet/job-group.spec.ts`. The
requirements below were written from their assertions.

## Why the coverage depth stays `partial`

**Earning codes are still never asserted** — the field E9/E10 depend on for
export. What these 20 tests cover is the job and job-group forms: required-field
gating, export-identifier derivation, the payment-type-driven control set, the
read-only fields after first save, and the duplicate-name paths. That is form
coverage, not the workflow. Relocation adds no assertions, so depth is unchanged.

## Acceptance criteria (EARS)

### Job form

| id | Requirement | Cases |
|---|---|---|
| `A3-R1` | When the new Job form is opened, PET Tiger shall render the Name and Payment Type fields. | `A3-002` |
| `A3-R2` | While Name is missing, PET Tiger shall keep Save disabled. | `A3-003` |
| `A3-R3` | While no Overtime Rule is selected, PET Tiger shall keep Save disabled even with a valid Name. | `A3-003` |
| `A3-R4` | While Hourly Rate is empty for the default Time payment type, PET Tiger shall keep Save disabled even with Name and Overtime Rule set. | `A3-003` |
| `A3-R5` | When Name is blurred on the new Job form, PET Tiger shall auto-populate Export Identifier from it. | `A3-004` |
| `A3-R6` | When a dirty new-Job form is discarded, PET Tiger shall return to the Job list. | `A3-005` |
| `A3-R7` | When a new Job is discarded, PET Tiger shall not persist it in the list. | `A3-005` |
| `A3-R8` | If a Job Name duplicates an existing job, then PET Tiger shall surface a conflict error toast naming the reason. | `A3-006` |
| `A3-R9` | If a duplicate Job is rejected, then PET Tiger shall keep the user on the create form able to correct it. | `A3-006` |
| `A3-R10` | Where Payment Type is Non-Labor or Extra Wages, PET Tiger shall render Include Idle Time checked by default and hide Act-as-Job-End. | `A3-007` |
| `A3-R11` | Where Payment Type is Piece, PET Tiger shall render Act-as-Job-End unchecked by default and hide Include Idle Time. | `A3-007` |
| `A3-R12` | When an existing Job is opened for edit, PET Tiger shall load its saved Name and Code. | `A3-008` |
| `A3-R13` | When an existing Job is opened for edit, PET Tiger shall render Name, Alias, Code and Export Identifier read-only. | `A3-009` |
| `A3-R14` | When the edit Job form is cancelled, PET Tiger shall return to the Job list. | `A3-010` |
| `A3-R15` | If a Job id that does not exist is opened, then PET Tiger shall display an error message. | `A3-011` |
| `A3-R16` | When Include Idle Time is toggled and saved on a Non-Labor job, PET Tiger shall round-trip the value as a boolean through the API. | `A3-012` *(unproven)* |
| `A3-R17` | When Act-as-Job-End is toggled and saved on a Piece job, PET Tiger shall round-trip the value as a boolean through the API. | `A3-012` *(unproven)* |

### Job group form

| id | Requirement | Cases |
|---|---|---|
| `A3-R18` | When the new Job Group form is opened, PET Tiger shall render Name, Export Identifier, Code and Active. | `A3-013` |
| `A3-R19` | While Name is missing, PET Tiger shall keep Save disabled, and shall enable it once a valid Name is blurred. | `A3-014` |
| `A3-R20` | When Name is blurred on the new Job Group form, PET Tiger shall auto-populate Export Identifier from it. | `A3-015` |
| `A3-R21` | When a dirty new-Job-Group form is discarded, PET Tiger shall return to the Job Group list. | `A3-016` |
| `A3-R22` | When a new Job Group is discarded, PET Tiger shall not persist it in the list. | `A3-016` |
| `A3-R23` | If a Job Group Name duplicates an existing group, then PET Tiger shall keep the user on the create form able to retry. | `A3-017` |
| `A3-R24` | When an existing Job Group is opened for edit, PET Tiger shall load its saved Name and Code. | `A3-018` |
| `A3-R25` | When an existing Job Group is opened for edit, PET Tiger shall render Name read-only. | `A3-019` |
| `A3-R26` | When an existing Job Group is opened for edit, PET Tiger shall leave Export Identifier and Code editable. | `A3-019` |
| `A3-R27` | When the edit Job Group form is cancelled, PET Tiger shall return to the Job Group list. | `A3-020` |
| `A3-R28` | If a Job Group id that does not exist is opened, then PET Tiger shall display an error message. | `A3-021` |

`A3-R29` onward is reserved for earning codes and the unautomated `A3-001`.

## `A3-012` is quarantined — a data-factory gap, not a test defect

`A3-012` is `enabled=0`, so **`A3-R16` and `A3-R17` are unproven**.

The blocker is provisioning, not the spec: `ensureJob` cannot build a savable
paymentType 8/15 job. A required-and-empty field keeps the form invalid, and
`POST /api/jobs` rejects `lookBackPeriod` with `400 invalid_body`. Identifying
that field needs live form probing, which is out of scope for a relocation batch.

Risk assessment for whoever enables it: lower than
[`A5-018`](a05-employee-setup.md)'s, because the enabled `A3-007` proves the
`includeIdleTimeControl` and `actAsDeterminedByJobEndControl` locators work
live. But the save-and-round-trip path has never executed, so expect first-run
defects. **Enabling this is a `data-factory.ts` task, not a spec edit.**

## Assertions carried over deliberately unchanged

`A3-017` (job-group duplicate) under-asserts: it proves the user stays on the
create form, but not *why*. Its sibling `A3-006` on the job form does better —
it asserts the conflict toast. Upgrading `A3-017` needs to know whether the
job-group 409 surfaces as a toast or a native dialog, which needs browser
probing. It relocated verbatim, keeping its `page.on('dialog')` dismiss handler,
and is falsifiable as it stands: a successful save fails it.

The three cancel-from-edit tests end in `page.waitForURL(...)` with no trailing
assertion. That is not a gap — `waitForURL` throws on failure, so the navigation
*is* the assertion.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Job form | `/setup/jobs/{new,:id}` | `src/pages/webpet/setup/JobFormPage.ts` |
| Job list | `/setup/jobs` | `src/pages/setup/JobListPage.ts` |
| Job Group form | `/setup/jobs/groups/{new,:id}` | `src/pages/setup/JobGroupFormPage.ts` |
| Job Group list | `/setup/jobs/groups` | `src/pages/setup/JobGroupListPage.ts` |

`JobFormPage` stays under `src/pages/webpet/` — `parent-picker` and
`select-smoke` still use it. Per the batch-3 rule, an object moves only in the
batch that relocates its last web-pet consumer.

## Parallelism, data and cleanup

No `mode: 'serial'` — records are provisioned in `beforeAll` per worker and no
test reads back a record another *test* created. Factories come from
`src/data/generated/data-factory.ts`; every spec deletes its own records through
`sessionApi` in `afterAll`. The job spec keeps `apiUrl` from `@config/webpetEnv`
for its round-trip GETs, which go through `page.request` on purpose — browser
cookies are what those assertions exercise.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The `Windows` and `Piece Payment` modules on the target environment.
- [ ] Create and edit rights on jobs and job groups.

## Test cases

| ids | Spec | Group |
|---|---|---|
| `A3-002`…`A3-007` | `a03-job-form` | new form, validation, payment-type control set |
| `A3-008`…`A3-012` | `a03-job-form` | edit form, read-only fields, API round-trip *(012 disabled)* |
| `A3-013`…`A3-017` | `a03-job-group-form` | new form and validation |
| `A3-018`…`A3-021` | `a03-job-group-form` | edit form |

Each file carries one `@Smoke`: `A3-008` and `A3-018`, the edit-form-loads cases —
the only ones proving persisted state round-trips into the UI.

## Open questions for the tester

- [ ] Earning codes are A3's real substance and are entirely uncovered.
- [ ] Which field blocks a paymentType 8/15 job save? Answering it unblocks `A3-012`.
- [ ] Should `A3-017` assert the job-group conflict surface, as `A3-006` does for jobs?
