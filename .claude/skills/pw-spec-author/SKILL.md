---
name: pw-spec-author
description: Use when writing or editing a `*.spec.ts` in this repository — the conventions that keep specs from drifting. Covers which fixture module to import (base vs webpet vs api vs webpetAnonymous), the two separate tag vocabularies and which tags a test may legally carry, the mandatory testCaseId/requirement annotations, where test data lives, title and assertion style, and the runner sync/check that must pass afterwards.
---

## Playwright Spec Author

### Why this exists

Two suites live here with different fixtures, different tag vocabularies and
different row sources, and both are validated by scripts that fail the build on
drift. A spec written to the wrong convention usually does not fail loudly — it
**silently skips** and the run reports green. Everything below is a rule some
script enforces or some gate silently applies.

### 1. Import the right fixture module

| Spec location | Import from | Why |
|---|---|---|
| `tests/web/**` | `@fixtures/base.fixture` | browser + `pages` (PageObjects) + `cleanup` + runner gate over `src/data/runner/` |
| `tests/web/**` browserless, no office session needed | `@fixtures/api.fixture` | no browser; `api` / `apiContext` / `authenticatedApi` — same folder as UI specs, never destructure `page` |
| `tests/webpet/**` | `@fixtures/webpet.fixture` | SPA context, `pages` (WebpetPages), CSRF-seeded `request`, gate over `src/data/webpet/` |
| `tests/webpet/**` needing a logged-OUT context | `@fixtures/webpetAnonymous.fixture` | aliased: `import { test as cleanTest, expect as cleanExpect }` |

`base.fixture` and `webpet.fixture` are **not** interchangeable. `base.fixture`'s
gate resolves ids through `DataProvider`, bound to `src/data/runner/` — every
`WP-####` would fall into "no runner row" and all 406 web-pet tests would skip
green. Import the one that matches the folder.

Path aliases are the live style in specs — `@fixtures/*`, `@data/*`, `@pages/*`,
`@config/*`, `@components/*`, `@utils/*`. Match the neighbouring file.

### 2. Never re-implement login

- `tests/web` runs authenticated from `.auth/user.json` (the `auth-setup` project).
- `tests/webpet` seeds its own contexts in the fixture from `tests/webpet/.auth`.
- A spec that must start logged out either uses `webpetAnonymous.fixture` or resets
  storage state at the top of the file:

```typescript
test.use({ storageState: { cookies: [], origins: [] } });
```

### 3. Tags — two vocabularies, and the journey one is enforced

**Journey suites (`tests/web`)** — [scripts/runner/check.js](scripts/runner/check.js)
fails the build on any violation:

- **describe** carries the journey/workflow pair: `{ tag: ['@JourneyA', '@A1'] }`
  (framework/system specs use `['@System']`)
- **test** may carry the tier chain and nothing else, plus optional `@Demo`:
  `@Regression`, `@HighLevel`, `@Smoke`
- the tiers **nest**: every test is `@Regression`; `@Smoke` implies `@HighLevel`,
  so the happy path is `['@Smoke', '@HighLevel', '@Regression']`
- **at most one `@Smoke` per spec file** — the happy path, and only it
- a test's tier tags must **equal** the `tags` column of its CSV row
- no category / environment / scope tags: category is the folder, environment is
  `TEST_ENV`, scope is the row's `segments`/`modules`

**web-pet suite (`tests/webpet`)** — a different, wider vocabulary; describe carries
`@WebPet` plus area and batch (`@wp-setup`, `@wp-crop`, `@WPBatch01`), test carries
surface plus tier (`@wp-ui` / `@wp-api`, `@wp-smoke` / `@wp-regression` /
`@wp-negative`). The CSV `tags` column here is **script-owned** — `webpet:runner:sync`
rewrites it from the spec, so the spec is the source of truth, the reverse of the
journey suite.

### 4. Annotations

Every test needs a `testCaseId`; without a matching row the gate skips it.

```typescript
test('[User Setup] Verify that …', {
    tag: ['@Smoke', '@HighLevel', '@Regression'],
    annotation: [
        { type: 'testCaseId', description: 'A1-001' },
        { type: 'requirement', description: 'A1-R1|A1-R2' },
    ],
}, async ({ pages, cleanup }) => { /* … */ });
```

- journey specs additionally need `requirement` — pipe-separated EARS ids that
  **exist in a plan under `test-plans/`** and agree with the row's `req` column
