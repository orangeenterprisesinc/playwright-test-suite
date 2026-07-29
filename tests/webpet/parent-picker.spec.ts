import { test, expect } from './fixtures'
import {
  pickerCell,
  comboboxInput,
  sheetSelect,
  openCombobox,
  openSheetSelect,
  selectSheetOption,
} from './parent-picker-helpers'

// ─── combobox-mode tests ────────────────────────────────────────────────────

test.describe('Parent Picker — combobox mode', () => {
  test('Employee form — Department combobox filters and selects', async ({ page }) => {
    await page.goto('/setup/employees/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Department')
    await openCombobox(input)

    // "ADP 5" is the seeded DelLlano department (the PetData-era "Cauliflower"
    // this test used to assert doesn't exist in DelLlano — resolve against real
    // seeded data per seed/TRIAGE-DELLLANO.md instead of hardcoded PetData names).
    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByText('ADP 5', { exact: true })).toBeVisible()

    // Filter: a no-match string hides "ADP 5"; typing "ADP" brings it back.
    await input.fill('zzz-no-such-department')
    await expect(popup.getByText('ADP 5', { exact: true })).toBeHidden()
    await input.fill('ADP')
    await expect(popup.getByText('ADP 5', { exact: true })).toBeVisible()

    // Pick ADP 5.
    await popup.getByText('ADP 5', { exact: true }).click()
    await expect(input).toHaveValue('ADP 5')
  })

  test('Employee form — Department combobox is clearable (nullable field)', async ({ page }) => {
    await page.goto('/setup/employees/new')
    await page.waitForSelector('form')

    // departmentCounter is nullable/optional on Employee. In COMBOBOX mode the
    // "set to none" affordance is an X-clear button (ComboboxClear,
    // data-slot="combobox-clear") shown once a value is selected — NOT a
    // "— None —" list item (that's the SHEET-mode idiom this test used to
    // assert). Verify the clear affordance: select a value, then clear it.
    const cell = pickerCell(page, 'Department')
    const input = comboboxInput(page, 'Department')
    await openCombobox(input)
    await page.locator('[data-slot="combobox-popup"]').getByText('ADP 5', { exact: true }).click()
    await expect(input).toHaveValue('ADP 5')

    const clear = cell.locator('[data-slot="combobox-clear"]')
    await expect(clear).toBeVisible()
    await clear.click()
    await expect(input).toHaveValue('')
  })

  test('Customer form — Customer Type combobox filters and selects', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Customer Type')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByText('Grower')).toBeVisible()
    await expect(popup.getByText('Buyer')).toBeVisible()

    await input.fill('Grow')
    await expect(popup.getByText('Grower')).toBeVisible()
    await expect(popup.getByText('Buyer')).toBeHidden()

    await popup.getByText('Grower').click()
    await expect(input).toHaveValue('Grower')
  })

  test('Customer form — Customer Type combobox "+ Create" appears for unknown name', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Customer Type')
    await openCombobox(input)

    // Type a name that definitely does NOT exist. Don't click Create — that
    // would mutate the DB; we only assert the footer shows.
    const uniqueName = `ZZZ_Test_${Date.now()}`
    await input.fill(uniqueName)

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByRole('button', { name: `Create "${uniqueName}"` })).toBeVisible()
  })

  test('Customer form — Customer Type combobox "+ Create" hidden for existing name', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Customer Type')
    await openCombobox(input)

    await input.fill('Grower')
    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByRole('button', { name: /Create "Grower"/ })).toBeHidden()
  })

  test('Field form — Department combobox loads and selects', async ({ page }) => {
    await page.goto('/setup/fields/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Department')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByText('ADP 5')).toBeVisible()
    await popup.getByText('ADP 5').click()
    await expect(input).toHaveValue('ADP 5')
  })

  test('Crew form — Department combobox loads and selects', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Department')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByText('ADP 5')).toBeVisible()
    await popup.getByText('ADP 5').click()
    await expect(input).toHaveValue('ADP 5')
  })
})

// ─── sheet-mode tests ───────────────────────────────────────────────────────

