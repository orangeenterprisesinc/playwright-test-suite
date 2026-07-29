import { test, expect } from './fixtures';

/**
 * Exercises the Bonus wizard form *shell* slice (slice-bonus-shell).
 *
 * Scope: catalog endpoint, landing page, wizard page, Selection step's
 * universal date filter, Continue/Save/Load disabled-with-deferred-tooltip
 * affordances, and the unknown-type redirect. Per-type IBonusPanel and
 * Review-step grid/Execute behavior ship in follow-up slices and are
 * deliberately not exercised here.
 *
 * The fixture seeds an admin session (records.create + bonus.view +
 * BonusPayment module all true) so the gates pass; the no-permission
 * scenario is covered by routing the API to a 403 response.
 */
test.describe('Bonus shell — landing page', () => {
  test('lists 18 bonus types as navigable cards', async ({ page }) => {
    await page.goto('/bonus');

    const grid = page.getByTestId('bonus-types-grid');
    await expect(grid).toBeVisible({ timeout: 10_000 });

    const expectedKeys = [
      'employee',
      'crew',
      'supervisor',
      'supervisor-piece-incentive',
      'supervisor-bonus-extra-pieces',
      'fair-food-premium',
      'daily-by-employee',
      'daily-by-job',
      'holiday-pay',
      'support-crew-bonus',
      'supervisor-average-crew-hourly',
      'piece-incentive-bonus',
      'tier-piece-incentive',
      'supervisor-crew-size',
      'piece-weekly-incentive-bonus',
      'quality-incentive-bonus',
      'piece-productivity-hourly-bonus',
      'tier-hourly-piece-incentive',
    ];
    for (const key of expectedKeys) {
      await expect(page.getByTestId(`bonus-type-card-${key}`)).toBeVisible();
    }
  });

  test('clicking a card navigates to the wizard for that type', async ({ page }) => {
    await page.goto('/bonus');
    await page.getByTestId('bonus-type-card-employee').click();
    await expect(page).toHaveURL(/\/bonus\/employee$/);
  });
});

