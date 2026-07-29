import type { Page, Locator } from '@playwright/test'
import { expect } from '@playwright/test'

// ── Helpers for specs interacting with ParentPicker controls ─────────────
//
// ParentPicker renders one of two modes, neither of which is a native form
// control:
//
//   1. Sheet mode — base-ui <Select> primitive (shadcn-wrapped): a trigger
//      <button data-slot="select-trigger"> whose options live in a portaled
//      popup <div data-slot="select-content">. Options are rendered as
//      <div data-slot="select-item" data-value="…">. There is NO native
//      <select> and NO <option> elements; `.selectOption()` and
//      `.locator('option')` do not work in sheet mode.
//
//   2. Combobox mode — base-ui <Combobox>: a native <input data-slot=
//      "combobox-input"> beside a portaled <div data-slot="combobox-popup">.
//      The input still accepts `.fill()` and value assertions, but selection
//      happens by clicking inside the popup.
//
// In both modes the <Label> renders as a sibling of the picker inside a
// shared grid cell (`div.space-y-1`). Sheet-mode pickers wire the label via
// the trigger's `id` attribute (added in PET-251), so `getByLabel` works.
// Combobox-mode pickers already wired the input's `id` via the `name` prop.

export function pickerCell(page: Page, labelText: string): Locator {
  // The grid cell is `<div class="col-span-12 ... space-y-1">` containing the
  // <Label> and then the picker. Required fields render their label as
  // `"X *"`; optional ones render `"X"`. Match either.
  const labelRe = new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\*)?$`)
  return page
    .locator('div.space-y-1')
    .filter({ has: page.locator('label').filter({ hasText: labelRe }) })
}

// ── Combobox mode ────────────────────────────────────────────────────────

export function comboboxInput(page: Page, labelText: string): Locator {
  return pickerCell(page, labelText).locator('[data-slot="combobox-input"]').first()
}

export async function openCombobox(input: Locator) {
  await input.click()
  // Popup content renders in a portal; wait for any visible combobox-popup.
  await expect(input.page().locator('[data-slot="combobox-popup"]')).toBeVisible()
}

// ── Sheet mode ───────────────────────────────────────────────────────────
//
// `sheetSelect` returns the TRIGGER button — not a native <select>. Reading
// `.locator('option')` or chaining `.selectOption()` no longer works; use
// the action helpers below.

export function sheetSelect(page: Page, labelText: string): Locator {
  return pickerCell(page, labelText).locator('[data-slot="select-trigger"]').first()
}

/** Click the trigger and wait for the portaled content to appear. */
export async function openSheetSelect(page: Page, labelText: string) {
  await sheetSelect(page, labelText).click()
  await expect(page.locator('[data-slot="select-content"]')).toBeVisible()
}

/**
 * Open the sheet-mode select and click the option whose `value` prop equals
 * the given string. Matches the legacy `.selectOption(value)` semantics where
 * tests pass entity ids like `'5'` or `'31'`. Relies on the wrapper
 * `SelectItem` emitting `data-value={String(props.value)}` (added in PET-251).
 */
export async function selectSheetOption(page: Page, labelText: string, value: string) {
  await openSheetSelect(page, labelText)
  await page.locator(`[data-slot="select-item"][data-value="${value}"]`).first().click()
  // Wait for the portal to close so subsequent locators are stable.
  await expect(page.locator('[data-slot="select-content"]')).toBeHidden()
}

/** Locator for the trigger's visible label (the text shown when an option is selected). */
export function sheetSelectValue(page: Page, labelText: string): Locator {
  return sheetSelect(page, labelText).locator('[data-slot="select-value"]')
}
