# src/pages/webpet — page objects for the migrated web-pet suite

Home of the **framework alignment** of `tests/webpet/` — 406 tests in 56 spec files, lifted
page-object-free and since converted in fourteen batches (see
[tests/webpet/README.md](../../../tests/webpet/README.md)).

**Status: conversion complete.** All 56 spec files import `@fixtures/webpet.fixture`, all 406 tests
carry a `testCaseId` annotation, and no spec declares a raw selector. 47 page objects across seven
areas, plus 9 components in `src/components/webpet/`.

Page objects follow this repo's conventions — `<Name>Page.ts`, locators declared as `readonly
Locator` fields assigned in the constructor, parameterised locators as methods, no selectors in
specs — and live **here, not in the framework's shared page folders**, so the migrated suite stays
isolated from the journey suites.

## Layout

| Area | Screens |
|---|---|
| `setup/` | 32 — the `/setup/**` form and list pairs, plus the inventory and traceability lookups |
| `accounting/` | 3 — Export v1 filter, Export v2 dispatch workspace, Reconcile Job Cards |
| `settings/` | 3 — Profile, Users form, Report Editor |
| `shell/` | 3 — App shell + sidebar, Dashboard, Login |
| `scan/` | 2 — Scan landing grid, Scan screen (one class for all 25 routes) |
| `input/` | 2 — Time In list, Time card entry forms |
| `bonus/` | 1 — the two-step wizard over all 18 bonus types |

Two abstract bases sit at the root: **`WebpetFormPage`** and **`WebpetListPage`**.

## Do NOT extend `SetupScreenPage`

`src/pages/SetupScreenPage.ts` models the *journey* suite's screens and contradicts the web-pet
app on six of its seven behaviours:

| `SetupScreenPage` assumes | web-pet actually does |
|---|---|
| `gotoList()` walks the sidebar via `LeftNavigationPage.openViaMenu()` | navigates by URL — `page.goto('/setup/crops/new')`; **zero** webpet specs touch the sidebar |
| `newButton` = `getByRole('button', { name: 'New <Entity>' })` | an `<a href>` create anchor (see the note in `inventory-center.spec.ts`), or a role=button link |
| `grid` = `DataGridComponent` → `getByRole('grid', { name })` | a bare `[role="grid"]` with no accessible name — 18 spec files rely on this |
| rows keyed by `editLink(name)` → `Edit Crop: <name>` | rows keyed by **id**: `a[href="/setup/ranches/${id}"]`, chosen deliberately because names collide across columns |
| one `rejectionMessage` per screen | three surfaces: blur-time inline, server-409 body text, and *no message at all* (some screens raise a native `alert()`) |
| `submitForm()` — two 15 s `toPass` windows | 30 s total, which **equals** the `webpet` project's own 30 s test timeout → guaranteed timeout |
| `saveEdit()` waits for an "Unsaved changes" bar to hide | web-pet relabels `Cancel` → `Discard changes` and raises a modal with `Don't Save`. `toBeHidden()` on a never-rendered bar passes **vacuously** |

Extend the web-pet bases instead:

- **`WebpetFormPage`** — URL-navigated `/setup/<entity>/{new,:id}`, the FormFooter save contract
  (Save gated on `isDirty && isValid`, validation on blur), the `Discard changes` → `Don't Save`
  guard, the blur-time `/api/validation/unique` check, and the `N error` summary button.
- **`WebpetListPage`** — bare `[role="grid"]`, id-keyed rows, href-based create affordance.

`BasePage` and `BaseComponent` **are** reused — they are the framework's real contracts and
nothing in them conflicts. A handful of screens extend `BasePage` directly, because they are
neither a setup form nor a setup list: the wizard, the scan screens, the shell, the accounting
workspaces.

## Do NOT import `src/fixtures/base.fixture.ts`

> **This file previously told you to do exactly that. It was wrong.** Recorded here so the
> mistake is not repeated.

`base.fixture.ts` resolves a `testCaseId` through `DataProvider`, whose singleton is bound
process-wide to `src/data/runner/`. Web-pet rows live in `src/data/webpet/`, so every `WP-####`
would hit the "has no runner row" branch and **all 406 tests would skip while the run reported
green**.

Specs import from **`src/fixtures/webpet.fixture.ts`**, which composes the same framework building
blocks (`executionGate`, Allure labelling, lifecycle listeners) against the web-pet row source.

Related: gating must be an `{ auto: true }` fixture in **both** suites, never a module-level
`test.beforeEach`. Measured behaviour — a module-scope hook in a fixture module attaches only to
the spec file that is loading at import time, so it fires for the **first spec file each worker
loads and no others**. `base.fixture.ts` used to get this wrong and was only partly gating its
journey suites; it now uses a `gate` auto fixture like this one. Do not "upgrade" either to a
`beforeEach`.

## Deliberate near-duplicates — do not consolidate

Several classes carry two or three locators that look interchangeable and are not. Each is
documented at its definition; collapsing any of them reintroduces a bug the suite already hit:

- `FormFooterComponent.saveButton` (substring) vs `saveButtonExact` vs `RanchFormPage.saveButton`
  (`/^Save/`) — substring `'Save'` also matches "Don't Save", so it trips strict mode wherever the
  unsaved-changes modal can be mounted.
- `ScanScreenPage.scanInput` (strict) vs `anyScanInput` (`.first()`) — the driver screens render
  two elements sharing `id="scan-input"`, a real app defect; `.first()` is scoped to the route
  lists that include them, so the strict matcher still catches a duplicate anywhere else.
- `ExportDispatchWorkspacePage.counter(...)` vs `readiness(...)` — two testid families from two
  chrome generations, with different keys and different data sources.
- `AppShellPage.navLink` / `navLinkExact` / `navLinkNamed` / `navLinkMatching` — anchored,
  case-sensitive-exact, default substring, and arbitrary-regex. A lifted spec's matcher has to be
  relocated to the one with the same semantics.
- `WebpetDataGridComponent.roleRows` vs `rowAt` — `getByRole('row')` also matches native `<tr>`.

## Ground rules

- Relocate locators; never rewrite them. Same selector text, same action order, same assertions —
  a batch is accepted by diffing against the committed per-test baseline, and a "better" selector
  is indistinguishable from a regression.
- Keep `page.route(...)` mocks — and the payload builders that feed them — in the spec. Their
  shapes deliberately differ between files; a shared factory would change what the app receives.
- A page object must never call `test.skip`. Expose the condition (`isDisabled()`,
  `applyLast30IfEnabled()`) and let the spec decide, or a skipped test reads as a passing one at
  the callsite.
- Every test carries `annotation: { type: 'testCaseId', description: 'WP-####' }`; ids never
  renumber. Loop-generated tests take their id from a generated map in `src/data/webpet/ids/`,
  keyed on a business field — never an array index.
- Nothing may change the collected test count. `webpet:ids:check` asserts
  `discovered === non-stale rows`.
