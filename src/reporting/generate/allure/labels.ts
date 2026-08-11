/**
 * @fileoverview Applies Allure BDD labels to the currently-running test.
 *
 * Derives a proper Epic → Feature → Story hierarchy from the spec's location
 * under `tests/<category>/<module>/…` plus severity from the test's tags and a
 * configurable owner — centralising what used to be two ad-hoc calls in
 * base.fixture.
 *
 * Mapping:
 * - `epic`     = category (1st folder under tests/ — `ui` / `api` / `workflow`)
 * - `feature`  = module   (2nd folder, or the file basename if none)
 * - `story`    = the innermost `describe` group (or the module as a fallback)
 * - `suite`    = module
 * - `severity` = highest level tag present: smoke→critical, high-level→normal,
 *                regression→minor (default normal)
 * - `owner`    = `ALLURE_OWNER` env (default `QA`)
 *
 * When the caller supplies the matching runner row (resolved via
 * `test.use({ testCaseId })` or a `{ type: 'testCaseId' }` annotation), it also
 * sets:
 * - `testCaseId` (Allure history id) + a visible `Test Case ID` parameter
 * - `description` (from the row's `testDescription`)
 *
 * All of it goes out as ONE Allure runtime message rather than one per label —
 * see {@link applyAllureLabels} for why that matters to the Playwright report.
 */
import type { TestInfo } from '@playwright/test';
import { Severity } from 'allure-js-commons';
import { getGlobalTestRuntimeWithAutoconfig } from 'allure-js-commons/sdk/runtime';
import path from 'node:path';
import { ConfigProperties, getConfigValue } from '../../../config/configProperties';
import type { TestCaseData } from '../../../types';

/** A spec's category (test type) and module (feature area) derived from its path. */
export interface AllureParts {
    category: string;
    module: string;
}

/** Strips the `.spec.ts` / `.setup.ts` suffix from a file name. */
function stripSpecSuffix(name: string): string {
    return name.replace(/\.(spec|setup)\.ts$/, '');
}

/**
 * Splits a spec path under `tests/` into its `category` (1st folder) and
 * `module` (2nd folder, or the file basename when the spec sits directly under
 * the category).
 */
export function deriveAllureParts(specFile: string): AllureParts {
    const relative = path.relative(path.join(process.cwd(), 'tests'), specFile);
    const segments = relative.split(path.sep);
    const category = stripSpecSuffix(segments[0]);

    let module: string;
    if (segments.length >= 3) {
        module = segments[1]; // tests/<category>/<module>/file.spec.ts
    } else if (segments.length === 2) {
        module = stripSpecSuffix(segments[1]); // tests/<category>/file.spec.ts
    } else {
        module = category; // tests/file.spec.ts
    }
    return { category, module };
}

/** Maps the test's level tags to an Allure severity — the highest present wins. */
export function severityFromTags(tags: string[]): Severity {
    const normalized = tags.map((t) => t.replace(/^@/, '').toLowerCase());
    if (normalized.includes('smoke')) return Severity.CRITICAL;
    if (normalized.includes('high-level')) return Severity.NORMAL;
    if (normalized.includes('regression')) return Severity.MINOR;
    return Severity.NORMAL;
}

/**
 * The Allure "story" — the innermost `describe` title wrapping the test, or
 * `fallback` (the module) when the test has no `describe`. Structure-agnostic:
 * it filters the file path, project name, and the test title out of
 * `titlePath`, leaving only the describe blocks.
 */
export function deriveStory(testInfo: TestInfo, fallback: string): string {
    const describes = testInfo.titlePath.filter(
        (title) => title && !title.endsWith('.ts') && title !== testInfo.project.name && title !== testInfo.title,
    );
    return describes.length ? describes[describes.length - 1] : fallback;
}

/**
 * Resolves the runner-row id for the current test: the `testCaseId` option
 * (set via `test.use`), else a `{ type: 'testCaseId' }` annotation, else `''`.
 */
export function resolveCaseId(testInfo: TestInfo, testCaseIdOption: string): string {
    if (testCaseIdOption) return testCaseIdOption;
    return testInfo.annotations.find((a) => a.type === 'testCaseId')?.description ?? '';
}