test.describe('Bonus shell — wizard Step 1 (Selection)', () => {
  test('renders selection step title with the type label', async ({ page }) => {
    await page.goto('/bonus/employee');
    await expect(
      page.getByRole('heading', { name: /Employee Bonus Payment.*1\/2 Record Selection/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('shows the date filter for types where requiresDateFilter=true', async ({ page }) => {
    await page.goto('/bonus/employee');
    await expect(page.getByLabel('Start Date/Time In')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Last Date/Time In')).toBeVisible();
  });

  test('hides the date filter for HolidayPay (id=8)', async ({ page }) => {
    await page.goto('/bonus/holiday-pay');
    await expect(page.getByTestId('bonus-holiday-pay-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel('Start Date/Time In')).toHaveCount(0);
    await expect(page.getByLabel('Last Date/Time In')).toHaveCount(0);
  });

  test('hides the date filter for PieceWeeklyIncentiveBonus (id=14)', async ({ page }) => {
    await page.goto('/bonus/piece-weekly-incentive-bonus');
    await expect(page.getByTestId('bonus-piece-weekly-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel('Start Date/Time In')).toHaveCount(0);
  });

  test('Continue is disabled on the selection step', async ({ page }) => {
    await page.goto('/bonus/employee');
    const cont = page.getByTestId('bonus-wizard-continue');
    // Continue stays disabled until a selection is made. (The deferred `title`
    // "Continue is disabled…" tooltip has since been removed — the disabled
    // state itself is the behavior under test.)
    await expect(cont).toBeDisabled();
  });

  test('Save filter and Load filter are present and enabled', async ({ page }) => {
    await page.goto('/bonus/employee');
    // These were deferred (disabled) when this test was written; the filter
    // save/load feature has since shipped, so they now render enabled.
    await expect(page.getByTestId('bonus-wizard-save-filter')).toBeEnabled();
    await expect(page.getByTestId('bonus-wizard-load-filter')).toBeEnabled();
  });

  test('Cancel returns to the landing page', async ({ page }) => {
    await page.goto('/bonus/employee');
    await page.getByTestId('bonus-wizard-cancel').click();
    await expect(page).toHaveURL(/\/bonus$/);
  });

  test('Round-A: Employee panel renders BonusUnit / Rate / Job / DuplicateHandling fields', async ({
    page,
  }) => {
    await page.goto('/bonus/employee');
    await expect(page.getByTestId('bonus-employee-filter-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Bonus Unit/)).toBeVisible();
    await expect(page.getByLabel(/Rate/)).toBeVisible();
    // "Bonus Job" is an FK ParentPicker whose label isn't getByLabel-associated
    // (unlike the plain inputs above) — assert its label text renders instead.
    await expect(page.getByText(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Duplicate Handling/)).toBeVisible();
  });

  test('Round-A: Crew panel renders BonusUnit / MaxBonus / MinPercent / Job fields', async ({
    page,
  }) => {
    await page.goto('/bonus/crew');
    await expect(page.getByTestId('bonus-crew-filter-panel')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Bonus Unit/)).toBeVisible();
    await expect(page.getByLabel(/Maximum Bonus/)).toBeVisible();
    await expect(page.getByLabel(/Minimum Bonus Percent/)).toBeVisible();
    await expect(page.getByText(/Bonus Job/)).toBeVisible();
  });

  test('Round-A: Support Crew panel renders Crew / ExtraPayJob / SupportJob fields', async ({
    page,
  }) => {
    await page.goto('/bonus/support-crew-bonus');
    await expect(page.getByTestId('bonus-support-crew-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Support Crew/)).toBeVisible();
    await expect(page.getByLabel(/Extra Pay Job/)).toBeVisible();
    await expect(page.getByLabel(/Support Job/)).toBeVisible();
    // Ranch/Field visibility depends on the seeded fieldEntryRequired
    // preference; the panel mounts regardless. Don't strictly assert
    // visibility on those two.
  });

  test('Round-A: Fair Food Premium panel renders TotalAmount / BonusJobDate / Job fields', async ({
    page,
  }) => {
    await page.goto('/bonus/fair-food-premium');
    await expect(page.getByTestId('bonus-fair-food-premium-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Total Premium Pay/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job Date/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
  });

  test('Round-A: Holiday Pay panel renders qualification / hours / multiplier / job fields', async ({
    page,
  }) => {
    await page.goto('/bonus/holiday-pay');
    await expect(page.getByTestId('bonus-holiday-pay-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Qualification Period/)).toBeVisible();
    await expect(page.getByLabel(/Holiday Job/)).toBeVisible();
    await expect(page.getByLabel(/Number of Hours/)).toBeVisible();
    await expect(page.getByLabel(/Holiday Name/)).toBeVisible();
    await expect(page.getByLabel(/Holiday Date/)).toBeVisible();
    await expect(page.getByLabel(/Rate Multiplier/)).toBeVisible();
  });

  test('Round-A: Piece-Weekly Incentive panel renders Bonus / Exclusion / Work job fields', async ({
    page,
  }) => {
    await page.goto('/bonus/piece-weekly-incentive-bonus');
    await expect(page.getByTestId('bonus-piece-weekly-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Exclusion Job/)).toBeVisible();
    await expect(page.getByLabel(/Minimum Pieces per Hour/)).toBeVisible();
    await expect(page.getByLabel(/Work Job/)).toBeVisible();
  });

  test('Round-A: Supervisor Bonus panel renders Supervisor / MinRate / BonusJob / DivideBy fields', async ({
    page,
  }) => {
    await page.goto('/bonus/supervisor');
    await expect(page.getByTestId('bonus-supervisor-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/^Supervisor /)).toBeVisible();
    await expect(page.getByLabel(/Minimum Rate/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByText(/Crew Size Divisor/)).toBeVisible();
  });

  test('Round-B: Supervisor Piece Incentive panel renders Supervisor / PieceMultiplier / PieceRate / BonusJob / WorkJob fields', async ({
    page,
  }) => {
    await page.goto('/bonus/supervisor-piece-incentive');
    await expect(page.getByTestId('bonus-supervisor-piece-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/^Supervisor /)).toBeVisible();
    await expect(page.getByLabel(/Piece Multiplier/)).toBeVisible();
    await expect(page.getByLabel(/Piece Rate/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Work Job/)).toBeVisible();
  });

  test('Round-B: Piece Incentive panel renders Bonus Job field', async ({ page }) => {
    await page.goto('/bonus/piece-incentive-bonus');
    await expect(page.getByTestId('bonus-piece-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    // Bonus Job is always present; Ranch/Field are gated on the seeded
    // fieldEntryRequired preference, so don't strictly assert on those.
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
  });

  test('Round-B: Quality Incentive panel renders Bonus Job / Quality Percent and Measurement deferral note', async ({
    page,
  }) => {
    await page.goto('/bonus/quality-incentive-bonus');
    await expect(page.getByTestId('bonus-quality-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Quality Percent/)).toBeVisible();
    await expect(page.getByTestId('bonus-quality-incentive-measurement-deferred')).toBeVisible();
  });

  test('Round-B: Supervisor Average Crew Hourly panel renders Supervisor / ExtraHourlyPay / BonusJob fields', async ({
    page,
  }) => {
    await page.goto('/bonus/supervisor-average-crew-hourly');
    await expect(
      page.getByTestId('bonus-supervisor-average-crew-hourly-filter-panel'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/^Supervisor /)).toBeVisible();
    await expect(page.getByLabel(/Extra Hourly Pay/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
  });

  test('Round-B: Supervisor Crew Size panel renders Foreman Job / Hourly Rate / Required Crew Size / Bonus Job fields', async ({
    page,
  }) => {
    await page.goto('/bonus/supervisor-crew-size');
    await expect(page.getByTestId('bonus-supervisor-crew-size-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Foreman Job/)).toBeVisible();
    await expect(page.getByLabel(/Hourly Rate/)).toBeVisible();
    await expect(page.getByLabel(/Required Crew Size/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
  });

  test('Round-C: Supervisor Bonus Extra Pieces panel renders Supervisor / MinPieces / BonusJob / PieceRate / Job fields', async ({
    page,
  }) => {
    await page.goto('/bonus/supervisor-bonus-extra-pieces');
    await expect(
      page.getByTestId('bonus-supervisor-bonus-extra-pieces-filter-panel'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/^Supervisor /)).toBeVisible();
    await expect(page.getByLabel(/Daily Target Pieces/)).toBeVisible();
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Rate per Extra Piece/)).toBeVisible();
    await expect(page.getByLabel(/Work Job/)).toBeVisible();
  });

  test('Round-C: Tier Piece Incentive panel renders Ranch / Field / Bonus Job (no fieldEntryRequired gate)', async ({
    page,
  }) => {
    await page.goto('/bonus/tier-piece-incentive');
    await expect(page.getByTestId('bonus-tier-piece-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    // Ranch/Field render unconditionally for this panel (no preference gate).
    await expect(page.getByText(/^Ranch/)).toBeVisible();
    await expect(page.getByText(/^Field/)).toBeVisible();
    await expect(page.getByText(/Bonus Job/)).toBeVisible();
  });

  test('Round-C: Tier Hourly Piece Incentive panel renders Bonus Job / Piece Count Type fields', async ({
    page,
  }) => {
    await page.goto('/bonus/tier-hourly-piece-incentive');
    await expect(page.getByTestId('bonus-tier-hourly-piece-incentive-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Piece Count Type/)).toBeVisible();
  });

  test('Round-C: Piece Productivity Hourly panel renders Bonus Job + 4 grouping/rate-flag selects', async ({
    page,
  }) => {
    await page.goto('/bonus/piece-productivity-hourly-bonus');
    await expect(page.getByTestId('bonus-piece-productivity-hourly-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Bonus Job/)).toBeVisible();
    await expect(page.getByText(/Group by Day/)).toBeVisible();
    await expect(page.getByText(/Group by Job/)).toBeVisible();
    await expect(page.getByText(/Group by Field/)).toBeVisible();
    await expect(page.getByText(/Change Job Card Rate/)).toBeVisible();
  });

  test('Round-D: Daily by Employee panel renders ExtraHoursPerDay / Job / DuplicateHandling fields', async ({
    page,
  }) => {
    await page.goto('/bonus/daily-by-employee');
    await expect(page.getByTestId('bonus-daily-by-employee-filter-panel')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/Extra Hours \/ Day/)).toBeVisible();
    await expect(page.getByText(/Bonus Job/)).toBeVisible();
    await expect(page.getByLabel(/Duplicate Handling/)).toBeVisible();
  });
});

test.describe('Bonus shell — wizard Step 2 (Review)', () => {
  test('Round-D: Daily by Employee grid panel renders (missing-filter banner on direct nav)', async ({
    page,
  }) => {
    await page.goto('/bonus/daily-by-employee?step=2');
    await expect(page.getByTestId('bonus-daily-by-employee-grid-empty-filter')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('Round-D: Daily by Job grid panel renders (missing-filter banner on direct nav)', async ({
    page,
  }) => {
    await page.goto('/bonus/daily-by-job?step=2');
    await expect(page.getByTestId('bonus-daily-by-job-grid-empty-filter')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('Round-C: Tier Hourly Piece Incentive grid panel renders (missing-filter banner on direct nav)', async ({
    page,
  }) => {
    await page.goto('/bonus/tier-hourly-piece-incentive?step=2');
    await expect(
      page.getByTestId('bonus-tier-hourly-piece-incentive-grid-empty-filter'),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Back returns to Step 1', async ({ page }) => {
    await page.goto('/bonus/tier-hourly-piece-incentive?step=2');
    await page.getByTestId('bonus-wizard-back').click();
    // URL no longer carries ?step (Step 1 is canonical).
    await expect(page).not.toHaveURL(/\?step=2/);
    await expect(page.getByTestId('bonus-tier-hourly-piece-incentive-filter-panel')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('Round-C: Piece Productivity Hourly grid panel renders (missing-filter banner on direct nav)', async ({
    page,
  }) => {
    await page.goto('/bonus/piece-productivity-hourly-bonus?step=2');
    await expect(
      page.getByTestId('bonus-piece-productivity-hourly-grid-empty-filter'),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Bonus shell — sub-selection panel', () => {
  test('crew type renders the sub-selection panel', async ({ page }) => {
    await page.goto('/bonus/crew');
    await expect(page.getByTestId('bonus-sub-selection-panel')).toBeVisible({ timeout: 10_000 });
  });

  test('employee type (now configured) renders the sub-selection panel', async ({ page }) => {
    // employee was added to subSelectionConfig in PET-277; it now renders the
    // column picker panel instead of the not-configured placeholder.
    await page.goto('/bonus/employee');
    await expect(page.getByTestId('bonus-sub-selection-panel')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('PET-278: daily-by-employee renders the sub-selection panel', async ({ page }) => {
    await page.goto('/bonus/daily-by-employee');
    await expect(page.getByTestId('bonus-sub-selection-panel')).toBeVisible({ timeout: 10_000 });
  });

  test('PET-278: holiday-pay renders the sub-selection panel', async ({ page }) => {
    await page.goto('/bonus/holiday-pay');
    await expect(page.getByTestId('bonus-sub-selection-panel')).toBeVisible({ timeout: 10_000 });
  });

  test('PET-278: supervisor-crew-size renders the sub-selection panel', async ({ page }) => {
    await page.goto('/bonus/supervisor-crew-size');
    await expect(page.getByTestId('bonus-sub-selection-panel')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Bonus shell — error paths', () => {
  test('unknown type redirects to /bonus with an error toast', async ({ page }) => {
    await page.goto('/bonus/totally-bogus');
    await expect(page).toHaveURL(/\/bonus$/, { timeout: 10_000 });
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('403 on /api/bonus/types blocks the landing page UI', async ({ page }) => {
    await page.route('**/api/bonus/types', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Permission denied.' }),
      }),
    );
    await page.goto('/bonus');
    // The grid never renders; the page surfaces the error message via the
    // global handler (toast) and the local error branch.
    await expect(page.getByTestId('bonus-types-grid')).toHaveCount(0);
  });
});
