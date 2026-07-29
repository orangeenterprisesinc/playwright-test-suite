import { test, expect } from './fixtures'

/**
 * Smoke-level Playwright coverage for the Dashboard shell (PET-439).
 *
 * Scope: route loads, default board auto-provisions, widget palette toggles,
 * palette-click append persists to LocalStorage (pt.dashboards.v2), full page
 * reload restores the layout.
 *
 * Why click-not-DnD: the palette's plus-icon button calls onAdd(def.id) on
 * the same code path the dnd-kit drop invokes (WidgetPalette.tsx). Synthetic
 * DnD gestures against dnd-kit's PointerSensor are empirically flaky in
 * headless Playwright; the click affordance proves the orchestration without
 * driving the DnD library.
 *
 * Per-test isolation: each test clears pt.dashboards.v2 via addInitScript so
 * every navigation hits the DashboardPage auto-create-default-board branch,
 * eliminating cross-test order dependence. The shared fixture pins pt.locale
 * but does NOT touch dashboards storage.
 */

async function clearDashboardsStorage(page: import('@playwright/test').Page) {
  await page.context().addInitScript(() => {
    window.localStorage.removeItem('pt.dashboards.v2')
  })
}

test.describe('Dashboard shell — route + bootstrap', () => {
  test('route loads and seeds a default board on first visit', async ({ page }) => {
    await clearDashboardsStorage(page)
    await page.goto('/dashboard')

    await expect(page.locator('[data-slot="dashboard-canvas"]')).toBeVisible({ timeout: 10_000 })
    // (The board tabs strip [data-slot="tabs-list"] was removed from the dashboard
    // shell — DashboardTabs is no longer mounted by DashboardPage — so it's no longer
    // asserted here. The canvas + seeded widget cells are the shell's render signals.)
    // buildSampleLayout always seeds at least one widget cell on the default
    // board, so the canvas should never render the empty-state placeholder
    // on a fresh visit.
    const cells = page.locator('[data-slot="widget-cell"]')
    await expect(cells.first()).toBeVisible({ timeout: 10_000 })
    expect(await cells.count()).toBeGreaterThan(0)
  })

  test('header shows a greeting and an Edit Widgets button', async ({ page }) => {
    await clearDashboardsStorage(page)
    await page.goto('/dashboard')

    // The dashboard header was redesigned from a today's-date label to a
    // time-of-day greeting rendered as an <h2> ("Good morning/afternoon/
    // evening, <name>"). Assert the greeting shape (loose regex, name-agnostic)
    // so it survives time-of-day and user drift.
    await expect(page.getByRole('heading', { level: 2 })).toContainText(
      /Good (morning|afternoon|evening),/,
    )
    await expect(page.getByRole('button', { name: 'Edit Widgets' })).toBeVisible()
  })
})

test.describe('Dashboard shell — widget palette', () => {
  test('Add Widgets button toggles the palette open and closed', async ({ page }) => {
    await clearDashboardsStorage(page)
    await page.goto('/dashboard')

    const palette = page.getByLabel('Widget palette')
    const firstPaletteItem = page.locator('[data-slot="palette-item"]').first()

    // Closed state: the aside is in the DOM but has w-0 + overflow-hidden,
    // so its children are not visible.
    await expect(firstPaletteItem).not.toBeVisible()

    await page.getByRole('button', { name: 'Edit Widgets' }).click()
    await expect(palette).toBeVisible()
    await expect(firstPaletteItem).toBeVisible({ timeout: 5_000 })

    // The header button label flips Add Widgets → Hide Widgets when open.
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(firstPaletteItem).not.toBeVisible()
  })

  test('palette plus-button appends a widget to the active board', async ({ page }) => {
    await clearDashboardsStorage(page)
    await page.goto('/dashboard')

    const cells = page.locator('[data-slot="widget-cell"]')
    await expect(cells.first()).toBeVisible({ timeout: 10_000 })
    const initialCount = await cells.count()

    await page.getByRole('button', { name: 'Edit Widgets' }).click()
    const palette = page.getByLabel('Widget palette')
    await expect(palette).toBeVisible()

    // Each palette item exposes a per-item plus button whose accessible name
    // is "Add <widget title>" (palette.addWidget i18n key, en locale). The
    // palette aside also contains a single "Close palette" X button; scoping
    // to /^Add / + .first() picks the first widget's add button.
    await palette
      .getByRole('button', { name: /^Add / })
      .first()
      .click()

    // The add path flushes the debounced save and fires an immediate
    // mutate, so the new cell mounts synchronously on the canvas.
    await expect(cells).toHaveCount(initialCount + 1)
  })
})

test.describe('Dashboard shell — persistence + reload', () => {
  test('new widget persists and survives a full page reload', async ({ page }) => {
    await clearDashboardsStorage(page)
    await page.goto('/dashboard')

    const cells = page.locator('[data-slot="widget-cell"]')
    await expect(cells.first()).toBeVisible({ timeout: 10_000 })
    const initialCount = await cells.count()

    await page.getByRole('button', { name: 'Edit Widgets' }).click()
    await page
      .getByLabel('Widget palette')
      .getByRole('button', { name: /^Add / })
      .first()
      .click()
    await expect(cells).toHaveCount(initialCount + 1)
    const afterAddCount = await cells.count()

    // Persistence moved from a LocalStorage document (pt.dashboards.v2) to the
    // server-backed ApiWidgetCanvasRepository (DashboardPage → useBoards). The
    // old localStorage-key assertion is therefore obsolete; the meaningful
    // round-trip the ticket calls out is that a full page reload rehydrates the
    // board from its (now server-side) store with the same widget count painted.
    await page.reload()
    await expect(cells.first()).toBeVisible({ timeout: 10_000 })
    await expect(cells).toHaveCount(afterAddCount)
  })
})
