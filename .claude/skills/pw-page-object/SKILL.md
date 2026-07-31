---
name: pw-page-object
description: Use when adding a new page object (a new screen) to this repository, or when a spec needs a screen that has no class yet. Scaffolds `src/pages/**/<Name>Page.ts` in the repo's class/locator style and registers it in the correct lazy registry — `pages.fixture.ts` (PageObjects) or `webpetPages.fixture.ts` (WebpetPages). The registration step is the one that gets forgotten.
---

## Playwright Page Object Scaffolder

### What this skill is for

Adding a screen. Two things have to happen and only the first is obvious:

1. the class under `src/pages/<area>/<Name>Page.ts`
2. **registration in the lazy registry** — an import, an interface member, and a getter

Skip step 2 and the class compiles, the spec does not: `pages.myScreen` is a type
error, or worse, an existing member is shadowed. Do both in the same change.

### Pick the registry first — there are two, and they do not mix

| Suite | Registry file | Interface | Factory | Specs reach it via |
|---|---|---|---|---|
| Journey suites (`tests/web/`, `tests/api/`) | [src/fixtures/pages.fixture.ts](src/fixtures/pages.fixture.ts) | `PageObjects` | `createPageObjects` | `@fixtures/base.fixture` → `pages.x` |
| Migrated web-pet suite (`tests/webpet/`) | [src/fixtures/webpetPages.fixture.ts](src/fixtures/webpetPages.fixture.ts) | `WebpetPages` | `createWebpetPages` | `@fixtures/webpet.fixture` → `pages.x` |

They are deliberately separate. `PageObjects` targets the legacy shell; `WebpetPages`
targets the SPA. Putting a web-pet screen into `PageObjects` gives specs a member
that will never work against their app.

### Registration — the three edits

All three live in the registry file, in the same order the file already uses
(alphabetical-ish within its area comment block):

```typescript
// 1. import, grouped with its area
import { RanchListPage } from '../pages/webpet/setup/RanchListPage';

// 2. interface member — keep the `readonly`, keep a one-line doc comment that
//    says which route it models
export interface WebpetPages {
    /** Ranch list (`/setup/ranches`) — inline edit, multi-edit, undo, URL state. */
    readonly ranchList: RanchListPage;
}

// 3. lazy getter in the returned object
get ranchList() { return lazy('ranchList', () => new RanchListPage(page)); },
```

The memo key is the property name. Reusing a key that already exists returns the
wrong class from the cache — a failure that reads like a selector bug.

**A class parameterised by route is bound multiple times, not copied.** Five
structurally identical inventory lists share `InventoryListPage`:

```typescript
get inventoryItemList() {
    return lazy('inventoryItemList', () => new InventoryListPage(page, '/setup/inventory/items', 'Inventory Items'));
},
```

Before writing a new class, check whether an existing one differs only by URL and
heading — if so, add a binding, not a file.

### Named shortcut fixtures — only for the journey suite, only when asked

[src/fixtures/base.fixture.ts](src/fixtures/base.fixture.ts) exposes `loginPage`,
`leftNavigationPage`, `usersPage` as thin fixtures that resolve through `pages`.
They exist for specs written before `pages` did. Do not add new ones by default —
new specs should destructure `pages`. Add one only if the user explicitly wants
the shortcut, and implement it the same way:

```typescript
usersPage: async ({ pages }, use) => {
    await use(pages.users);
},
```

`webpet.fixture.ts` has no shortcuts at all. Do not introduce the pattern there.

### Pick the base class

| Situation | Extend | Reference to copy |
|---|---|---|
| Journey list + New/Edit form screen (Ranch, Field, Crop, Job, Crew, Employee, Equipment…) | `SetupScreenPage` | [src/pages/admin/UsersPage.ts](src/pages/admin/UsersPage.ts) |
| Any other journey screen | `BasePage` | [src/pages/shell/LoginPage.ts](src/pages/shell/LoginPage.ts) |
| web-pet create/edit form | `WebpetFormPage` | [src/pages/webpet/setup/CropFormPage.ts](src/pages/webpet/setup/CropFormPage.ts) |
| web-pet list | `WebpetListPage` | [src/pages/webpet/setup/CropListPage.ts](src/pages/webpet/setup/CropListPage.ts) |
| Reusable fragment shared across screens (toast, picker, grid, footer) | `BaseComponent` under `src/components/` | [src/components/webpet/ToastComponent.ts](src/components/webpet/ToastComponent.ts) |

**Never extend `SetupScreenPage` for a web-pet screen.** It contradicts that app on
six of its seven behaviours — sidebar navigation, `New <Entity>` button, named grid,
row keying, single rejection message, and a `submitForm()` whose two 15s windows
exceed the webpet project's own 30s test timeout. The table in
[src/pages/webpet/README.md](src/pages/webpet/README.md) lists each one; read it
before arguing with this rule.

### Class shape

`BasePage` is abstract on two members, so both are mandatory:

```typescript
export class RanchListPage extends WebpetListPage {
    readonly pageUrl: string;              // relative; navigate() resolves against baseURL
    readonly pageTitle: string | RegExp;   // /.*/ when the screen has no title worth asserting
```

Rules the whole repo follows:

- locators are `readonly Locator` fields **assigned in the constructor**, never
  built inline in a method and never in a spec
- a locator that needs an argument is a **method returning `Locator`**:
  `editUserLink(name: string): Locator`
- the two abstract bases own the shared machinery — grid, footer, unsaved-changes
  modal, submit outcome. A concrete screen supplies its config object, its fields,
  and its `fill*` methods. Nothing else.
- config objects: `SetupScreenConfig` (`listUrl`, `gridName`, `entity`, `menuPath`,
  `rejectionMessage`) or `WebpetFormConfig` (`listUrl`, `entity`)
- naming: locators `nameInput`, `saveButton`, `initialsAlreadyInUseError`; actions
  `createUser`, `gotoNew`, `fillName`; assertions `expectListedWithDetails`,
  `expectAbsentFromList`
- a screen with a distinct submit outcome names its own union type
  (`type SaveOutcome = 'created' | 'duplicate-initials'`) rather than reusing the
  base's generic `'rejected'`

Locator style is governed by **pw-locator-hardening** — accessible name first,
`.nth()` only where an index is the thing under test. Follow it here.

### Behaviours the bases already handle — do not re-implement

- on-blur validation: the last field filled must be blurred before Save enables
- Save staying disabled *is* the rejection signal on journey setup screens
- the unsaved-changes guard (a bar in the legacy shell, a modal with
  **Don't Save** in web-pet)
- grid column filters, row lookup, `Total N rows`, absence checks

### Test-data cleanup

If the screen creates records, register the entity in
[src/data/static/shared/cleanupTargets.ts](src/data/static/shared/cleanupTargets.ts)
so specs can call `cleanup.track(...)`. Never hand-write SQL in a page object or a spec.

### Verify before reporting done

```
npm run typecheck        # catches the missing interface member / wrong ctor args
npm run lint
```

Then run one spec that uses the new screen. A page object nothing exercises is
not evidence.

### Checklist

- [ ] correct registry chosen (`pages.fixture.ts` vs `webpetPages.fixture.ts`)
- [ ] all **three** registration edits made: import, interface member, getter
- [ ] memo key is unique and matches the property name
- [ ] checked for an existing class that only differs by route → added a binding instead
- [ ] correct base class; `SetupScreenPage` not used for a web-pet screen
- [ ] `pageUrl` and `pageTitle` both defined
- [ ] every locator is a constructor-assigned field or a method returning `Locator`
- [ ] no selector left in a spec
- [ ] `npm run typecheck` clean
