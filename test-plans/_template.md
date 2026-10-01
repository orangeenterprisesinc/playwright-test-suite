# `<WF>` · `<Workflow title from the catalog>`

> Copy this file to `test-plans/journey-<x>/<wf>-<slug>.md` and fill it in **before**
> writing the spec. One workflow id joins all five artifacts, so nothing needs a
> lookup table:
>
> | Artifact | Path |
> |---|---|
> | Catalog entry | `src/data/catalog/workflow-catalog.json` → `<WF>` |
> | Recording | `docs/media/journey-<x>/<wf>-<slug>.mp4` |
> | This plan | `test-plans/journey-<x>/<wf>-<slug>.md` |
> | Spec | `tests/<category>/journey-<x>-<area>/<wf>-<slug>.spec.ts` |
> | Runner row | `src/data/runner/journey-<x>.csv` → `<WF>` |
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

## Expected outcomes

The catalog says what the operator *does*; this section says what the app must
*do back*, in plain sentences the spec can assert one-for-one. No requirement
ids, no EARS — one happy-path test per workflow means there is nothing for an id
to cross-reference.

Anything the workflow covers that automation will NOT assert goes here too, with
the reason, so it never reads as a silent gap:

- `(POM)` — behaviour encoded in a page object and relied on throughout rather
  than asserted (on-blur validation, the "Unsaved changes" bar).
- `— not automatable: <reason>` — legacy Delphi tool, infrastructure,
  device-side. Say which; "no" on its own gets re-litigated in six months.
- `— deferred: <reason>` — automatable, just not yet.

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
  `src/data/generated/`. Never hard-code a name that has a uniqueness rule.
- **Uniqueness rules the app enforces** (from the catalog): e.g. barcode unique
  across the database; only one record per Name per screen. List them here — they
  decide what has to be generated rather than fixed.

## Preconditions

What must already exist before the first step. Nothing for most of journey A;
journeys D and E need captured time cards or committed job cards.

- [ ] …

Implement these in the spec's own arrange phase — **on screen**, through the page
object for that form, with the factories in
[`src/data/generated/`](../src/data/generated/) for run-unique data — not by chaining
onto another spec and not by POSTing the record into existence. Fixed fixture rows
(ranch, field, crew, employee, job, crew table, question) go through
[`ensureOnScreen.ts`](../src/utils/fixtureRows/ensureOnScreen.ts): existence is a GET,
the create or repair is UI.

## API allowances

Every call this spec makes outside the browser, and which of the four allowances in
the UI-first rule covers it. A step a user performs on screen has **no row here**.
Allowance is one of `configuration` · `cleanup` · `device` · `read`.

| Step / call | Endpoint | Allowance | Why |
|---|---|---|---|
| before-hook preference read | `GET preferences` | read | gates the scenario |
| before-hook preference write | `PUT preferences` | configuration | the screen has no control for it |
| device envelope push | `POST …/UploadFile` (relay) | device | the handheld itself |
| read-back after the screen saved | `GET <entity>?<scope>` | read | records ids before the assertions run |
| after-phase teardown | `DELETE <entity>/{id}` | cleanup | registered by the flow, by id |

## Cleanup

What the workflow creates, and how it is removed. Add an entry to
[`cleanupTargets.ts`](../src/data/static/shared/cleanupTargets.ts), then `cleanup.track()`
in the spec. Records with **no name** (time cards, job cards) are never swept by
prefix — they are deleted by id, captured from a read taken before the assertions run,
so teardown still knows them when an assertion fails.

| Entity | Table | Name column | Prefix | Id source |
|---|---|---|---|---|
| … | `dbo.…` | `Name` | `QA … ` | save URL / captured POST / scoped GET |

## Test case

**One workflow, one happy-path test, one runner row, and the id is the workflow
id.** No negative, edge, boundary or additional-positive cases — if the app
needs those, they belong in a separate ticket, not this plan.

Add the row to `src/data/runner/journey-<x>.csv`, then
`npm run runner:sync && npm run runner:check`.

| id | Title | Tags | enabled |
|---|---|---|---|
| `<WF>` | … | `regression` | 0 |

The spec's describe carries the journey and workflow tags:

```ts
test.describe('<WF> · <catalog title>', { tag: ['@Journey<X>', '@<WF>'] }, () => {
    test('…', {
        tag: ['@Regression'],
        annotation: [{ type: 'testCaseId', description: '<WF>' }],
    }, async ({ pages, cleanup }) => { … });
});
```

## Open questions for the tester

Anything the recording does not settle — an ambiguous step, a value that looked
environment-specific, a validation message worth confirming.

- [ ] …
