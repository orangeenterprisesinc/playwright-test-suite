import { test, expect } from './fixtures'
import { comboboxInput, pickerCell } from './parent-picker-helpers'
import { ensureCrew, deleteCrew, type EnsuredCrew } from './data-factory'

// This file owns its own Crew (created via the API) for the edit-page dirty
// checks, instead of the shared hardcoded "Crew 01" / id=1 row — so it can run
// in parallel with other crew-touching files without colliding. See
// data-factory.ts.
let crew: EnsuredCrew

test.beforeAll(async ({ request }) => {
  crew = await ensureCrew(request)
})

test.afterAll(async ({ request }) => {
  if (crew) await deleteCrew(request, crew.id)
})

// Exercises the shared dirty + error border contract (PET-16):
// Every field primitive inside a FormProvider auto-renders:
//   data-dirty="true" + yellow-green border-warning/40   when dirty
//   aria-invalid="true" + border-destructive + ring      when invalid
//
// Driven by useFieldFormState(name) consumed by Input, Textarea, Label,
// Select (via root-name propagated through context), Combobox, Switch,
// Checkbox, RadioGroup, ColorPickerInput, and ParentPicker.
//
// Prereqs — same as every other spec:
//   cd apps/api && go run .
//   cd apps/web && pnpm dev
//
// Stable fixtures used:
//   - a factory-created Crew (see beforeAll) — edit-page dirty checks
//   - /setup/crews/new     — new-page error checks (name required, no locked fields)
//
// Selector note: prefer [data-slot="..."] attributes over role-based selectors
// since base-ui's combobox/select primitives do not always expose a stable role.

const DIRTY = 'true'

test.describe('Field state — dirty + error borders', () => {
  test('Input: baseline clean → dirty on edit → error on clear+submit', async ({ page }) => {
    // Dirty path — use an editable Input on the edit page (shortName is not locked)
    await page.goto(`/setup/crews/${String(crew.id)}`)
    const shortName = page.locator('input#shortName')
    await expect(shortName).toBeVisible()
    await expect(shortName).not.toHaveAttribute('data-dirty', DIRTY)

    await shortName.fill('mutated')
    await shortName.blur()
    await expect(shortName).toHaveAttribute('data-dirty', DIRTY)

    // Error path — name is required; clear it and trigger validation on the
    // new-crew page where it isn't locked.
    await page.goto('/setup/crews/new')
    const name = page.locator('input#name')
    await expect(name).toBeVisible()
    await expect(name).not.toHaveAttribute('aria-invalid', 'true')

    await name.fill('temp')
    await name.fill('')
    await name.blur()
    // onBlur validation (mode: 'onBlur') runs the zod resolver on blur and marks
    // the empty required field aria-invalid immediately — no submit needed. (The
    // old approach clicked Save to "submit", but FormFooter correctly disables Save
    // while invalid, so that click hung on a permanently-disabled button.)
    await expect(name).toHaveAttribute('aria-invalid', 'true')
  })

  test('Switch: baseline clean → dirty after toggle', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    // base-ui splits the switch: id="workCrewInGrouping" is on a hidden <input>;
    // the visible switch (which carries data-dirty) links to it via aria-labelledby.
    const toggle = page.locator('[data-slot="switch"][aria-labelledby="workCrewInGrouping-label"]')
    await expect(toggle).toBeVisible()
    await expect(toggle).not.toHaveAttribute('data-dirty', DIRTY)

    await toggle.click()
    await expect(toggle).toHaveAttribute('data-dirty', DIRTY)
  })

  test('Checkbox: baseline clean → dirty after toggle', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    // base-ui splits the checkbox: id="includeInTransfer" is on a hidden <input>;
    // the visible checkbox (which carries data-dirty) links via aria-labelledby.
    const checkbox = page.locator('[data-slot="checkbox"][aria-labelledby="includeInTransfer-label"]')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toHaveAttribute('data-dirty', DIRTY)

    await checkbox.click()
    await expect(checkbox).toHaveAttribute('data-dirty', DIRTY)
  })

  test('ParentPicker (combobox mode) forwards name → ComboboxInput reflects dirty', async ({
    page,
  }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    const deptInput = comboboxInput(page, 'Department')
    await expect(deptInput).toBeVisible()
    await expect(deptInput).not.toHaveAttribute('data-dirty', DIRTY)

    // Pick any option different from the current value. Opens popup, clicks
    // the first item — guaranteed to mark the RHF field dirty even if it
    // happens to match.
    await deptInput.click()
    await expect(page.locator('[data-slot="combobox-popup"]')).toBeVisible()
    const firstItem = page.locator('[data-slot="combobox-item"]').first()
    await firstItem.click()
    // Selection closes the popup and updates the input; if the picked value
    // matched the starting value we toggle once more to guarantee dirty.
    if ((await deptInput.getAttribute('data-dirty')) !== DIRTY) {
      await deptInput.click()
      await page.locator('[data-slot="combobox-item"]').nth(1).click()
    }
    await expect(deptInput).toHaveAttribute('data-dirty', DIRTY)
  })

  test('ParentPicker (sheet mode) forwards name → SelectTrigger reflects dirty', async ({
    page,
  }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    const trigger = pickerCell(page, 'Default Ranch').locator('[data-slot="select-trigger"]')
    await expect(trigger).toBeVisible()
    await expect(trigger).not.toHaveAttribute('data-dirty', DIRTY)

    await trigger.click()
    // Pick an option that is NOT the currently-selected one — Default Ranch defaults
    // to "— None —" (data-value="__none__", aria-selected, aria-hidden as the first
    // item), and re-selecting the current value doesn't dirty the field (nor is the
    // aria-hidden current option reliably clickable). Filter to a real, unselected option.
    const otherOption = page
      .locator('[data-slot="select-content"] [role="option"]:not([aria-selected="true"])')
      .first()
    await otherOption.click()
    await expect(trigger).toHaveAttribute('data-dirty', DIRTY)
  })

  test('ColorPickerInput: baseline clean → dirty after color pick', async ({ page }) => {
    await page.goto(`/setup/crews/${String(crew.id)}`)
    // ColorPickerInput's PopoverTrigger is a <button> with border-input on it.
    // Scope by the nearby Label text "Badge Color".
    const cell = page.locator('div.space-y-1').filter({
      has: page.getByText('Badge Color', { exact: true }),
    })
    const trigger = cell.locator('button').first()
    await expect(trigger).toBeVisible()
    await expect(trigger).not.toHaveAttribute('data-dirty', DIRTY)

    await trigger.click()
    // Preset grid has 20 swatches; click one to set a new color.
    const firstSwatch = page.locator('button[title^="#"]').first()
    await firstSwatch.click()
    // Close the popover so the trigger is the stable subject for assertions.
    await page.keyboard.press('Escape')
    await expect(trigger).toHaveAttribute('data-dirty', DIRTY)
  })
})