- web-pet specs need only `testCaseId` (`WP-####`), single-annotation form:
  `annotation: { type: 'testCaseId', description: 'WP-0096' }`

### 5. Titles and structure

- one `test.describe` per workflow, titled for it — it becomes the Allure story
- test titles: `[<Module>] Verify that <behaviour>.`
- plain `test.describe` / `test` only. No annotation helpers, no author metadata,
  no category enums — they do not exist here.

### 6. Where data lives

| Kind | Location | Notes |
|---|---|---|
| Journey run-control rows | `src/data/runner/journey-<x>.csv` (authored) + `.json` (generated mirror) | edit the **CSV**; `npm run runner:sync` regenerates the JSON |
| web-pet run-control rows | `src/data/webpet/webpetRunnerManager.csv` + `.json` | same rule; human owns `enabled`/`module`/`notes`, script owns `file`/`titlePath`/`tags` |
| Journey static values | `src/data/static/<journey>/<name>Data.ts` | typed TS module, imported directly: `@data/static/journey-a/userSetupData` |
| Generated values | `src/data/generated` | `makeUser(...)`, `randomInitials()` — use these instead of literals |
| web-pet API-seeded entities | `tests/webpet/data-factory.ts` | `ensureCrop(request)` in `beforeAll`, `deleteCrop` in `afterAll` |
| web-pet id constants | `src/data/webpet/ids/*.ts` | **generated** by `webpet:runner:sync --ids`; never hand-edit |

Never hand-edit a generated JSON mirror or an `ids/*.ts` file — the next sync
overwrites it and `--check` fails in between.

Do not hardcode credentials, URLs, or environment values. They come from
`getConfigValue(ConfigProperties.…)` or `process.env`.

### 7. Data-driven selection (journey suite only)

`test.use({ testCaseId: 'A1-001' })` or `test.use({ testCaseName: 'someName' })`
selects a runner row and only then may the test destructure `testCaseData`.
Without one of those options the `testCaseData` fixture **skips the test** — so a
non-data-driven test must not destructure it. See the **data-driven-testing** skill
for the full runner-row workflow.

### 8. Assertions and waiting

- `await` every action and assertion; web-first `expect` only
- assert against the page object's **public locators** —
  `await expect(pages.cropForm.nameInput).toBeVisible()` — the spec orchestrates,
  the page object owns selectors
- no `waitForTimeout()`; no `expect(...).toBeHidden()` on an element that may never
  render (it passes vacuously — that trap is documented in
  [src/pages/webpet/README.md](src/pages/webpet/README.md))
- destructure only the fixtures used; an unused one needs a `_` alias
  (`gotoUrl: _gotoUrl`) or `tsc --noEmit` fails on `noUnusedParameters`
- clean up what you create: `cleanup.track('user', name)` (journey) or the
  `data-factory` delete helper in `afterAll` (web-pet)

### 9. Before reporting done

```
npm run typecheck
npm run lint

# journey specs
npm run runner:sync && npm run runner:check

# web-pet specs
npm run webpet:runner:sync && npm run webpet:runner:check && npm run webpet:ids:check
```

`runner:check` fails on: a `testCaseId` with no row, an enabled row no spec claims,
a duplicate id, a category that disagrees with the folder, tier tags that disagree
with the CSV, a second `@Smoke` in a file, an unknown segment/module, a requirement
declared in no plan, and a drifted JSON mirror.

Then actually run the spec — `npm test -- --grep @A1` or
`npm run test:webpet -- --grep @wp-crop`.

### Green-but-wrong traps

- a new row defaults to `enabled=1` on the web-pet side but journey rows are often
  authored `enabled=0` — a passing run that never executed your test is not a pass;
  check the run summary for skips
- `TEST_SCOPE` filters by the row's `segments`/`modules`; wrong values there make a
  test silently skip in exactly the runs that matter
- do not set `enabled=0` to make CI green — that is hiding a failure, not fixing it

### Checklist

- [ ] fixture module matches the folder
- [ ] describe tag = journey/workflow (or `@WebPet` + area); test tags = tier chain only
- [ ] one `@Smoke` per file, and it is the happy path
- [ ] `testCaseId` annotation present; `requirement` present for journey specs
- [ ] tier tags equal the CSV row's `tags` column
- [ ] data from a data module / factory / generator, not literals
- [ ] no selectors in the spec, no `waitForTimeout`, everything awaited
- [ ] created records cleaned up
- [ ] typecheck, lint, runner check all clean; spec actually ran and passed
