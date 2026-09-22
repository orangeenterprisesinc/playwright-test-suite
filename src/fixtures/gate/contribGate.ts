/**
 * @fileoverview Per-test run control for the developer-contribution lane.
 *
 * Wired as an `{ auto: true }` fixture like the other two gates — never a
 * module-level `test.beforeEach`, which only fires for the first spec file each
 * worker loads (`src/fixtures/gate/executionGate.ts` carries the measurement).
 *
 * ## Why this one is strict where the web-pet gate fails open
 *
 * `webpetGate` fails open on a missing row or an unreadable row file, because
 * the lifted suite arrived with hundreds of tests that predated any annotation
 * and gating must not be able to eat them. The contrib lane has no such
 * history: every spec is born through `/dev-feature-test` with a `testCaseId`,
 * and `contrib:runner:check` rejects one that is not, statically, before the
 * PR can merge. So here an unknown id or an unreadable row file is a
 * configuration error and skips loudly — a contributed test that runs
 * ungoverned is worse than one that visibly did not run.
 */
import type { TestInfo } from '@playwright/test';
import { getContribRunnerIndex } from '../../data/contrib/contribRunnerSource';
import { decideExecution } from './executionGate';
import { applyAllureLabels, resolveCaseId } from '../../reporting/generate/allure/labels';
import { Logger } from '../../utils/logger';

const logger = new Logger('ContribGate');

export async function applyContribGate(testInfo: TestInfo): Promise<void> {
    const index = await getContribRunnerIndex();
    if (!index.available) {
        testInfo.skip(
            true,
            'Contrib runner rows are missing or unreadable — src/data/contrib/contribRunnerManager.csv',
        );
        return;
    }

    const caseId = resolveCaseId(testInfo, '');
    if (!caseId) {
        testInfo.skip(
            true,
            "A contrib spec must carry a testCaseId annotation — see tests/contrib/README.md",
        );
        return;
    }

    const row = index.byId.get(caseId) ?? null;
    if (row) testInfo.annotations.push({ type: 'contrib-runner-id', description: row.id });

    const decision = decideExecution(caseId, row);
    if (decision.skip) testInfo.skip(true, decision.reason);

    // Labelling must never be able to fail a test — same guard as the web-pet
    // gate, for the same reason (the Allure runtime binds through async-local
    // state and this is a fixture, not a beforeEach).
    try {
        await applyAllureLabels(testInfo, row);
    } catch (error) {
        logger.warn(`Allure labelling failed for '${testInfo.title}': ${String(error)}`);
    }
}
