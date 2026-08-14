# Bonus wizard

The Bonus Payment wizard (`/bonus`, `/bonus/:type`) — a two-step flow over the
18 `BonusTypeOptions`: Step 1 selects records through a per-type filter panel,
Step 2 reviews the computed rows and offers the commit affordance.

No catalog journey reaches this screen, so it carries no `workflow` and no
`journey` — see `test-plans/screens/README.md` for why inventing one would
corrupt the catalog coverage matrix.

Both specs were relocated here from the web-pet suite
(`tests/webpet/bonus-flow.spec.ts`, WEBPET-861; `tests/webpet/bonus-shell.spec.ts`,
slice-bonus-shell). The requirements below were written from their assertions,
not the other way round — they describe what the 77 tests actually prove.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/screens/bonus/bonus-flow.spec.ts` | `SCR-001`…`SCR-039` | the per-type *flow* — selection → results grid → review → commit affordance, for all 18 types |
| `tests/web/screens/bonus/bonus-shell.spec.ts` | `SCR-040`…`SCR-077` | the *shell* — landing page, wizard chrome, per-type panel field sets, sub-selection, error paths |

The split is the original one and worth keeping: `bonus-flow` is a uniform sweep
where all 18 types run the same three assertion bodies, while `bonus-shell` is 38
individually-authored cases about specific screens. Compute *maths* is covered by
Go unit tests (`apps/api/internal/bonus/*_grid_test.go`) and is out of scope for
both.

## What "flow pass" means (and why empty grids count)

Each per-type Step-1 filter is only "valid" once that panel's non-date
preferences — e.g. a real Bonus Job counter — are present in localStorage. Those
counters are DB-specific and no fixture has guaranteed seedable rows for every
type, so the **empty-results / empty-filter banner is a sanctioned pass** for the
flow sweep. Asserting a visible `[data-testid^="<gridPrefix>"]` container proves
the selection → results → review wiring end-to-end for that type without brittle
per-type DB seeding.

This is a deliberate ceiling on what `SCR-R005` claims, not an oversight.

## Acceptance criteria (EARS)

Ids are stable — append, never re-sort. Range `SCR-R001`–`SCR-R099` is this
area's block.

| id | Requirement | Cases |
|---|---|---|
| `SCR-R001` | PET Tiger shall offer exactly 18 bonus types, each with a unique catalog key and a unique review-grid test id. | `SCR-001` |
| `SCR-R002` | When a bonus type's wizard is opened at Step 1, PET Tiger shall mount that type's own filter panel. | `SCR-002`…`SCR-019`, `SCR-038`, `SCR-039`, `SCR-044`, `SCR-045` |
| `SCR-R003` | While a bonus type's Step-1 filter is not yet valid, PET Tiger shall render Continue in a disabled state. | `SCR-002`…`SCR-019`, `SCR-038`, `SCR-039`, `SCR-046` |
| `SCR-R004` | PET Tiger shall give the Step-1 Continue control a non-empty `aria-label`. | `SCR-002`…`SCR-019` |
| `SCR-R005` | When a bonus type's wizard is opened directly at Step 2, PET Tiger shall mount that type's review-grid container in one of its empty-filter, loading, error or populated states. | `SCR-020`…`SCR-037`, `SCR-038`, `SCR-039` |
| `SCR-R006` | When the Step-2 review is shown, PET Tiger shall render the Execute commit control with a non-empty `aria-label`. | `SCR-020`…`SCR-037` |
| `SCR-R007` | When the Step-2 review is shown, PET Tiger shall render a Back control. | `SCR-020`…`SCR-037` |
| `SCR-R008` | Where a bonus type computes from its own panel fields rather than a shared date range, PET Tiger shall render no shared start-date or end-date input. | `SCR-038`, `SCR-039`, `SCR-044`, `SCR-045` |
| `SCR-R009` | When the bonus landing page is opened, PET Tiger shall list all 18 bonus types as navigable cards. | `SCR-040` |
| `SCR-R010` | When a bonus type's card is clicked, PET Tiger shall navigate to that type's wizard. | `SCR-041` |
| `SCR-R011` | When a bonus type's wizard is opened at Step 1, PET Tiger shall show a heading naming that bonus type and the record-selection step. | `SCR-042` |
| `SCR-R012` | Where a bonus type takes a shared date range, PET Tiger shall render both the start-date and the end-date input on Step 1. | `SCR-043` |
| `SCR-R013` | When a bonus type's wizard is opened at Step 1, PET Tiger shall render the Save filter and Load filter controls in an enabled state. | `SCR-047` |
| `SCR-R014` | When Cancel is clicked in the wizard, PET Tiger shall return to the bonus landing page. | `SCR-048` |
| `SCR-R015` | When a bonus type's wizard is opened at Step 1, PET Tiger shall render that type's configured selection fields. | `SCR-049`…`SCR-065` |
| `SCR-R016` | While quality measurement is deferred, PET Tiger shall show the deferred-measurement notice on the Quality Incentive panel. | `SCR-058` |
| `SCR-R017` | If a bonus type's Step 2 is opened without a filter having been applied, then PET Tiger shall render that type's missing-filter banner. | `SCR-066`, `SCR-067`, `SCR-068`, `SCR-070` |
| `SCR-R018` | When Back is clicked on Step 2, PET Tiger shall return to Step 1 with that type's filter panel mounted and no `step` query parameter. | `SCR-069` |
| `SCR-R019` | Where a bonus type is configured for sub-selection, PET Tiger shall render the sub-selection column-picker panel. | `SCR-071`…`SCR-075` |
| `SCR-R020` | If an unknown bonus type is navigated to, then PET Tiger shall redirect to the landing page and raise an error toast. | `SCR-076` |
| `SCR-R021` | If the bonus types endpoint returns HTTP 403, then PET Tiger shall not render the bonus types grid. | `SCR-077` |

Notes on what the tests literally check, so the requirements are not read as
stronger than the evidence:

- `SCR-R005` is satisfied by **any** of the per-type review container's states,
  including the empty-filter banner — see the section above. It proves the wiring
  reaches the review panel, not that a computation produced rows.
- `SCR-R006` and `SCR-R007` assert presence and a non-empty `aria-label`. Execute
  is legitimately *disabled* with no included rows, so neither is a proof that a
  commit succeeds; a live commit needs seeded compute rows and is a manual step.
- `SCR-R008` is a negative — `toHaveCount(0)` on the two date inputs. Each of the
  four cases pairs it with a positive assertion that the type's own panel mounted,
  so an entirely blank page fails rather than passing vacuously. See the locale
  note below, which is the reason this matters.
- `SCR-R015` covers 17 panels with different field sets; the per-panel expectation
  is in the spec, not restated here. Several panels also render Ranch/Field only
  when the `fieldEntryRequired` preference is set, so those two fields are
  deliberately *not* asserted.
- `SCR-R003` is proven twice over — once per type in the sweep and once in the
  shell — because the sweep asserts it as part of the flow contract and the shell
  asserts it as the selection step's own behaviour.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Bonus landing | `/bonus` | `src/pages/bonus/BonusWizardPage.ts` |
| Bonus wizard Step 1 | `/bonus/:type` | same |
| Bonus wizard Step 2 | `/bonus/:type?step=2` | same |

`BonusWizardPage` relocated from `src/pages/webpet/bonus/` with these specs. It
still imports the case table from `src/data/webpet/bonusTypes.ts` — a type-only
import of pure data, which moves with a later batch.

### The date-filter locator, and why it changed in the move

The shared date inputs used to be matched by label text:

```typescript
page.getByLabel('Start Date/Time In')
```

That label is an i18n string (`wizard.dateFilter.start.label`), and the web-pet
project pinned the browser locale to `en-US`, pinned `pt.locale` to `en` via
`addInitScript`, and rewrote `/api/session/me` so `user.language` was always
`'en'`. `base.fixture` does none of that.

`SCR-R008`'s four cases assert `toHaveCount(0)` on those inputs. Relocating them
unchanged would have made the locator match nothing for a non-English user — and
a negative assertion against a locator that cannot match anything **passes while
proving nothing**. The page object now matches `#startDate` / `#endDate`, the
form-field ids, which are locale-neutral and are what the app actually renders:

```jsx
<Label htmlFor="startDate">{t('wizard.dateFilter.start.label')}</Label>
<Input id="startDate" type="date" … />
```

The app exposes no `data-testid` on these two inputs; the ids are the next best
stable handle. If testids are added later, prefer them.

`SCR-R012` (the positive case) used the same locator and moved with it.

### Assertions that still depend on English text

`SCR-R011` and `SCR-R015` match English label and heading text
(`getByLabel(/Bonus Unit/)`, `/Employee Bonus Payment.*1\/2 Record Selection/`,
and roughly seventy more). These were **not** changed, because they are positive
assertions: under a non-English session they fail loudly, which is a visible red,
not a silent green. They are listed here so a later UI batch knows the exposure
exists and can decide between reproducing the locale pin and moving the app to
testids.

Everything else in both specs is matched by `data-testid` and is locale-neutral.

## Data

- **Case table** — `src/data/webpet/bonusTypes.ts` (`BONUS_TYPES`,
  `DATE_EXEMPT_BONUS_TYPES`, `bonusTypeByKey`). Shared by both specs and by the
  page object; `as const`, in the API's own order
  (`apps/api/internal/bonus/types.go`, `BonusTypeOptions` 0–17).
- **Generated values** — none. Neither spec creates a record.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup`
      project.
- [ ] The session user needs the `BonusPayment` module plus `bonus.view` and
      `records.create`. The web-pet fixture seeded exactly that; the journey
      suite's `USER_NAME` (`su` on dev staging) is assumed to hold it but has not
      been verified independently. A 403 on the landing grid means it does not.
- [ ] The session user's `language` should be `en` for `SCR-R011` / `SCR-R015`
      (see above). Unverified — the web-pet fixture forced it.

## Cleanup

None. Both specs are read-only: they navigate, assert, and commit nothing. The
one mutating affordance (Execute) is asserted for presence only, never clicked.

## Test cases

`src/data/runner/screens.csv`. All 77 rows are `regression`, `enabled=1`,
`status=automated`, and carry no `workflow`/`journey`.

| id range | Spec | Group |
|---|---|---|
| `SCR-001` | flow | 18-type table integrity |
| `SCR-002`…`SCR-019` | flow | Step-1 panel + Continue gate, one per type |
| `SCR-020`…`SCR-037` | flow | Step-2 review grid + commit affordance, one per type |
| `SCR-038`, `SCR-039` | flow | the two date-exempt types |
| `SCR-040`, `SCR-041` | shell | landing page |
| `SCR-042`…`SCR-065` | shell | wizard Step 1 — chrome and per-type panel fields |
| `SCR-066`…`SCR-070` | shell | wizard Step 2 — missing-filter banners and Back |
| `SCR-071`…`SCR-075` | shell | sub-selection panel |
| `SCR-076`, `SCR-077` | shell | error paths |

`SCR-002`…`SCR-037` are 36 rows citing only three distinct requirement sets,
because they run the **same assertion body** against 18 different types. They are
still 36 literal `test()` calls rather than a loop: `runner:check` parses specs
with regular expressions, so a template-literal title or a computed annotation is
invisible to it and therefore exempt from every tag, tier and requirement rule
(see `scripts/runner/lib/runner-data.js`). The loop that used to generate them
also needed a generated id map, `src/data/webpet/ids/bonusFlowIds.ts`, which is
deleted rather than ported.

**No row carries `smoke`.** Four did in the web-pet vocabulary — one in the sweep
and three in the shell — but `runner:check` allows at most one `@Smoke` per spec
file and treats it as *the* happy path. Three candidates in one file had no
principled winner, so the tier was dropped rather than arbitrarily assigned. If
bonus should gate a smoke run, the happy path is most likely `SCR-040` (the
landing page lists all 18 types); make that a deliberate choice, not a leftover.

## Open questions for the tester

- [ ] Does the journey suite's `USER_NAME` hold `bonus.view`, `records.create`
      and the `BonusPayment` module on dev staging? Every test in both files
      depends on it.
- [ ] Is that user's `language` `en`? If not, `SCR-042` and `SCR-049`…`SCR-065`
      will fail on text. Worth deciding whether the journey suite wants the
      web-pet locale pin reproduced as shared-core behaviour.
- [ ] Should bonus own a `@Smoke` case at all? See the note above.
- [ ] `SCR-045` asserts only the start-date input is absent, where `SCR-044`
      asserts both. That asymmetry came across in the relocation untouched; it is
      probably an oversight in the original and worth levelling up.
