# Inventory setup screens

The five **Inventory Setup** list screens — Inventory Item Type, Inventory Item,
Inventory Center, Unit Type and Unit — plus the sidebar group that reaches them.

No catalog journey reaches these screens, so no row carries a `workflow` or a
`journey` — see `test-plans/screens/README.md` for why inventing one would
corrupt the catalog coverage matrix.

All six tests were relocated here from the web-pet suite
(`inventory-center.spec.ts` WP-0213, `inventory-item-type.spec.ts` WP-0214,
`inventory-item.spec.ts` WP-0215, `inventory-setup.spec.ts` WP-0216,
`inventory-unit-type.spec.ts` WP-0217, `inventory-unit.spec.ts` WP-0218). The
requirements below were written from their assertions — they describe what the
six tests actually prove, which is narrow.

## Specs

| Spec | Rows | Covers |
|---|---|---|
| `tests/web/screens/inventory/inventory-setup.spec.ts` | `SCR-112`…`SCR-117` | the five list screens render the real page, and the sidebar exposes them |

Six source files became one. The assertions, describes and their order are
unchanged; only the file boundary moved. Each source was a single test with no
hooks and no shared state, all five list tests drive **one** page-object class,
and multi-describe screens files are already the norm here (`bonus-shell.spec.ts`,
`department.spec.ts`). Six six-line files would have bought no isolation.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `SCR-R200` | When the user opens any Inventory Setup list page — Inventory Center, Inventory Item, Inventory Item Type, Unit Type or Unit — PET Tiger shall render the real list page, with its heading and create link visible, and not the `InventoryStubPage` placeholder. | `SCR-112`, `SCR-113`, `SCR-114`, `SCR-116`, `SCR-117` |
| `SCR-R201` | Where the Inventory module is enabled, PET Tiger shall show the Inventory Setup group in the sidebar. | `SCR-115` |
| `SCR-R202` | When the Inventory Setup sidebar group is expanded, PET Tiger shall present the five links — Inventory Item Type, Inventory Item, Inventory Center, Unit Type and Unit — each pointing at its `/setup/inventory/*` route. | `SCR-115` |

`SCR-R203` onward is free inside this area's reserved `SCR-R200`–`SCR-R249`
block.

### Why the five list tests share one requirement

`SCR-R200` is **one** requirement covering five screens, not five near-identical
ones. The five tests assert the same three things through the same class
(`InventoryListPage(page, listUrl, headingName)`), because they verify one
product rule: the PET-207/208/209/210/215 slice family replaced a shared
placeholder with real list pages. Five ids would be five copies of one sentence
differing only in a noun.

Per-screen traceability is not lost — it is carried by the five separate rows and
their titles, so a regression on one screen still names that screen through its
failing row. The reserved block stays free for genuine per-screen rules when the
create/edit flows and the `InventoryCenterItem` junction-table grid ship.

### `SCR-R202` says "the five links", not "exactly five"

The test asserts each expected link is visible and carries the right `href`. It
never asserts the absence of a sixth. The requirement is worded to match, because
an EARS statement that claims more than its assertion proves is the same defect
as a vacuous assertion, just in the other direction.

## The stub assertion is anchored, deliberately

Each list test opens with `await expect(list.stubPage).toHaveCount(0)`. On its own
that is a **bare absence assertion**: it would pass just as happily if the route
404'd, if the app failed to mount, or if navigation never happened. The
`InventoryListPage` doc comment says so outright.

What makes it meaningful is the two positive assertions that follow — `heading`
visible and `newLink` visible. Do not drop them, and do not reorder them behind a
guard. They are the anchor; the `toHaveCount(0)` is the point.

Note the anchor is locale-sensitive: `heading` resolves
`getByRole('heading', { name: headingName })` where `headingName` is an English
literal supplied by the registry (`'Inventory Item Types'`, `'Units'`, …).
`base.fixture` does **not** pin `pt.locale`, unlike the web-pet fixture these
specs came from. That is acceptable here precisely because it is a *positive*
assertion — under a non-English session it fails loudly rather than passing
vacuously. If it ever reds for that reason the fix is a locale-neutral locator,
never deleting the assertion.

## Screens and page objects

| Screen | Route | Page object |
|---|---|---|
| Inventory Item Type list | `/setup/inventory/item-types` | `src/pages/setup/InventoryListPage.ts` |
| Inventory Item list | `/setup/inventory/items` | same class |
| Inventory Center list | `/setup/inventory/centers` | same class |
| Unit Type list | `/setup/inventory/unit-types` | same class |
| Unit list | `/setup/inventory/units` | same class |
| Sidebar | — | `src/pages/webpet/shell/AppShellPage.ts` |

`InventoryListPage` moved to `src/pages/setup/` in this batch — these six tests
were its last web-pet consumers. `AppShellPage` stays under `src/pages/webpet/`;
five web-pet specs still use it.

## Parallelism

No `mode: 'serial'`, and none should be added. The six tests share no state, have
no hooks, and create nothing — every one is read-only. Serialising would only
convert a failure into a hidden skip.

## Data

None. No factories, no fixtures, no cleanup: these tests navigate and assert.
`SCR-115` keeps its expected-link table (`EXPECTED_LINKS`) in the spec rather than
a data module, because the table **is** the assertion — the point is that exactly
these five names map to exactly these five routes.

The sidebar test uses `navLinkExact`. Substring matching would make
`'Inventory Item'` also match `'Inventory Item Type'`, and `'Unit'` match
`'Unit Type'`, tripping strict mode now that all five links are live.

## Preconditions

- [x] An authenticated session in `.auth/user.json` from the `auth-setup` project.
- [x] The Inventory module enabled for the session user. It is on by default in
      dev staging. Rows carry **no `modules` value** — every row in `screens.csv`
      leaves `segments` and `modules` empty, and the web-pet `module` column these
      specs came from was a spec-grouping label (`inventory-center`), not a
      licence gate. No gate was dropped in the move.

## Open questions for the tester

- [ ] The module-**OFF** case — sidebar group hidden, direct URL redirected — is
      still unautomated. It needs a second session whose `PT_MODULES` omits
      `Inventory`; the same harness gap `data-scoping.spec.ts` records. Until then
      `SCR-R201`'s `Where the Inventory module is enabled` precondition is
      asserted only in its true branch.
- [ ] Create, edit and multi-update on all five screens are verified manually per
      the slice docs, not automated. The `InventoryCenterItem` junction-table grid
      is likewise uncovered.
