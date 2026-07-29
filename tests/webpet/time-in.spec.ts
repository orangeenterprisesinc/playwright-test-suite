/**
 * TimeInListPage e2e — WEBPET-666 regression.
 *
 * Guards the dropdown-column multi-edit path on an Input page whose combobox
 * editor options are keyed by *counter* (`value: String(ranchCounter)`), unlike
 * the Setup pages (Field, etc.) which key options by name. The bug: the column
 * `onCommit` resolved the selected entity by NAME (`r.name === newName`) while
 * `newName` was actually the counter string, so the lookup failed, `commitEdit`
 * was never called, and the value silently reverted with no update. Fixed by
 * resolving via counter (`String(r.ranchCounter) === newName`).
 *
 * Field's existing combobox propagation test does NOT cover this — Field keys
 * options by name, so it was never affected.
 *
 * Run: pnpm --filter @pet-tiger/web exec playwright test time-in
 *
 * Data: relies on seeded Time In records. A narrow date window (2025-12-01) is
 * used because that day has ~80 records (under the 100-row virtualization
 * threshold) so the first rows are reliably in the DOM. Mutations are restored
 * via Undo within the test.
 */
import { test, expect } from './fixtures'

// Mutates shared Time In rows (ranchCounter) then restores via Undo — cannot
// run in parallel with itself.
test.describe.configure({ mode: 'serial' })

// A day known to carry multiple Time In records in the seed data.
const DAY = '2025-12-01'

test.describe('TimeInListPage — multi-edit dropdown (WEBPET-666)', () => {
  test('editing a Ranch (counter-keyed dropdown) in multi-edit persists to all selected rows', async ({
    page,
  }) => {
    await page.goto('/input/time-in')
    await page.waitForSelector('[role="grid"]')

    // Narrow to a populated day so the first data rows are present.
    await page.locator('#filter-from').fill(DAY)
    await page.locator('#filter-to').fill(DAY)

    // Wait for at least two data rows (role="row" includes 2 header rows).
    await expect.poll(async () => page.getByRole('row').count()).toBeGreaterThan(3)

    await page.getByRole('button', { name: /^Multi Update$/ }).click()

    // First two data rows (skip the column-header row + filter-header row).
    const rowA = page.getByRole('row').nth(2)
    const rowB = page.getByRole('row').nth(3)
    await rowA.getByRole('checkbox').first().check()
    await rowB.getByRole('checkbox').first().check()
    await expect(page.getByText(/2 selected/)).toBeVisible()

    // Ranch is the 5th data cell (index 4): [selection, reference, dateTime,
    // employeeName, ranchName, …].
    const rowARanch = rowA.getByRole('cell').nth(4).getByRole('button')
    const rowBRanch = rowB.getByRole('cell').nth(4).getByRole('button')
    const originalA = (await rowARanch.textContent())?.trim() ?? ''
    const originalB = (await rowBRanch.textContent())?.trim() ?? ''

    // Enter edit mode on row A's Ranch cell → opens the base-ui combobox popup.
    await rowARanch.click()

    // Pick the first option whose text differs from row A's current ranch.
    const options = page.getByRole('option')
    await expect(options.first()).toBeVisible()
    const optionCount = await options.count()
    let chosen = ''
    for (let i = 0; i < optionCount; i++) {
      const txt = (await options.nth(i).textContent())?.trim() ?? ''
      if (txt && txt !== originalA) {
        chosen = txt
        await options.nth(i).click()
        break
      }
    }
    expect(chosen, 'expected at least one ranch option different from the current value').not.toBe(
      '',
    )

    // The propagate dialog must appear (pre-fix: commitEdit was never called,
    // so no dialog appeared and the value reverted).
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: /^Apply to all/ }).click()

    // Both selected rows now show the chosen ranch (the edit actually stuck).
    await expect(rowARanch).toHaveText(chosen, { timeout: 10000 })
    await expect(rowBRanch).toHaveText(chosen, { timeout: 10000 })

    // Undo restores each row to its original ranch.
    await page.getByRole('button', { name: /^Undo$/ }).click()
    await expect(rowARanch).toHaveText(originalA, { timeout: 10000 })
    await expect(rowBRanch).toHaveText(originalB, { timeout: 10000 })
  })
})
