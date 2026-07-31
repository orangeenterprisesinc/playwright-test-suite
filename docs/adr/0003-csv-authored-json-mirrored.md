# 0003 — Runner rows are authored in CSV, with a generated JSON mirror

- **Status:** accepted
- **Date:** 2026-07-31 (recording a pre-existing decision)

## Context

Runner rows are the run-control table: one record per test case, carrying the id a
spec claims, whether it is enabled, and its journey/segment/module metadata. They
are edited often, frequently by people who are not editing code at the same time.

## Decision

**CSV is authored. JSON is generated.** One file per journey
(`src/data/runner/journey-a.csv` … `journey-f.csv`, plus `system.csv`).
`npm run runner:sync` regenerates the `.json` mirror; `npm run runner:check` fails
if the two disagree.

## Consequences

- CSV opens in Excel, which is what the people maintaining these rows actually
  use, and it diffs one line per row instead of one line per field.
- One file per journey rather than one big table: two people adding tests to
  different journeys do not conflict. At 69 catalog workflows a single file would
  be a permanent merge conflict.
- The mirror can drift, so the check is mandatory in CI — it runs before the tests
  in `e2e.yml` and `e2e-local.yml`.
- The migrated web-pet suite contradicts the "one file per journey" half of this:
  `src/data/webpet/webpetRunnerManager.csv` is a single 406-row file. That is
  inherited from the source repo's flat spec layout, not a second opinion.
- CSV brings an encoding hazard: a CRLF checkout once broke `runner:check`
  (commit `e87512e`). `.gitattributes` now pins `*.csv` to LF so the format cannot
  reintroduce that class of failure.

## Revisit when

Row count per journey grows past what a human reviews in a diff, or the schema
starts needing nesting — at which point the authored format, not the mirror, is
what should change.
