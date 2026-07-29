# `<WF>` · `<Workflow title from the catalog>`

> Copy this file to `specs/journey-<x>/<wf>-<slug>.md` and fill it in **before**
> writing the spec. One workflow id joins all five artifacts, so nothing needs a
> lookup table:
>
> | Artifact | Path |
> |---|---|
> | Catalog entry | `src/data/catalog/workflow-catalog.json` → `<WF>` |
> | Recording | `Testing video/journey-<x>/<wf>-<slug>.mp4` |
> | This plan | `specs/journey-<x>/<wf>-<slug>.md` |
> | Spec | `tests/<category>/journey-<x>-<area>/<wf>-<slug>.spec.ts` |
> | Runner rows | `src/data/runner/journey-<x>.csv` → `<WF>-001`… |
>
> Delete these instructions once filled in.

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `<WF>` |
| Journey | `<A–F>` — `<journey title>` |
| Segments | `<from catalog: all, or grower\|perennial-grower\|…>` |
| Modules | `<from catalog: Windows\|Network\|…>` |
| Surface | `ui` / `device` / `calc` — decides the `tests/` category |
| Demo candidate | yes / no |
| Catalog status | draft / specced / ticketed |

**Summary** (from the catalog)
> …

## Catalog steps

Paste the catalog's ordered steps verbatim, then annotate each one with what the
recording actually shows — the catalog says *what*, the video shows *where*.

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | … | … | yes / no — why |
| 2 | … | … | |

## Screens and page objects

Which screens the workflow touches, and whether a page object exists.

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| … | `Input ▸ Setup ▸ …` | `src/pages/setup/…Page.ts` | exists / to write |

- Is it a list + New/Edit form screen? Then extend
  [`SetupScreenPage`](../src/pages/SetupScreenPage.ts) and copy
  [`UsersPage`](../src/pages/admin/UsersPage.ts) — the grid, the on-blur
  validation, the Save-stays-disabled behaviour and the "Unsaved changes" bar are
  already handled there.
- Anything else: extend [`BasePage`](../src/pages/BasePage.ts).

## Data

- **Value bag** — static labels, option lists, expected messages:
  `src/data/journey-<x>/<name>Data.ts` (typed module, not JSON).
- **Generated values** — anything that must be unique per run:
  `src/utils/testData/`. Never hard-code a name that has a uniqueness rule.
- **Uniqueness rules the app enforces** (from the catalog): e.g. barcode unique
  across the database; only one record per Name per screen. List them here — they
  decide what has to be generated rather than fixed.

## Preconditions

What must already exist before the first step. Nothing for most of journey A;
journeys D and E need captured time cards or committed job cards.

- [ ] …

Implement with [`src/preconditions/`](../src/preconditions/index.ts), not by
chaining onto another spec.

## Cleanup

What the workflow creates, and how it is removed. Add an entry to
[`cleanupTargets.ts`](../src/data/shared/cleanupTargets.ts), then `cleanup.track()`
in the spec.

| Entity | Table | Name column | Prefix |
|---|---|---|---|
| … | `dbo.…` | `Name` | `QA … ` |

## Test cases

One row per runner row. Add these to `src/data/runner/journey-<x>.csv`, then
`npm run runner:sync && npm run runner:check`.

| id | Title | Tags | enabled |
|---|---|---|---|
| `<WF>-001` | … | `smoke\|regression` | 0 |
| `<WF>-002` | … | `regression` | 0 |

The spec's describe carries the journey and workflow tags:

```ts
test.describe('<WF> · <catalog title>', { tag: ['@Journey<X>', '@<WF>'] }, () => {
    test('…', {
        tag: ['@UI', '@Regression'],
        annotation: { type: 'testCaseId', description: '<WF>-001' },
    }, async ({ pages, cleanup }) => { … });
});
```

## Open questions for the tester

Anything the recording does not settle — an ambiguous step, a value that looked
environment-specific, a validation message worth confirming.

- [ ] …
