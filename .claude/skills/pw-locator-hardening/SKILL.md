---
name: pw-locator-hardening
description: Use when a locator is brittle or ambiguous — a strict-mode violation ("resolved to N elements"), a selector that broke on a UI change, a CSS/XPath chain, or an `.nth()` / `.first()` used to paper over ambiguity. Gives this repo's locator priority, how to narrow instead of index, when `.nth()` is legitimate, and the anti-patterns that keep coming back.
---

## Playwright Locator Hardening

### The one rule

A locator should describe **what the element is to a user**, and be unique because
of that description — not because of where it happens to sit in the DOM.
`.first()` and `.nth()` make an ambiguous locator *quiet*, not *correct*: the
element they pick changes the next time the app renders one more row, one more
dialog, or one more hidden duplicate.

### Priority order

1. `getByRole(role, { name })` — the default. 145 uses in `src/pages` / `src/components`.
2. `getByLabel` / `getByPlaceholder` — form fields with no useful role name.
3. `getByTestId` — where the app ships explicit test ids (the web-pet SPA does:
   `getByTestId('bonus-wizard-execute')`).
4. `getByText` — stable, human-visible copy only.
5. CSS — **last resort**, and only for a library slot the component gives no role
   for: `[data-slot="select-trigger"]`, `[role="grid"]` on a grid with no
   accessible name. Never a generated class or hashed id.
6. XPath — effectively banned. There is exactly one in the repo
   ([RanchFormPage](src/pages/webpet/setup/RanchFormPage.ts#L63)), used to express
   *"the button on the heading's parent row"* because the containment **is** the
   assertion. If you cannot write that sentence about your XPath, don't use it.

### Fixing a strict-mode violation

`locator(…) resolved to N elements` means the description is not specific enough.
Narrow it, in this order:

**1. Scope to a container.** Almost always the right answer.

```typescript
// ✗ ambiguous across the whole page
page.getByRole('button', { name: 'Save' })
// ✓ scoped to the region that owns it
this.footer.saveButton
this.generalSection.getByRole('button', { name: 'Save' })
```

**2. Filter by content the element contains.** This is how the grid finds a row —
by the edit link inside it, never by index
([DataGridComponent](src/components/DataGridComponent.ts#L56)):

```typescript
rowFor(name: string): Locator {
    return this.page.getByRole('row').filter({ has: this.editLink(name) });
}
```

`filter({ has })` / `filter({ hasText })` survives column reordering, added rows
and pagination. An index does not.

**3. Make the name exact.** `{ name: 'Name' }` also matches "Name *" and
"Last Name"; `{ name: 'Name *', exact: true }` does not. Use a regex when the copy
carries variable whitespace or casing: `{ name: /Edit Map/i }`.

**4. Parameterise instead of concatenating in the spec.** A locator that needs a
value is a method on the page object:

```typescript
editUserLink(name: string): Locator {
    return this.page.getByRole('link', { name: `Edit ${this.entity}: ${name}` });
}
```

Only after 1–4 all fail should you consider an index — and then read the next
section, because it probably still isn't the answer.

### When `.nth()` is legitimate

There are 17 `.nth()` uses in this repo and every one is inside a component or page
object where **the index is the thing being addressed**, not a tie-breaker:

```typescript
// WebpetDataGridComponent — "the cell in column i of this row" is the real API
cellAt(row: Locator, index: number): Locator { return row.getByRole('cell').nth(index); }
```

So: `.nth()` / `.first()` / `.last()` are allowed when the caller genuinely asks for
"the Nth one" and the call lives in a page object or component. They are **not**
allowed in a spec, and not allowed as a fix for a strict-mode error.

The counter-example is worth reading in full —
[DataGridComponent](src/components/DataGridComponent.ts#L77) documents why
index-based column filtering was deliberately *not* implemented: that grid renders
12 header cells but 3 filter boxes, and the filter boxes sit in blank headers, so
header index and filter index do not correspond. An index mapping that looked
obviously correct would have been wrong on every screen that inherits it.

### Anti-patterns

| Don't | Why | Instead |
|---|---|---|
| `.first()` to clear a strict violation | picks an arbitrary element; hides a duplicate-render bug | scope or `filter({ has })` |
| `:nth-child(3)`, long CSS descendant chains | breaks on any DOM reshuffle | role + name inside a scoped container |
| generated ids / hashed classes (`.css-1x2y3z`, `#mui-4821`) | regenerate per build | `data-testid`, or a role |
| text containing test data (`getByText('Crop_1699887')`) | couples the locator to the fixture | `filter({ hasText })` on a stable row locator |
| a raw selector in a `*.spec.ts` | 0 of 56 web-pet specs do this; keep it that way | move it to the page object |
| `toBeHidden()` on an element that never renders | passes vacuously — a documented trap here | assert the element that *does* render |
| re-querying with `page.waitForSelector` | pre-locator API, no auto-retry semantics the rest of the repo relies on | web-first `expect(locator)` |

### Text stability

The web-pet project pins `locale: 'en-US'` and forces `pt.locale = 'en'` in the
fixture, and rewrites `/api/session/me` so the seeded user's language cannot
override it. English accessible names are therefore stable in that suite **by
construction** — do not "harden" them into CSS to dodge a translation problem that
the fixture already solved.

### Verifying a hardened locator

- re-run the test; then re-run it against a list with **more than one** matching
  record — that is the case an index-based locator fails
- `npx playwright show-trace artifacts/results/<dir>/trace.zip` — check the DOM
  snapshot at the step, not just the final screenshot
- `error-context.md` in the same folder is an ARIA snapshot: it tells you the roles
  and accessible names actually available, which is the fastest way to pick the
  right `getByRole`
- interactively, `npx playwright codegen` or the Playwright MCP
  `browser_generate_locator` tool will propose a locator against the live page —
  still apply the priority order above to what it returns

### Checklist

- [ ] role + accessible name attempted first
- [ ] uniqueness comes from scope or `filter({ has/hasText })`, not an index
- [ ] `exact: true` where the name is a prefix of another
- [ ] any `.nth()` addresses a real index and lives in a page object/component
- [ ] no XPath, no generated ids, no `:nth-child`
- [ ] no selector left in the spec
- [ ] verified against a multi-match dataset, not just the happy single-row case