test.describe('Parent Picker — sheet mode', () => {
  test('Crew form — Default Ranch sheet select works', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await page.waitForSelector('form')

    // Trigger renders; opening it shows real options. The legacy "— None —"
    // first-option is no longer rendered as a visible item in the new shadcn
    // Select — the X clear button appears once a value is selected instead.
    await expect(sheetSelect(page, 'Default Ranch')).toBeVisible()
    await openSheetSelect(page, 'Default Ranch')
    const items = page.locator(
      '[data-slot="select-content"] [data-slot="select-item"]:not([data-value="__none__"])',
    )
    expect(await items.count()).toBeGreaterThan(0)
  })

  // Cascading Default Field test moved to "Parent Picker — cascading filter"
  // describe below, now that Default Field is a combobox (picker-only) rather
  // than a sheet-mode select.

  test('Variety form — Crop sheet lists existing crops', async ({ page }) => {
    await page.goto('/setup/varieties/new')
    await page.waitForSelector('form')

    await openSheetSelect(page, 'Crop')
    // Existing Crop options visible in the portaled popup. "STRAWBERRIES" is a
    // seeded DelLlano crop (the PetData-era "APPLE" this used to assert doesn't
    // exist in DelLlano — resolve against real seeded data).
    await expect(
      page.locator('[data-slot="select-content"] [data-slot="select-item"]', { hasText: 'STRAWBERRIES' }),
    ).toBeVisible()
  })

  test('Field form — Ranch sheet lists real Ranches', async ({ page }) => {
    await page.goto('/setup/fields/new')
    await page.waitForSelector('form')

    await openSheetSelect(page, 'Ranch')
    // At least one real Ranch option (excluding the hidden __none__ sentinel).
    const realOptions = page.locator(
      '[data-slot="select-content"] [data-slot="select-item"]:not([data-value="__none__"])',
    )
    expect(await realOptions.count()).toBeGreaterThan(0)
  })
})

// ─── bulk rollout #2: picker-only combobox + cascading filter ───────────────

