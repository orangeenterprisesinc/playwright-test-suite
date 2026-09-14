/**
 * Standalone residue sweep — `npm run residue:sweep` / `npm run residue:sweep:dry`.
 *
 * A Playwright "test" only because Playwright is the repo's TypeScript runner
 * (path aliases, config env loading); it collects nothing else. Plain
 * `@playwright/test`, not `base.fixture`: the execution gate would demand a runner
 * row for what is a tool, not a test.
 */
import { expect, test } from '@playwright/test';
import { runResidueSweep } from '@utils/cleanup/residueSweep';

test('residue sweep', async ({}, testInfo) => {
    test.setTimeout(Number(process.env.RESIDUE_SWEEP_BUDGET_MS ?? 900_000) + 60_000);
    const summary = await runResidueSweep({
        phase: 'standalone',
        budgetMs: Number(process.env.RESIDUE_SWEEP_BUDGET_MS ?? 900_000),
        capPerEntity: Number(process.env.RESIDUE_CAP_PER_ENTITY ?? 1_000),
    });
    await testInfo.attach('residue-sweep.json', {
        body: JSON.stringify(summary, null, 2),
        contentType: 'application/json',
    });
    expect(summary.auth, 'the sweep needs USER_NAME/PASSWORD (or E2E_ADMIN_*) and API_URL/BASE_URL').toBe('ok');
});