interface AllureLabel {
    name: string;
    value: string;
}

/**
 * Runtime handle for the active Allure reporter. `allure-js-commons`' facade
 * (`epic()`, `feature()`, …) is one call per label and each one crosses the
 * worker→reporter boundary as its own attachment; `sendMessage` takes the whole
 * payload in one. See the note on {@link applyAllureLabels}.
 *
 * Returns null when Allure is not active — the autoconfigured runtime is then a
 * NoopTestRuntime, which has no `sendMessage`.
 */
async function metadataSink(): Promise<((message: unknown) => Promise<void>) | null> {
    const runtime = (await getGlobalTestRuntimeWithAutoconfig()) as unknown as {
        sendMessage?: (message: unknown) => Promise<void>;
    };
    return typeof runtime.sendMessage === 'function' ? runtime.sendMessage.bind(runtime) : null;
}

/**
 * Applies epic / feature / story / suite / severity / owner for the current
 * test, and — when `row` (the matching runner row) is supplied — its
 * `testCaseId`, `Test Case ID` parameter, and `description`. Call once per test,
 * from the gate fixture.
 *
 * ## Why one message instead of thirteen facade calls
 *
 * allure-playwright ships its runtime metadata to the reporter by attaching it to
 * the test (content type `application/vnd.allure.message+json`) — that is the only
 * channel across the worker boundary. Playwright's HTML reporter then writes EVERY
 * attachment to `artifacts/html/data/`, so the facade's one-call-per-label style
 * put ~9 unopenable `.dat` files in the report per test: a measured 3489
 * attachments and 1347 files on a 405-test run, which is what made the report's
 * attachment list useless.
 *
 * A single `metadata` message carries labels, parameters, description and
 * testCaseId together, so the cost is one attachment per test instead of nine.
 * Two cheaper routes do NOT work and were measured, not assumed: allure-playwright
 * reads `test.annotations` at collection time and ignores runtime
 * `testInfo.annotations` pushes, and it never splices its messages out of
 * `result.attachments`, so reporter ordering cannot hide them either. Getting to
 * zero means deriving the labels at generate time instead — see docs/STRUCTURE.md.
 */
export async function applyAllureLabels(testInfo: TestInfo, row: TestCaseData | null = null): Promise<void> {
    const sendMessage = await metadataSink();
    if (!sendMessage) return;

    const { category, module } = deriveAllureParts(testInfo.file);

    const labels: AllureLabel[] = [
        { name: 'epic', value: category },
        { name: 'feature', value: module },
        { name: 'story', value: deriveStory(testInfo, module) },
        { name: 'suite', value: module },
        { name: 'severity', value: severityFromTags(testInfo.tags) },
        { name: 'owner', value: getConfigValue(ConfigProperties.ALLURE_OWNER, 'QA') },
    ];

    // With one spec file per catalog workflow, the file name is the workflow —
    // so it becomes the sub-suite, giving journey ▸ workflow ▸ describe instead
    // of collapsing every workflow in a journey into one flat suite.
    const specName = stripSpecSuffix(path.basename(testInfo.file));
    if (specName !== module) labels.push({ name: 'subSuite', value: specName });

    const parameters: AllureLabel[] = [];
    let description: string | undefined;

    if (row) {
        parameters.push({ name: 'Test Case ID', value: row.id });
        if (row.testDescription) description = row.testDescription;

        // The catalog metadata the row carries, surfaced as report parameters so a
        // reader can see which journey/workflow a result belongs to and why a
        // scope filter would include or exclude it.
        if (row.workflow) parameters.push({ name: 'Workflow', value: row.workflow });
        if (row.journey) parameters.push({ name: 'Journey', value: row.journey });
        if (row.segments?.length) parameters.push({ name: 'Segments', value: row.segments.join(', ') });
        if (row.modules?.length) parameters.push({ name: 'Modules', value: row.modules.join(', ') });
    }

    await sendMessage({
        type: 'metadata',
        data: {
            labels,
            ...(parameters.length ? { parameters } : {}),
            ...(description ? { description } : {}),
            ...(row ? { testCaseId: row.id } : {}),
        },
    });
}