test.describe('Parent Picker — picker-only combobox', () => {
  test('Employee form — Crew combobox loads and "+ Create" is hidden', async ({ page }) => {
    await page.goto('/setup/employees/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Crew')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    // The combobox loaded with crew options. (The old "— None —" assertion was a
    // SHEET-mode idiom; in combobox mode clear-to-none is an X button, not a list
    // item — so assert real content loaded instead.)
    await expect(popup.locator('[data-slot="combobox-item"]').first()).toBeVisible()
    // Typing a name that doesn't exist — the "+ Create" footer must NOT appear
    // because Crew has no useCreateFromName registered.
    await input.fill(`ZZZ_Test_${Date.now()}`)
    await expect(popup.getByRole('button', { name: /^Create "/ })).toBeHidden()
  })

  test('Customer form — State sheet loads real states and offers no create', async ({ page }) => {
    await page.goto('/setup/customers/new')
    await page.waitForSelector('form')

    // State is a SHEET-mode picker (stateRegistration is a SheetRegistration whose
    // options display shortName), NOT a combobox — the old test used combobox
    // helpers and never matched. There is also no POST /api/states, so states are
    // intentionally not createable; sheet mode has no "+ Create" affordance at all.
    await openSheetSelect(page, 'State')
    const content = page.locator('[data-slot="select-content"]')
    await expect(
      content.locator('[data-slot="select-item"]', { hasText: 'CA' }).first(),
    ).toBeVisible()
  })

  test('Field form — Color combobox with create is present and filters active', async ({ page }) => {
    await page.goto('/setup/fields/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Color')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    // Combobox opened. (Dropped the stale "— None —" list-item assertion — that's
    // the sheet-mode idiom; combobox clear-to-none is an X button, not a list item.)
    await expect(popup).toBeVisible()
    // An unknown name shows "+ Create" (Color has useCreateFromName)
    await input.fill(`ZZZ_Test_${Date.now()}`)
    await expect(popup.getByRole('button', { name: /^Create "/ })).toBeVisible()
  })
})

test.describe('Parent Picker — cascading filter', () => {
  test('Crew form — Default Field combobox filters by selected Default Ranch', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await page.waitForSelector('form')

    // Pick Ranch 6 ("ALL RANCHES") — it has multiple active Fields in the
    // DelLlano seed. (The old test used Ranch 5, which doesn't exist in DelLlano.)
    await selectSheetOption(page, 'Default Ranch', '6')

    // Open Default Field combobox and verify options loaded for the selected Ranch.
    const fieldInput = comboboxInput(page, 'Default Field')
    await openCombobox(fieldInput)

    const popup = page.locator('[data-slot="combobox-popup"]')
    // At least one Field belongs to Ranch 6 (asserting real filtered content
    // rather than a hardcoded PetData field name). Dropped the stale "— None —"
    // list-item assertion — combobox clear-to-none is an X button, not a list item.
    await expect(popup.locator('[data-slot="combobox-item"]').first()).toBeVisible()

    // Close popup, change Ranch, verify Field resets (cascade via onChange).
    await page.keyboard.press('Escape')

    // Find another Ranch (not 6) by inspecting the open dropdown's data-value
    // attributes (added by the wrapper SelectItem in PET-251).
    await openSheetSelect(page, 'Default Ranch')
    const otherItem = page
      .locator(
        '[data-slot="select-content"] [data-slot="select-item"]:not([data-value="6"]):not([data-value="__none__"])',
      )
      .first()
    const otherRanchValue = await otherItem.getAttribute('data-value')
    expect(otherRanchValue).not.toBeNull()
    await otherItem.click()
    await expect(page.locator('[data-slot="select-content"]')).toBeHidden()

    // Default Field input should now be empty (selection cleared).
    await expect(fieldInput).toHaveValue('')
  })
})

// ─── per-consumer smoke coverage ────────────────────────────────────────────

test.describe('Parent Picker — per-consumer smoke', () => {
  test('Crew form — all 5 picker fields load', async ({ page }) => {
    await page.goto('/setup/crews/new')
    await page.waitForSelector('form')

    await expect(comboboxInput(page, 'Department')).toBeVisible()
    await expect(comboboxInput(page, 'Supervisor')).toBeVisible()
    await expect(sheetSelect(page, 'Default Ranch')).toBeVisible()
    await expect(comboboxInput(page, 'Default Field')).toBeVisible()
    await expect(comboboxInput(page, 'Default Job')).toBeVisible()
  })

  test('Equipment form — Equipment Type combobox loads options', async ({ page }) => {
    await page.goto('/setup/equipments/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Equipment Type')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByText('Pump')).toBeVisible() // seed data
    // Picker-only: no "+ Create" even for unknown name.
    await input.fill(`ZZZ_${Date.now()}`)
    await expect(popup.getByRole('button', { name: /^Create "/ })).toBeHidden()
  })

  test('Job form — Overtime Rules combobox loads options', async ({ page }) => {
    await page.goto('/setup/jobs/new')
    await page.waitForSelector('form')

    const input = comboboxInput(page, 'Overtime Rules')
    await openCombobox(input)

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByRole('option', { name: 'Ag', exact: true })).toBeVisible()
    await input.fill(`ZZZ_${Date.now()}`)
    await expect(popup.getByRole('button', { name: /^Create "/ })).toBeHidden()
  })

  test('User form Timecard tab — 3 default selectors load', async ({ page }) => {
    // User admin lives under /settings, not /setup.
    await page.goto('/settings/users/new')
    // The form's tab buttons are ordinary <button>s, not ARIA tabs.
    await page.getByRole('button', { name: 'Time Card Defaults' }).click()

    await expect(sheetSelect(page, 'Default Ranch')).toBeVisible()
    await expect(comboboxInput(page, 'Default Field')).toBeVisible()
    await expect(comboboxInput(page, 'Default Job')).toBeVisible()
  })

  test('Field form — traceability comboboxes all load', async ({ page }) => {
    await page.goto('/setup/fields/new')
    await page.waitForSelector('form')

    for (const label of ['Color', 'Grade', 'Size', 'Method', 'Region', 'Packaging Style']) {
      await expect(comboboxInput(page, label)).toBeVisible()
    }
    await expect(comboboxInput(page, 'Overtime Rules')).toBeVisible()
    await expect(comboboxInput(page, 'Variety')).toBeVisible()
    await expect(comboboxInput(page, 'Pool')).toBeVisible()
    // State is a SHEET-mode picker (stateRegistration), not a combobox. And there
    // is no "Flow Rate Unit" picker on the field form (the old combobox assertion
    // for it matched nothing) — the Flow Rate control is itself a sheet select.
    await expect(sheetSelect(page, 'State')).toBeVisible()
    await expect(sheetSelect(page, 'Crop')).toBeVisible()
  })

  test('Field form — changing Crop filters Variety and clears selection', async ({ page }) => {
    await page.goto('/setup/fields/new')
    await page.waitForSelector('form')

    // DelLlano data: STRAWBERRIES (cropCounter 3) has varieties (BARBARA, MAVERICK,
    // …); the other seeded crops have none. (The old test used PetData APPLE/BEANS
    // + Granny Smith/Pinto, which don't exist here.) So we verify the cascade by
    // switching STRAWBERRIES → a variety-less crop: the selection clears and the
    // strawberry variety drops out of the (now-refiltered) list.
    await selectSheetOption(page, 'Crop', '3')

    const varietyInput = comboboxInput(page, 'Variety')
    await openCombobox(varietyInput)
    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup.getByText('BARBARA')).toBeVisible()
    await popup.getByText('BARBARA').click()
    await expect(varietyInput).toHaveValue('BARBARA')

    // Switch Crop → Variety must clear (onChange cascade).
    await selectSheetOption(page, 'Crop', '2') // BLUEBERRIES — no varieties
    await expect(varietyInput).toHaveValue('')

    // Variety list is now BLUEBERRIES-filtered: the STRAWBERRIES variety is gone.
    await openCombobox(varietyInput)
    await expect(popup.getByText('BARBARA')).toBeHidden()
  })
})

// ─── combobox-inside-sheet regression ───────────────────────────────────────

test.describe('Parent Picker — combobox inside sheet', () => {
  test('Field form → open Ranch sheet via pencil → Department combobox inside works', async ({ page }) => {
    await page.goto('/setup/fields/new')
    await page.waitForSelector('form')

    // 1. Pick any Ranch so the pencil becomes enabled. Inspect the dropdown's
    //    data-value attributes (added by the wrapper SelectItem in PET-251) to
    //    pick the first real (non-__none__) entry.
    await openSheetSelect(page, 'Ranch')
    const firstItem = page
      .locator(
        '[data-slot="select-content"] [data-slot="select-item"]:not([data-value="__none__"])',
      )
      .first()
    const firstRanchValue = await firstItem.getAttribute('data-value')
    expect(firstRanchValue).not.toBeNull()
    await firstItem.click()
    await expect(page.locator('[data-slot="select-content"]')).toBeHidden()

    // 2. Click pencil (Edit Ranch) to open the sheet.
    await pickerCell(page, 'Ranch').getByRole('button', { name: 'Edit Ranch' }).click()

    // 3. Sheet should open with title "Edit Ranch". Form inside has a
    //    Department combobox (this is the combobox-inside-sheet case).
    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Edit Ranch')).toBeVisible()

    // 4. Open the Department combobox inside the sheet. The Ranch form's
    //    only combobox is Department, so the first combobox-input inside
    //    the sheet is it. (Robust against labels being rendered as "X" vs.
    //    "X *", and against the Ranch form's exact row ordering.)
    await expect(sheet.locator('[data-slot="combobox-input"]').first()).toBeVisible()
    const deptInput = sheet.locator('[data-slot="combobox-input"]').first()
    await deptInput.click()

    const popup = page.locator('[data-slot="combobox-popup"]')
    await expect(popup).toBeVisible()
    // The combobox-inside-sheet opened with content. (Dropped the stale "— None —"
    // list-item assertion — combobox clear-to-none is an X button, not a list item.)
    await expect(popup.locator('[data-slot="combobox-item"]').first()).toBeVisible()
  })
})
