/**
 * @fileoverview Per-test run control for the migrated web-pet suite.
 *
 * Its own module so both `webpet.fixture.ts` and the unauthenticated-context
 * variant used by `notifications.spec.ts` apply identical gating without either
 * importing the other's browser-context machinery.
 *
 * Always wire this as an `{ auto: true }` fixture, never a module-level
 * `test.beforeEach` — see `src/fixtures/executionGate.ts` for the measurement
 * showing why a module-scope hook only fires for one spec file per worker.
 */
import type { TestInfo } from '@playwright/test';
import { getWebpetRunnerIndex, webpetStructuralKey } from '../../data/webpet/webpetRunnerSource';
import { decideExecution } from './executionGate';
import { applyAllureLabels, resolveCaseId } from '../../reporting/generate/allure/labels';
import { Logger } from '../../utils/logger';

const logger = new Logger('WebpetGate');

/**
 * Applies run control for the current test, then labels it for Allure.
 *
 * Two paths, and the suite self-tightens from one to the other as conversion
 * batches land — there is no cutover moment where it runs ungoverned:
 *
 * - **Annotated** (`{ type: 'testCaseId' }`): full framework semantics via
 *   {@link decideExecution} — runnerList override, then the row's `enabled`,
 *   then `TEST_SCOPE`. A claimed id with no row is a configuration error and
 *   skips, because a test that runs ungoverned is worse than one that does not
 *   run at all.
 * - **Not yet converted**: the structural `file::titlePath` key, **fail-open** —
 *   an unknown or renamed test runs, and only an explicit `enabled=0` skips it.
 *   This was the lifted suite's original contract and it stays permanently, so
 *   an accidentally deleted annotation is still gated.
 *
 * A missing or unreadable row file fails open too: gating must never be able to
 * eat the suite.
 */
export async function applyWebpetGate(testInfo: TestInfo): Promise<void> {
    const index = await getWebpetRunnerIndex();
    if (!index.available) return;

    const caseId = resolveCaseId(testInfo, '');
    const row = caseId
        ? (index.byId.get(caseId) ?? null)
        : (index.byStructuralKey.get(webpetStructuralKey(testInfo)) ?? null);

    if (row) testInfo.annotations.push({ type: 'webpet-runner-id', description: row.id });

    if (caseId) {
        const decision = decideExecution(caseId, row);
        if (decision.skip) testInfo.skip(true, decision.reason);
    } else if (row && row.enabled === false) {
        testInfo.skip(
            true,
            `Disabled in the web-pet runner (${row.id}, enabled=0) — src/data/webpet/webpetRunnerManager.csv`,
        );
    }

    // Labelling must never be able to fail a test. The Allure runtime binds to
    // the running test through async-local state, and this is the first place
    // the suite calls it from inside a fixture rather than a `beforeEach`.
    try {
        await applyAllureLabels(testInfo, row);
    } catch (error) {
        logger.warn(`Allure labelling failed for '${testInfo.title}': ${String(error)}`);
    }
}
