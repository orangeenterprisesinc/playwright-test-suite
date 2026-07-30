import { test } from '@playwright/test';

// Seed file for the Playwright test agents (planner/generator) — gives them
// a ready page context to explore the app from. Not a real test.
//
// Deliberately carries no tier tag and no `testCaseId`: it is excluded from the
// `chromium` project in playwright.config.ts, so it is never collected by a
// normal run and never measured by `npm run runner:check`. If you make it a real
// test, it needs a runner row, a requirement, and the tag chain like any other.
test.describe('Test group', () => {
  test('seed', async ({ page: _page }) => {
    // generate code here.
  });
});
