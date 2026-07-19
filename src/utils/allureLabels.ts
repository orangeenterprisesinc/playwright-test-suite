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
 * @module utils/allureLabels
 */
import type { TestInfo } from '@playwright/test';
import {
    epic,
    feature,
    story,
    suite,
    owner,
    severity,
    Severity,
    description,
    parameter,
    testCaseId as allureTestCaseId,
} from 'allure-js-commons';
import path from 'node:path';
import { ConfigProperties, getConfigValue } from '../enums/configProperties';
import type { TestCaseData } from '../types';

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
 *
 * @example
 * deriveAllureParts('.../tests/ui/login/login-module.spec.ts') // { category: 'ui', module: 'login' }
 * deriveAllureParts('.../tests/api/example-api.spec.ts')       // { category: 'api', module: 'example-api' }
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
    await epic(category);
    await feature(module);
    await story(deriveStory(testInfo, module));
    await suite(module);
    await severity(severityFromTags(testInfo.tags));
    await owner(getConfigValue(ConfigProperties.ALLURE_OWNER, 'QA'));

    if (row) {
        await allureTestCaseId(row.id);
        await parameter('Test Case ID', row.id);
        if (row.testDescription) await description(row.testDescription);
    }
}
