/**
 * @fileoverview The framework's three-layer execution gate, as a pure decision
 * function.
 *
 * Extracted from `base.fixture.ts` so every suite applies byte-identical
 * semantics from its own call site. The journey suites resolve rows against
 * `src/data/runner/`; the migrated web-pet suite resolves them against
 * `src/data/webpet/`. The *rules* must not fork just because the row source did.
 *
 * Layer 1 — `src/data/runnerList.json` override (per-id; wins outright)
 * Layer 2 — the row's `enabled` flag; a claimed id with NO row is a
 *           configuration error and must not run
 * Layer 3 — `TEST_SCOPE` segment/module filter (`src/config/scope.ts`)
 *
 * ## Why this is called from an auto fixture, never a `beforeEach`
 *
 * A `test.beforeEach(...)` written at module scope inside a fixture module
 * attaches to whichever file suite is loading at that instant, and the module
 * body runs once per worker process (Node's module cache). The hook therefore
 * fires for the **first spec file each worker loads and no others** — measured
 * on @playwright/test 1.58.2 with a two-spec probe: an `{ auto: true }` fixture
 * fired for all tests, the module-level hook for only the first file's.
 *
 * `base.fixture.ts` used to make exactly that mistake, so its journey suites were
 * only partly gated; it now calls this from a `gate` auto fixture, as
 * `webpetGate.ts` always has. Both callers must stay fixtures.
 *
 * An auto fixture also resolves *before* the test function's declared
 * parameters, so a skip decided here prevents `context`/`page`/`request` from
 * ever being created — which is both faster and the only way a gate can stop a
 * test that would otherwise fail during fixture setup.
 *
 * @module fixtures/executionGate
 */
import { getRunnerListDecision } from './methodInterceptor';
import { evaluateScope } from '../../config/scope';
import type { TestCaseData } from '../../types';

/** Whether the current test should run, and why not when it should not. */
export interface GateDecision {
    skip: boolean;
    reason: string;
}

const RUN: GateDecision = { skip: false, reason: '' };

/**
 * Decides execution for one test.
 *
 * @param caseId Resolved runner id. `''` for a deliberately unmanaged test —
 *   `auth.setup.ts`, `webpet.setup.ts`, and any spec not yet converted. This
 *   short-circuits every layer to RUN, which is load-bearing: without it a
 *   browser project would lose its session on the very first run.
 * @param row The matching runner row, or `null` when none exists.
 */
export function decideExecution(caseId: string, row: TestCaseData | null): GateDecision {
    // Layer 1 — runnerList.json wins outright for any id it lists, including
    // re-enabling a row whose `enabled` is false. Per-entry, so an id absent
    // from the list falls through rather than being implicitly excluded.
    const override = caseId ? getRunnerListDecision(caseId) : null;

    if (override === true) return RUN;
    if (override === false) {
        return { skip: true, reason: `Test case '${caseId}' is disabled in runnerList (execute=no)` };
    }

    // Layer 2 — the row governs. A test claiming an id with no matching row is a
    // configuration error and must NOT run: it would execute completely
    // ungoverned, which is how USR-000 burned both CI retries while every other
    // case in its journey was correctly disabled.
    if (caseId && !row) {
        return {
            skip: true,
            reason:
                `Test case '${caseId}' has no runner row — add one (enabled 1/0) ` +
                `or remove the annotation.`,
        };
    }
    if (row && row.enabled === false) {
        return { skip: true, reason: `Test case '${row.id}' is disabled in its runner row (enabled=false)` };
    }

    // Layer 3 — TEST_SCOPE. A row whose workflow does not apply to this
    // customer's segments, or needs a module they have not licensed, is not a
    // failure and not a gap: it is out of scope. Rows carrying neither (the
    // system rows, and every web-pet row) are always in scope.
    const verdict = evaluateScope(row);
    if (!verdict.inScope) {
        return {
            skip: true,
            reason:
                `Test case '${row!.id}' is out of scope for TEST_SCOPE='${process.env.TEST_SCOPE}' — ` +
                verdict.reason,
        };
    }

    return RUN;
}
