# Screen plans — coverage outside the journey catalog

The PET-Tiger workflow catalog describes 69 end-to-end journeys. It does not
describe every screen the product has. These plans cover the screens that no
catalog journey reaches — bonus, inventory, records, shared UI primitives,
profile, and timesheet validation.

| | |
|---|---|
| Specs | `tests/web/screens/<area>/` |
| Runner rows | `src/data/runner/screens.csv` → `SCR-###` |
| Requirements | this directory, `SCR-R###` |

Same contract as every other plan (see `test-plans/README.md` and `_template.md`):
a plan is written before the spec, its EARS ids are stable and append-only, and
`npm run runner:check` enforces that a row's `req` column and its spec's
`requirement` annotation name the same set.

Two differences from a journey plan, both because there is no catalog entry:

* Rows carry **no `workflow` and no `journey`**. `coverage:trace` reads the
  `workflow` column to build the catalog coverage matrix, so inventing one here
  would register as journey coverage that does not exist.
* Ids are `SCR-###`, not `<workflow>-###`. This mirrors `system.csv`'s `UI-###`
  for the login screens — the same precedent, one more namespace.

`category` stays `ui`: it selects the Playwright project via the folder under
`tests/`, and these specs drive a browser like any other `tests/web/` spec.

## Requirement ranges

`SCR-R###` is one flat namespace across every area, so each area is allocated a
block. Take the next free id **inside your block**; never renumber an existing
one. `runner:check` warns when the same id is declared by two plans, which is the
symptom of two areas drifting into each other's range.

| Range | Area | Plan | Specs |
|---|---|---|---|
| `SCR-R001`–`R099` | bonus | `bonus.md` | bonus wizard flow and shell |
| `SCR-R100`–`R149` | records | `records.md` | customer, department, billing centre, term |
| `SCR-R150`–`R199` | shared | `shared.md` | parent picker, select, form-field states, localization, notifications, mobile tab labels, console diagnostics |
| `SCR-R200`–`R249` | inventory | `inventory.md` | centre, item, item type, setup, unit, unit type |
| `SCR-R250`–`R279` | timesheet | `timesheet.md` | timesheet validation, crew timecard multi-entry |
| `SCR-R280`–`R299` | profile | `profile.md` | change password, avatar |
| `SCR-R300`+ | — | unallocated | |

Blocks are deliberately larger than today's test counts: this is also where the
edge, additional, and negative cases land once the journey automation is in
place, and those arrive as new ids in an existing block rather than a renumber.

## Area plans

Each area gets one plan covering its screens, added as that area's specs arrive.

| Plan | Area | Rows |
|---|---|---|
| `bonus.md` | bonus | `SCR-001`…`SCR-077` |
| `records.md` | records | `SCR-078`…`SCR-111` |
| `inventory.md` | inventory | `SCR-112`…`SCR-117` |

`shared.md`, `timesheet.md` and `profile.md` arrive with their relocation
batches.
