import { test } from '@playwright/test';

// Seed file for the Playwright test agents (planner/generator) — gives them
// a ready page context to explore the app from. Not a real test.
test.describe('Test group', () => {
  test('seed', async ({ page: _page }) => {
    // generate code here.
  });
});
