---
name: data-driven-testing
description: Use when adding or modifying data-driven Playwright tests — per-journey runner rows, testCaseId/testCaseName fixtures, journey value-bag modules, customer scopes, or switching between JSON and CSV sources.
---

## Data-driven testing in this framework

Test data is read **DIRECTLY from its source file at runtime — JSON runs from JSON,
CSV runs from CSV. There is no conversion step in the test path.** Never introduce
one. (`npm run runner:sync` regenerates the JSON *mirror* at author time; that is a
dev-time convenience, not a runtime step, and `npm run runner:check` proves the two
agree.)

### Two kinds of test data

1. **Runner rows** — `src/data/runner/journey-<x>.csv` (authored) plus a generated
   `journey-<x>.json` mirror. One record per test case, bound to a spec by `id`.
   One file per journey (`journey-a` … `journey-f`) plus `system` for non-catalog
   framework tests. Read as one combined set by `MultiFileDataReader`.
2. **Journey value bags** — `src/data/journey-<x>/<name>Data.ts`, e.g.
   `src/data/journey-a/userSetupData.ts`. Typed TS modules, not JSON: small value
   bags (option lists, expected messages, defaults) imported directly by the spec.
   TypeScript so a cross-cutting constant is compile-checked in every place that
   depends on it.

Plus two supporting data sets:

3. **The catalog** — `src/data/catalog/workflow-catalog.json`, regenerated from the
   Word document by `npm run catalog:import`. The 69 workflows with their steps,
   segments and modules. Source of truth for what a row's metadata should say.
4. **Customer scopes** — `src/data/scopes/<customer>.json`: the segments and licence
   modules one customer has. Drives `TEST_SCOPE` filtering.

### Source selection

- `TEST_DATA_SOURCE=json | csv` in `env.local` / `env.dev` / `env.qa`
  (OS env vars override; default is JSON).
- `RUNNER_DATA_DIR` overrides the runner directory (default `src/data/runner`).
- `DATA_FILE_PATH_JSON` / `DATA_FILE_PATH_CSV` switch to a single file instead of the
  directory — an escape hatch for a one-off data file.
- JSON records live under the `"runnerManager"` key; the CSV has a header row with
  the same columns. **Author the CSV, then `npm run runner:sync`** — do not hand-edit
  the JSON.

### Record shape (`TestCaseData`)

| Column | Notes |
|---|---|
| `id` | `<workflow>-<nnn>` for a catalog row (`A1-001`), `UI-00X` for a system row |
| `category` | `ui` \| `api` \| `workflow` — must match the spec's folder under `tests/` |
| `journey` | `A`–`F`; empty for system rows |
| `workflow` | catalog workflow id (`A1`); empty for system rows |
| `testName` | machine-friendly name; `testCaseName` lookup matches this |
| `testTitle` | human-readable title |
| `testDescription` | becomes the Allure description |
| `segments` | pipe-delimited, from the catalog: `all` or `grower\|perennial-grower\|…` |
| `modules` | pipe-delimited, from the catalog: `core` or `Windows\|Network\|…` |
| `tags` | pipe-delimited, for reporting severity |
| `demo` | `1`/`0`, the catalog's demo-candidate flag |
| `jira` | epic/issue key once work is cut |
| `status` | `draft` \| `specced` \| `ticketed` \| `automated` |
| `enabled` | `1`/`0` |

`shouldComplete` and `expectedCount` are legacy and optional — omit them from new rows.

`segments` and `modules` must use names the catalog defines (`workflow-catalog.json`
→ `segments` / `modules`, plus the `all` and `core` shorthands). A typo makes the row
silently never match a scope; `npm run runner:check` catches it.

### The three-layer execution gate

`base.fixture`'s `beforeEach` decides whether a test runs:

1. **`src/data/runnerList.json`** — a per-id runtime override. `execute: "yes"` wins
   outright, even over `enabled: 0`. Ships as `{}`.
2. **the row's `enabled` flag** — the normal on/off switch.
3. **`TEST_SCOPE`** — the customer scope filter. A row runs only if its `segments`
   intersect the scope's and its `modules` are all within the scope's enabled set.
   Unset `TEST_SCOPE` = no filtering.

A spec claiming a `testCaseId` with no row is **skipped**, not run — that is a
configuration error, and `runner:check` fails on it.

### Reservations (the backlog)

A row with `enabled: 0` and **no spec** is a reservation: the catalog entry for a
workflow nobody has automated yet. Every catalog workflow has one, so
`npm run coverage:catalog` can report the whole backlog. `runner:check` reports
reservations rather than failing. An **enabled** row with no spec *is* an error — it
can never run.

### Using a row in a spec

The live pattern is a per-test annotation:

```typescript
test('[Ranch] Verify that …', {
    tag: ['@UI', '@Regression'],
    annotation: { type: 'testCaseId', description: 'A2-001' },
}, async ({ pages, cleanup }) => { /* … */ });
```

`test.use({ testCaseId })` / `test.use({ testCaseName })` work too, and are required
if the spec needs to destructure `testCaseData`:

```typescript
test.describe('A2 · Ranch, field, crop, and variety setup', { tag: ['@JourneyA', '@A2'] }, () => {
    test.use({ testCaseId: 'A2-001' });

    test('scenario title', async ({ testCaseData, pages }) => {
        // testCaseData is loaded, validated, and skip-checked already
    });
});
```

Rules:

- `testCaseData` may ONLY be destructured when `testCaseId` or `testCaseName` is set —
  otherwise the fixture skips the test.
- Lookup by `testCaseId` matches `id`; `testCaseName` matches `testName`.
- Programmatic access outside fixtures: `getTestCaseById(...)`, `getRunnerData()`, or
  `DataProvider.forSource('csv')` from `src/utils/DataProvider.ts`.

### Adding rows — the loop

1. Add the row(s) to `src/data/runner/journey-<x>.csv`, copying `segments`/`modules`
   from the catalog entry. Start at `enabled=0`, `status=draft`.
2. `npm run runner:sync` — regenerates the JSON mirror.
3. Write the spec with a matching `testCaseId` annotation.
4. Set `status=automated` (and `enabled=1` when it should run), re-sync.
5. `npm run runner:check` — must pass.

### Forbidden

- No conversion pipelines in the test path, no unified/generated runtime JSON, no
  writing under `test-results/converted/`.
- No hand-editing `src/data/runner/*.json` — it is generated from the CSV.
- No Excel or database readers — JSON and CSV only.
- No test values hardcoded in specs when a journey value bag is the right home.
- No new id prefix schemes. Catalog rows are `<workflow>-<nnn>`.
