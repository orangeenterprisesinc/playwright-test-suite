import { Locator, Page, expect } from '@playwright/test';

type PickerWindow = Window & { __cfPickerCalls?: string[] };

/**
 * Export to Accounting ▸ Export ▸ "Save export file" (measured 2026-11-02). Nothing is marked exported until the file
 * is saved; this component never saves: Save As runs only against the picker stand-in.
 * One button saves: "Save As…" while the browser has showSaveFilePicker, "Save" (anchor download) when it has not.
 */
export class ExportSaveDialog {
    readonly root: Locator;
    readonly title: Locator;
    readonly fileNameInput: Locator;
    readonly copyButton: Locator;
    readonly folderLine: Locator;
    readonly saveButton: Locator;
    readonly discardButton: Locator;
    readonly alerts: Locator;

    constructor(private readonly page: Page) {
        this.root = page.getByTestId('export-save-file-dialog');
        this.title = this.root.getByRole('heading');
        this.fileNameInput = this.root.getByTestId('export-save-file-name');
        this.copyButton = this.root.getByTestId('export-save-file-copy');
        this.folderLine = this.root.getByTestId('export-save-file-folder');
        this.saveButton = this.root.getByTestId('export-save-file-save');
        this.discardButton = this.root.getByTestId('export-save-file-discard');
        this.alerts = this.root.getByRole('alert');
    }

    /**
     * Test-only stand-in for the browser's save window, which cannot be driven: records each suggestedName and rejects
     * with AbortError, which the SPA treats as the user's Cancel. Armed before Export: Chromium has a native picker and
     * the SPA calls it by itself right after Export while the click's activation lasts.
     */
    async armPickerStandIn(): Promise<void> {
        await this.page.evaluate(() => {
            const w = window as PickerWindow;
            w.__cfPickerCalls = [];
            Object.defineProperty(window, 'showSaveFilePicker', {
                configurable: true,
                writable: true,
                value: async (opts?: { suggestedName?: string }) => {
                    (w.__cfPickerCalls ??= []).push(opts?.suggestedName ?? '');
                    throw new DOMException('The user aborted a request.', 'AbortError');
                },
            });
        });
    }

    async pickerArmed(): Promise<boolean> {
        return this.page.evaluate(
            () => Array.isArray((window as PickerWindow).__cfPickerCalls) && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function',
        );
    }

    async pickerCalls(): Promise<string[]> {
        return this.page.evaluate(() => [...((window as PickerWindow).__cfPickerCalls ?? [])]);
    }

    countDownloads(): { count: () => number; stop: () => void } {
        let n = 0;
        const on = (): void => {
            n += 1;
        };
        this.page.on('download', on);
        return { count: () => n, stop: () => this.page.off('download', on) };
    }

    async fileName(): Promise<string> {
        return this.fileNameInput.inputValue();
    }

    async rename(name: string): Promise<void> {
        await this.fileNameInput.fill(name);
        await expect(this.fileNameInput).toHaveValue(name);
    }

    /** Save As against the stand-in; refuses without it, because a real save window would export. Returns the name offered. */
    async saveAsCancelled(): Promise<string> {
        if (!(await this.pickerArmed())) throw new Error('Refusing Save As: the save-picker stand-in is not armed; a real save marks the job cards exported.');
        const before = (await this.pickerCalls()).length;
        await this.saveButton.click();
        await expect.poll(async () => (await this.pickerCalls()).length, { message: 'Save As asked for no save window', timeout: 10_000 }).toBe(before + 1);
        return (await this.pickerCalls())[before];
    }

    async grantClipboard(): Promise<void> {
        await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(this.page.url()).origin });
    }

    async copyFileName(): Promise<void> {
        await this.copyButton.click();
    }

    // The toast is a short-lived sonner toast outside the dialog.
    copiedToast(text: string): Locator {
        return this.page.getByText(text, { exact: true }).first();
    }

    async readClipboard(): Promise<string> {
        return this.page.evaluate(() => navigator.clipboard.readText());
    }

    async copyIsIconOnly(): Promise<boolean> {
        return (await this.copyButton.innerText()).trim() === '';
    }

    /** The copy button sits on the File name row, right of the input. */
    async copySitsBesideName(): Promise<boolean> {
        const input = await this.fileNameInput.boundingBox();
        const copy = await this.copyButton.boundingBox();
        if (!input || !copy) return false;
        const sameRow = Math.abs(input.y + input.height / 2 - (copy.y + copy.height / 2)) < 8;
        return sameRow && copy.x >= input.x + input.width - 1;
    }

    /** Two clicks: the first arms it (label and warning change), the second closes the dialog. Discard sends no request. */
    async discard(confirmLabel: string, warning: string): Promise<void> {
        await this.discardButton.click();
        await expect(this.discardButton).toHaveText(confirmLabel);
        await expect(this.alerts.filter({ hasText: warning })).toBeVisible();
        await this.discardButton.click();
        await expect(this.root).toBeHidden({ timeout: 10_000 });
    }
}
