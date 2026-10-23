import { Locator, Page, expect } from '@playwright/test';

export type TestFileState = 'not-configured' | 'empty' | 'named' | 'error';

/**
 * View > Job Cards ▸ Test File: the read-only "can these cards be exported?" sheet. No member exists for the
 * results alert's Yes, `export-test-file-download` or Export to Accounting. Locators measured live 2026-10-22.
 */
export class TestFileSheet {
    readonly trigger: Locator;
    readonly sheet: Locator;
    readonly heading: Locator;
    readonly resultsAlert: Locator;
    private readonly summary: Locator;

    constructor(private readonly page: Page) {
        this.trigger = page.getByTestId('export-analyze-action');
        this.sheet = page.getByTestId('job-card-analyze-sheet');
        // Test File opens the modal "Analyze Results" alert on top, which marks the sheet aria-hidden, so role
        // locators no longer see its heading.
        this.heading = this.sheet.locator('[data-slot="sheet-title"]', { hasText: /^Test File$/ });
        this.summary = page.getByTestId('job-card-analyze-summary');
        this.resultsAlert = page.getByTestId('export-analyze-results');
    }

    /** Click Test File and wait for both of the sheet's own POSTs; returns the crew ids each one carried. */
    async open(): Promise<{ candidatesCrewIds: number[]; testFileCrewIds: number[] }> {
        const post = (suffix: string) =>
            this.page.waitForResponse(
                (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(`/job-cards/export-to-accounting/${suffix}`),
                { timeout: 90_000 },
            );
        const candidates = post('candidates');
        const testFile = post('test-file');
        candidates.catch(() => undefined);
        testFile.catch(() => undefined);

        await expect(this.trigger, 'Test File stays disabled until the filter has loaded').toBeEnabled({ timeout: 30_000 });
        await this.trigger.click();
        await this.sheet.waitFor({ state: 'visible', timeout: 30_000 });

        const [candidatesResponse, testFileResponse] = await Promise.all([candidates, testFile]);
        expect(candidatesResponse.status(), 'POST export-to-accounting/candidates').toBe(200);
        expect(testFileResponse.status(), 'POST export-to-accounting/test-file').toBe(200);
        const crewIds = (response: typeof candidatesResponse): number[] => {
            const body = JSON.parse(response.request().postData() ?? '{}') as { crewIds?: unknown[] };
            return (body.crewIds ?? []).map(Number);
        };
        return { candidatesCrewIds: crewIds(candidatesResponse), testFileCrewIds: crewIds(testFileResponse) };
    }

    /** The export type the sheet opened on: the selected toggle renders as the filled button, the other as outline. */
    async activeType(): Promise<'payroll' | 'cost' | undefined> {
        const active = async (locator: Locator): Promise<boolean> => (await locator.getAttribute('data-variant')) === 'default';
        if (await active(this.page.getByTestId('job-card-analyze-type-payroll'))) return 'payroll';
        if (await active(this.page.getByTestId('job-card-analyze-type-cost'))) return 'cost';
        return undefined;
    }

    /** NaN until the summary renders. A side the summary omits (a zero) reads 0 once the other is present. */
    async readSummary(): Promise<{ ready: number; cannotExport: number }> {
        await expect(this.summary).toBeVisible({ timeout: 30_000 });
        const text = (await this.summary.innerText()).replace(/\s+/g, ' ');
        const read = (pattern: RegExp): number | undefined => {
            const raw = pattern.exec(text)?.[1];
            return raw === undefined ? undefined : Number(raw.replace(/,/g, ''));
        };
        const ready = read(/([\d,]+)\s+ready/i);
        const cannotExport = read(/([\d,]+)\s+cannot export/i);
        if (ready === undefined && cannotExport === undefined) return { ready: NaN, cannotExport: NaN };
        return { ready: ready ?? 0, cannotExport: cannotExport ?? 0 };
    }

    async fileState(): Promise<TestFileState> {
        const states: Array<[TestFileState, Locator]> = [
            ['not-configured', this.page.getByTestId('export-test-file-not-configured')],
            ['empty', this.page.getByTestId('export-test-file-empty')],
            ['error', this.page.getByTestId('export-test-file-error')],
            ['named', this.page.getByTestId('export-test-file-name')],
        ];
        await expect(states.map(([, l]) => l).reduce((a, b) => a.or(b)).first()).toBeVisible({ timeout: 30_000 });
        for (const [state, locator] of states) if (await locator.isVisible()) return state;
        return 'error';
    }

    async failureTexts(): Promise<string[]> {
        const failures = this.page.getByTestId('job-card-analyze-failures');
        if (!(await failures.isVisible().catch(() => false))) return [];
        return (await failures.innerText()).split('\n').map((line) => line.trim()).filter(Boolean);
    }

    /** "Analyzing completed. Correct job-cards: X. Incorrect job-cards: Y." */
    async resultsCounts(): Promise<{ correct: number; incorrect: number }> {
        await expect(this.resultsAlert).toBeVisible({ timeout: 30_000 });
        const text = (await this.resultsAlert.innerText()).replace(/\s+/g, ' ');
        const read = (pattern: RegExp) => Number(pattern.exec(text)?.[1] ?? 'NaN');
        return { correct: read(/Correct job-cards:\s*(\d+)/i), incorrect: read(/Incorrect job-cards:\s*(\d+)/i) };
    }

    /** No only: Yes downloads a client-side log. */
    async dismissResults(): Promise<void> {
        await expect(this.resultsAlert).toBeVisible({ timeout: 30_000 });
        await this.page.getByTestId('export-analyze-results-no').click();
        await expect(this.resultsAlert).toBeHidden({ timeout: 15_000 });
    }

    async close(): Promise<void> {
        await this.sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
        await expect(this.sheet).toBeHidden({ timeout: 15_000 });
    }
}
