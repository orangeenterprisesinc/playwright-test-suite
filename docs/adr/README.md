# Architecture Decision Records

Short, dated records of decisions that are **not** obvious from reading the code —
and that someone will otherwise "clean up" later without knowing what breaks.

This repo's most valuable documentation currently lives in long comments at the
top of source files. Those comments are excellent, but they get deleted in
refactors and they cannot explain a decision that spans several files. An ADR can.

Write one when a decision (a) spans more than one file, (b) has a plausible-looking
alternative that is wrong, or (c) has explicit exit criteria — the conditions under
which it should be revisited.

| # | Decision |
|---|---|
| [0001](0001-webpet-suite-runs-separately.md) | The migrated web-pet suite runs separately and is mirrored, not merged |
| [0002](0002-no-test-data-conversion-step.md) | Test data has no conversion step; JSON runs from JSON, CSV from CSV |
| [0003](0003-csv-authored-json-mirrored.md) | Runner rows are authored in CSV with a generated JSON mirror |
| [0004](0004-single-artifacts-output-root.md) | All run output lives under a single `artifacts/` root |
| [0005](0005-folder-structure-by-responsibility.md) | Folders are grouped by responsibility, not by file type |
| [0006](0006-encrypted-env-values.md) | Sensitive env values are stored encrypted as `ENC(...)` |
