---
name: data-driven-testing
description: Use when adding or modifying data-driven Playwright tests — runnerManager rows, testCaseId/testCaseName fixtures, module data files, or switching between JSON and CSV sources.
---

## Data-driven testing in this framework

Test data is read **DIRECTLY from its source file — JSON runs from JSON,
CSV runs from CSV. There is no conversion or preprocessing step.** Never
introduce one.

### Two kinds of test data

1. **Runner rows** (`src/data/runnerManager.json` + `runnerManager.csv`)
   — one record per test case, selected at runtime via option fixtures.
   Use for suites where each test maps to a managed test-case row.
2. **Module data files** (`src/data/<module>-data.json`, e.g.
   `login-module-data.json`) — small value bags (wrong inputs, expected
   messages) imported directly into the spec. Use for everything else.

### Source selection

- `TEST_DATA_SOURCE=json | csv` in `env.local` / `env.dev` / `env.qa`
  (OS env vars override; default source is JSON).
- `DATA_FILE_PATH_JSON` / `DATA_FILE_PATH_CSV` override file locations.
- JSON records live under the `"runnerManager"` key; the CSV has a header
  row with the same columns. **When adding a row, update BOTH files** so
  either source works standalone.

### Record shape (`TestCaseData`)

`id`, `testName`, `testTitle`, `testDescription?`, `shouldComplete`,
`expectedCount`, `tags?` (pipe-delimited string), `enabled`.
Rows with `enabled: false` are skipped automatically.

### Using a row in a spec

```typescript
import { expect, test } from '../../src/fixtures/base.fixture';

test.describe('My module', () => {
    test.use({ testCaseId: 'UI-001' });          // or: testCaseName: 'LoginPageLoadsWithAllFormElements'

    test('scenario title', async ({ testCaseData, loginPage }) => {
        // testCaseData is loaded, validated, and skip-checked already
    });
});
```

Rules:

- `testCaseData` may ONLY be destructured when `testCaseId` or
  `testCaseName` is set — otherwise the fixture skips the test.
- Lookup by `testCaseId` matches the `id` field; `testCaseName` matches
  the `testName` field.
- Programmatic access outside fixtures: `getTestCaseById(...)`,
  `getRunnerData()`, or `DataProvider.forSource('csv')` from
  `src/utils/DataProvider.ts`.

### Forbidden

- No conversion pipelines, no generated/unified JSON, no writing under
  `test-results/converted/`.
- No Excel or database readers — JSON and CSV only.
- No test values hardcoded in specs when a data file is the right home.
