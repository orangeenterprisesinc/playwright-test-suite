import { promises as fs } from 'node:fs';
import { Locator, Page, expect } from '@playwright/test';
import { PickerComponent } from '../../components/PickerComponent';
import { pickDayInPopup } from '../processing/dateRangePopup';
import { PdfViewerDialog } from './PdfViewerDialog';

export interface RunOutcome {
    status: number;
    contentType: string;
    viewerHeading: string;
    viewerSrc: string;
    suggestedFilename: string;
    savedBytes: number;
    /** First four bytes of the saved file. */
    savedHead: string;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isRunRequest = (method: string, url: string): boolean => method === 'POST' && new URL(url).pathname.endsWith('/reports/run');

/**
 * The generic "Run <report>" dialog opened from a Reports hub row. Locators measured live 2026-10-28.
 * Element ids contain dots (`report-run-sel-TimeCard.DateTime`), so controls are found by attribute, never `#id`.
 */
export class ReportRunDialog {
    readonly root: Locator;
    readonly title: Locator;
    readonly description: Locator;
    readonly runButton: Locator;
    readonly cancelButton: Locator;
    readonly viewer: PdfViewerDialog;
    private readonly picker: PickerComponent;

    constructor(private readonly page: Page) {
        this.root = page.getByRole('dialog', { name: /^Run / });
        this.title = this.root.getByRole('heading', { level: 2 });
        this.description = this.root.locator('[data-slot="dialog-description"]');
        this.runButton = this.root.getByRole('button', { name: /^(Run|Running…)$/ });
        this.cancelButton = this.root.getByRole('button', { name: 'Cancel', exact: true });
        this.viewer = new PdfViewerDialog(page);
        this.picker = new PickerComponent(page);
    }

    async waitOpen(): Promise<void> {
        await expect(this.root, 'the Run dialog must open').toBeVisible({ timeout: 30_000 });
        await expect(this.title).toBeVisible({ timeout: 15_000 });
    }

    async parameterLabels(): Promise<string[]> {
        const texts = await this.root.locator('label[data-slot="label"]:not([for$="-Yes"]):not([for$="-No"])').allInnerTexts();
        return texts.map((t) => t.trim());
    }

    private label(label: string): Locator {
        return this.root
            .locator('label[data-slot="label"]:not([for$="-Yes"]):not([for$="-No"])')
            .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) });
    }

    async control(label: string): Promise<Locator> {
        const id = await this.label(label).first().getAttribute('for', { timeout: 15_000 }).catch(() => null);
        if (!id) throw new Error(`Run dialog: no parameter label '${label}' (labels: ${(await this.parameterLabels()).join(' · ')})`);
        return this.root.locator(`[id="${id}"]`);
    }

    descriptionOf(label: string): Locator {
        return this.label(label).first().locator('xpath=following-sibling::p[1]');
    }

    /** The two radios of a Yes/No parameter. */
    async yesNo(label: string): Promise<Locator> {
        return (await this.control(label)).getByRole('radio');
    }

    async radio(label: string, option: string): Promise<Locator> {
        return (await this.control(label)).getByRole('radio', { name: option, exact: true });
    }

    async selectOptions(label: string): Promise<string[]> {
        await (await this.control(label)).click();
        const listbox = this.page.getByRole('listbox');
        await listbox.waitFor({ state: 'visible', timeout: 15_000 });
        const options = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim());
        await this.page.keyboard.press('Escape');
        await expect(listbox).toBeHidden({ timeout: 15_000 });
        return options;
    }

    async pickChoice(label: string, option: string): Promise<void> {
        await this.picker.pickSelect(await this.control(label), option);
    }

    /** Picks today + `dayOffset` in the single-date popover, clicks elsewhere, and returns the ISO day. */
    async pickDate(label: string, dayOffset: number): Promise<string> {
        const target = new Date();
        target.setDate(target.getDate() + dayOffset);
        const [y, m, d] = [target.getFullYear(), target.getMonth() + 1, target.getDate()];
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        const control = await this.control(label);
        await control.click();
        const popover = this.page.getByRole('dialog').filter({ has: this.page.getByRole('textbox', { name: 'YYYY' }) });
        await popover.waitFor({ state: 'visible', timeout: 15_000 });
        await pickDayInPopup(popover, iso);
        await expect(popover).toBeHidden({ timeout: 15_000 });
        await this.title.click();
        await expect(control, `${label} must still hold ${iso} after clicking elsewhere`).toHaveText(new RegExp(`^0?${m}/0?${d}/${y}$`));
        return iso;
    }

    async searchEntity(label: string, text: string): Promise<string[]> {
        const input = await this.control(label);
        await input.click();
        await input.fill(text);
        const listbox = this.page.getByRole('listbox');
        await listbox.waitFor({ state: 'visible', timeout: 15_000 });
        await expect(listbox.getByRole('option').first()).toBeVisible({ timeout: 15_000 });
        return (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim());
    }

    async pickEntity(label: string, option: string): Promise<void> {
        const input = await this.control(label);
        const choice = this.page.getByRole('option', { name: PickerComponent.labelPattern(option) });
        await choice.first().click({ timeout: 15_000 });
        await expect(input).toHaveValue(PickerComponent.labelPattern(option));
    }

    async run(saveTo: string): Promise<RunOutcome> {
        const responded = this.page.waitForResponse((r) => isRunRequest(r.request().method(), r.url()), { timeout: 120_000 });
        responded.catch(() => undefined);

        await this.runButton.click();
        // The busy label lasts about 2 s on dev; check it before awaiting the response.
        await expect(this.runButton, 'the Run button must read Running… while the report runs').toHaveText('Running…', { timeout: 10_000 });
        const response = await responded.catch((cause: unknown) => {
            throw new Error('POST /reports/run sent no response within 120 s.', { cause });
        });
        if (response.status() === 504) throw new Error('POST /reports/run answered 504: the report took too long to produce.');
        expect(response.status(), 'POST /reports/run must answer 200').toBe(200);
        await expect(this.root, 'the Run dialog must close after a run').toBeHidden({ timeout: 30_000 });

        const opened = await this.viewer.waitOpen();
        const saved = await this.viewer.download(saveTo);
        const head = (await fs.readFile(saveTo)).subarray(0, 4).toString('latin1');
        return {
            status: response.status(),
            contentType: response.headers()['content-type'] ?? '',
            viewerHeading: opened.heading,
            viewerSrc: opened.src,
            suggestedFilename: saved.suggestedFilename,
            savedBytes: saved.savedBytes,
            savedHead: head,
        };
    }

    /** Cancel must close the dialog without sending POST /reports/run inside `windowMs`. */
    async cancel(windowMs: number): Promise<void> {
        const outcome = this.page
            .waitForRequest((r) => isRunRequest(r.method(), r.url()), { timeout: windowMs })
            .then(() => 'sent' as const, () => 'quiet' as const);
        await this.cancelButton.click();
        await expect(this.root, 'Cancel must close the Run dialog').toBeHidden({ timeout: 15_000 });
        if ((await outcome) === 'sent') throw new Error('Cancel sent POST /reports/run');
    }
}
