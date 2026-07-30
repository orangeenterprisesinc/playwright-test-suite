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

## Acceptance criteria (EARS)

The catalog says what the operator *does*; this section says what the app must
*do back*. One row per verifiable outcome, written in [EARS][ears] so there is
nothing left to interpret when the spec gets written — by a person or by
`playwright-test-generator`.

Requirement ids are `<WF>-R<n>` and are stable: renumbering breaks the `Cases`
linkage both ways. Append, never re-sort.

| id | Requirement | Cases |
|---|---|---|
| `<WF>-R1` | When …, PET Tiger shall … | `<WF>-001` |
| `<WF>-R2` | If …, then PET Tiger shall … | `<WF>-002` |
| `<WF>-R3` | While …, PET Tiger shall … | (POM) |
| `<WF>-R4` | PET Tiger shall … | — not automatable: … |

`Cases` is one or more runner-row ids, or:

- `(POM)` — behaviour encoded in a page object and relied on by every case
  rather than asserted by one (on-blur validation, the "Unsaved changes" bar).
- `— not automatable: <reason>` — legacy Delphi tool, infrastructure,
  device-side. Say which; "no" on its own gets re-litigated in six months.

Every requirement needs one of the three. A requirement with an empty `Cases`
cell is an untested claim about the product.

### The five patterns

Pick the one that matches; do not mix them in a single statement.

| Pattern | Shape | Use for |
|---|---|---|
| Ubiquitous | `PET Tiger shall <response>.` | Always-on rules — field limits, formats, uniqueness |
| Event-driven | `When <trigger>, PET Tiger shall <response>.` | The happy path: a click, a save, a filter |
| State-driven | `While <state>, PET Tiger shall <response>.` | Behaviour that holds for a duration — a disabled control, a visible bar |
| Unwanted behaviour | `If <trigger>, then PET Tiger shall <response>.` | Rejections, validation failures, duplicates |
| Optional feature | `Where <module> is licensed, PET Tiger shall <response>.` | Anything behind a licence module or segment |

Complex criteria nest the qualifiers ahead of the trigger, outermost first:
`Where the Piece Payment module is licensed, when a piece scan is saved without
a sticker roll assigned, PET Tiger shall reject the scan.`

**`Where` is not decoration.** It must name a module or segment that exists in
the catalog entry above, and it must match the `modules` / `segments` columns on
the rows in `Cases` — that pairing is what `src/config/scope.ts` filters a
per-customer run on. A `Where` clause with no matching column value means the
workflow silently skips for the customer who needs it.

### Rules

1. **One outcome per statement.** If the response needs an "and" joining two
   things the test would assert separately, split it. One atomic UI reaction
   (record saved *and* toast shown) is fine as one.
2. **Name an observable response** — a message, a control state, a grid row, a
   stored value. "shall handle X correctly" and "shall work as expected" are not
   requirements; they are the ambiguity this section exists to remove.
3. **`shall`, always.** No should / may / might / is able to. Optionality lives
   in the `Where` pattern, never in the verb.
4. **Trigger first, response second.** Never invert.
5. **Don't EARS the narrative.** The ordered step table above stays prose. This
   section covers only the outcomes a test will assert.
6. **Don't guess.** If the recording does not settle what the app does, that is
   an *Open question for the tester*, not a requirement with a plausible-looking
   response. A wrong `shall` is worse than a missing one — it gets automated.

### Worked example — `A1`

From [`a01-user-setup.md`](journey-a/a01-user-setup.md), the one automated workflow:

| id | Requirement | Cases |
|---|---|---|
| `A1-R1` | When a user is saved with Name, Password, Role, Initials and Email Address populated, PET Tiger shall create the user and display "User created". | `A1-002` |
| `A1-R2` | When the Users list is filtered by Name, PET Tiger shall display the matching user's row. | `A1-001`, `A1-002` |
| `A1-R3` | While the last-edited field on the General tab has not been blurred, PET Tiger shall keep Save disabled. | (POM) |
| `A1-R4` | If Initials match those of an existing user, then PET Tiger shall keep Save disabled and display "Already in use". | `A1-005` |
| `A1-R5` | PET Tiger shall limit Initials to 3 characters. | `A1-005` |
| `A1-R6` | PET Tiger shall offer the 17 documented Role options in the documented order. | `A1-004` |
| `A1-R7` | When a user is deleted, PET Tiger shall release its Name, Initials and Email Address for reuse. | `A1-001` |
| `A1-R8` | When a serial is applied, PET Tiger shall enable the modules it encodes. | — not automatable: serials are generated in the legacy PET Setup (Delphi) tool, which has no web surface |

Note what `R3` and `R4` separate. Both leave Save disabled, but one is
"still validating" and the other is "rejected" — the same pixel meaning two
different things is exactly the collision `SetupScreenPage.rejectionMessage`
exists to resolve, and prose acceptance criteria never surfaced it.

[ears]: https://alistairmavin.com/ears/

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

`Req` is the other half of the acceptance-criteria linkage — the requirements
this case covers, comma-separated. It mirrors the `Cases` column above; the two
must agree. A case that cites no requirement is a test with no stated reason to
exist, and is usually a sign the criterion was never written down.

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `<WF>-001` | … | `<WF>-R1` | `smoke\|regression` | 0 |
| `<WF>-002` | … | `<WF>-R2`, `<WF>-R4` | `regression` | 0 |

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
