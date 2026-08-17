# B3 · Individual time-in and duplicate-range correction

Clocking one worker in by badge or biometric, and correcting a rescan inside the
duplicate window — plus the office-side Time In list where those punches are
reviewed and bulk-edited.

| | |
|---|---|
| Workflow | `B3` — Individual time-in and duplicate-range correction |
| Journey | B — Field |
| Module | Real Time |
| Segments | grower, perennial-grower |
| Coverage depth | `partial` — see below |
| Rows | `src/data/runner/journey-b.csv`, `B3-001`…`B3-003` |

`B3-001` remains a `draft`, `enabled=0` row describing the end-to-end workflow.
`B3-002` and `B3-003` were relocated from `tests/webpet/time-in.spec.ts`
(WP-0378) and `tests/webpet/equiv/scan-time-in-equivalence.spec.ts` (WP-0178).

## Why the coverage depth stays `partial`

The workflow's defining behaviour — **duplicate-range correction**, where a
rescan with corrected data inside the window overwrites rather than duplicates —
is not automated at all. What exists is one legacy-parity scan that writes a Time
In row, and one office-side multi-edit regression. Neither touches the duplicate
window.

`B3-003` is also env-gated (below), so on a normal run **nothing proves B3**.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B3-R1` | When a counter-keyed Ranch dropdown value is committed in multi-edit with several rows selected, PET Tiger shall propagate the value to every selected row, and Undo shall restore each row's original value. | `B3-002` |
| `B3-R2` | When an employee barcode is scanned and saved on the Time In scan screen, PET Tiger shall persist a live Time Card row carrying a generated reference, the scanned employee and a punch timestamp. | `B3-003` |

`B3-R3` onward is reserved for the unautomated `B3-001` journey — duplicate-range
correction first.

## D7 takes cross-credit for `B3-002`

`B3-002` is the Time In list's multi-edit regression (WEBPET-666), which is also
evidence for **D7 — Multi-edit**. A journey row carries exactly one `workflow`,
so the credit is recorded as a note on D7 in
`src/data/catalog/workflow-coverage-map.json` rather than duplicated as a second
row. Same mechanism as A2-009/A2-010 for the setup-screen half.

## `B3-003` skips unless two environment variables are set

The equivalence spec guards on `SCAN_TIME_IN_EQUIV=1` and
`SCAN_EMPLOYEE_BARCODE`. Without them it skips with a visible reason.

**A skip there means the scan environment was not configured — not that the rule
holds.** It needs a real employee barcode that the dev environment can decode,
which is why it is opt-in rather than default-on. Setting both in the dev run is
the single cheapest way to give B3 any real coverage.

## `B3-002` keeps its module-level `serial`

`tests/web/journey-b-field/b03-time-in.spec.ts` declares
`test.describe.configure({ mode: 'serial' })` at module level, carried over
verbatim from the source. It is preserved even though the file holds one test —
`mode: 'serial'` is load-bearing and this batch does not relitigate source
declarations.

It also means the equivalence test **must not** be merged into this file. Under
serial, an earlier failure turns a later test into a skip rather than a failure,
which is exactly the silent-skip class this consolidation exists to remove. The
two B3 tests therefore stay in separate files.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Time In list | `/input/time-in` | `src/pages/input/TimeInListPage.ts` |
| Time In scan screen | `/scan/time-in` | `src/pages/scan/ScanScreenPage.ts` |

Both moved out of `src/pages/webpet/` in this batch. `ScanScreenPage` is shared
with the A7 specs — see
[a07-scan-device-and-scoping.md](../journey-a/a07-scan-device-and-scoping.md).

## Data

* `B3-002` provisions its own Ranch through `sessionApi` in `beforeAll` and
  deletes it in `afterAll`. It then locates a day that already has Time In rows
  rather than creating punches, so it never writes time-card data.
* `B3-003` writes a real Time Card row when enabled. There is no delete route for
  time cards, so it is opt-in for that reason too.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] A day with existing Time In rows for `B3-002`. The spec searches for one and
      skips with a reason if none is found — a skip means the data was absent, not
      that multi-edit works.
- [ ] `SCAN_TIME_IN_EQUIV=1` and `SCAN_EMPLOYEE_BARCODE` for `B3-003`.

## Cleanup

`B3-002` deletes the Ranch it created, child-first, through `sessionApi`.
`B3-003` leaves its Time Card row — no delete route exists.

## Open questions for the tester

- [ ] Duplicate-range correction is the workflow's core and is entirely
      unautomated. It is the first thing `B3-001` needs.
- [ ] Should `SCAN_TIME_IN_EQUIV` be set in the dev run? Today B3 has no proven
      coverage on any normal run.
- [ ] `B3-003` cannot clean up after itself. A time-card delete route would let it
      run unguarded.
