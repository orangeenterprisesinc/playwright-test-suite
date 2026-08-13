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
 * ## Why one message instead of the `epic()`/`feature()`/… facade
 *
 * allure-playwright transports every runtime call as a Playwright ATTACHMENT
 * (`test.info().attach("Allure Metadata (metadata)", …)`), so the facade's
 * one-call-per-label style produced fourteen identically-named rows on every
 * test in the HTML report, burying the screenshots and traces. A metadata
 * message carries labels, parameters, description and testCaseId together, so
 * sending one costs a single row and reaches Allure identically.
 */
import type { TestInfo } from '@playwright/test';
import { LabelName, Severity, type Label, type Parameter } from 'allure-js-commons';
import { getGlobalTestRuntimeWithAutoconfig } from 'allure-js-commons/sdk/runtime';
import path from 'node:path';

interface MetadataMessage {
    type: 'metadata';
    data: {
        labels?: Label[];
        parameters?: Parameter[];
        description?: string;
        testCaseId?: string;
    };
}

/**
 * The runtime's own transport. The public `TestRuntime` type does not declare
 * it, but every message-based runtime implements it — including the one
 * allure-playwright installs — and it is the only way to send all the metadata
 * as ONE message. The facade's `labels()`/`parameter()`/… would cost one
 * attachment each.
 *
 * Resolve the runtime the way the facade itself does: with autoconfig, which
 * bootstraps it. Plain `getGlobalTestRuntime()` hands back a no-op runtime that
 * silently swallows everything — verified: the Allure results came out with no
 * epic/feature/story/owner at all.
 */
interface MetadataSender {
    sendMessage?(message: MetadataMessage): PromiseLike<void>;
}
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

/**
 * Applies epic / feature / story / suite / severity / owner for the current
 * test, and — when `row` (the matching runner row) is supplied — its
 * `testCaseId`, `Test Case ID` parameter, and `description`. Call once from
 * `test.beforeEach`.
 */
export async function applyAllureLabels(testInfo: TestInfo, row: TestCaseData | null = null): Promise<void> {
    const { category, module } = deriveAllureParts(testInfo.file);
    const specName = stripSpecSuffix(path.basename(testInfo.file));

    const labels: Label[] = [
        { name: LabelName.EPIC, value: category },
        { name: LabelName.FEATURE, value: module },
        { name: LabelName.STORY, value: deriveStory(testInfo, module) },
        { name: LabelName.SUITE, value: module },
        { name: LabelName.SEVERITY, value: severityFromTags(testInfo.tags) },
        { name: LabelName.OWNER, value: getConfigValue(ConfigProperties.ALLURE_OWNER, 'QA') },
    ];

    // With one spec file per catalog workflow, the file name is the workflow —
    // so it becomes the sub-suite, giving journey ▸ workflow ▸ describe instead
    // of collapsing every workflow in a journey into one flat suite.
    if (specName !== module) labels.push({ name: LabelName.SUB_SUITE, value: specName });

    // The catalog metadata the row carries, surfaced as report parameters so a
    // reader can see which journey/workflow a result belongs to and why a scope
    // filter would include or exclude it.
    const parameters: Parameter[] = [];
    if (row) {
        parameters.push({ name: 'Test Case ID', value: row.id });
        if (row.workflow) parameters.push({ name: 'Workflow', value: row.workflow });
        if (row.journey) parameters.push({ name: 'Journey', value: row.journey });
        if (row.segments?.length) parameters.push({ name: 'Segments', value: row.segments.join(', ') });
        if (row.modules?.length) parameters.push({ name: 'Modules', value: row.modules.join(', ') });
    }

    const data: MetadataMessage['data'] = {
        labels,
        ...(parameters.length ? { parameters } : {}),
        ...(row ? { testCaseId: row.id } : {}),
        ...(row?.testDescription ? { description: row.testDescription } : {}),
    };

    const runtime = await getGlobalTestRuntimeWithAutoconfig();
    const sender = runtime as typeof runtime & MetadataSender;
    if (sender.sendMessage) {
        await sender.sendMessage({ type: 'metadata', data });
        return;
    }

    // A runtime without the transport (or a future allure that renames it) still
    // gets everything through the public facade — several attachments instead of
    // one, but never silently unlabelled results.
    await runtime.labels(...labels);
    for (const p of parameters) await runtime.parameter(p.name, p.value);
    if (data.testCaseId) await runtime.testCaseId(data.testCaseId);
    if (data.description) await runtime.description(data.description);
}
