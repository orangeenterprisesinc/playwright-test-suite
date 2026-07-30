# 0005 — Folders are grouped by responsibility, not by file type

- **Status:** accepted
- **Date:** 2026-07-31

## Context

The framework grew to ~42k lines and the layout stopped answering "where does this
go". Symptoms: `src/utils/` had become a catch-all of 15 unrelated files (a
logger, a SQL client, the data reader stack, Allure report generation); reporting
was spread across four parents; test data was split between `src/data/`,
`src/utils/dataReaders/`, `src/utils/DataProvider.ts` and `src/utils/testData/`
with nothing indicating which *kind* of data a file held; and single-file folders
existed purely as type buckets (`src/enums/` held one file; `src/listeners/` held
two whose consumers were elsewhere).

## Decision

Group by responsibility. Concretely:

- Every subsystem is readable as **mechanism / storage / consumers**. Reporting
  became `generate/` + `deliver/` + `recipients/` with `artifacts/` as storage;
  test data became `readers/` (mechanism) over `runner/` + `static/` +
  `generated/` + `catalog/` (storage).
- Type-bucket folders were dissolved into the concern that owns them.
  `configProperties.ts` is configuration, so it lives in `src/config/`, not in an
  `enums/` folder. The two "listeners" are gate and lifecycle machinery, so they
  live in `src/fixtures/gate/` and `src/fixtures/lifecycle/` next to the fixtures
  that use them.
- `src/utils/` is reserved for genuinely cross-cutting helpers and is now 3 files.
  A helper that grows a domain gets its own folder instead of a longer `utils/`.
- Depth is capped at two levels inside `src/`. Grouping that would need a third
  level is a sign the concern should be its own top-level folder.

## Consequences

- `src/` went from 13 top-level folders to 11, and every remaining one names a
  responsibility rather than a file kind.
- Folder names are now claims that can go stale. `src/utils/` is only honest while
  it stays small; if it drifts back toward a catch-all, that is a signal to split,
  not to rename.
- `src/data/` kept its name rather than becoming `src/testdata/`. The internal
  regrouping delivered the entire benefit; renaming would additionally have moved
  `src/data/runner/` and `src/data/webpet/`, which would have meant editing the
  runner scripts and disturbing the migrated suite's frozen inputs for no
  structural gain. Structure earned the churn; the name did not.
- The lint configs moved to `config/lint/`, which requires `--config` flags in the
  npm scripts and a `.vscode/settings.json` so editors agree with CI. That trade
  was accepted to keep "code standards" in one place; it is the one move in this
  reorganization that costs ongoing setup for new contributors.

## Revisit when

A top-level folder stops naming one responsibility, or a "grouping" folder ends up
with a single file in it for more than a release.
