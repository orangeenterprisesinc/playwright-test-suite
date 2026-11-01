import { Locator, Page, expect } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Piece Out (`/input/crew-piece-out/new`) — one row for the whole crew, which
 * the transfer later distributes across its members. Ranch is required on this form (it is optional
 * on Crew Time In), and this is the punch that carries the job.
 */
export class CrewPieceOutPage extends CrewPunchPage {
    readonly numOfPiecesInput: Locator;

    constructor(page: Page) {
        // null: Input ▸ Batch has no Crew Piece Out entry on dev (2026-10-16), so gotoNew opens it by address.
        super(page, '/input/crew-piece-out', null, /New Crew Piece Out/i, false);
        this.numOfPiecesInput = page.locator('#numOfPieces');
    }

    // No roster on Piece Out: one row for the whole crew.
    protected async waitForEmployees(): Promise<void> {
        await expect(this.crewCombobox).not.toHaveAttribute('placeholder', /^Loading/, { timeout: 15_000 });
    }

    async pieceOut(opts: { day: string; hour: number; minute: number; crew: string; ranch: string; field: string; job: string; pieces: number }): Promise<void> {
        await this.gotoNew();
        await this.setDateTime(opts.day, opts.hour, opts.minute);
        await this.selectCrew(opts.crew);
        // `maximumNumberOfPieces` (5 on dev) rejects a larger count with block.piece_above_maximum.
        await this.numOfPiecesInput.fill(String(opts.pieces));
        await this.selectRanch(opts.ranch);
        await this.selectField(opts.field);
        await this.selectJob(opts.job);
        if ((await this.numOfPiecesInput.inputValue()) !== String(opts.pieces)) await this.numOfPiecesInput.fill(String(opts.pieces));
        await expect(this.numOfPiecesInput).toHaveValue(String(opts.pieces));
        await this.save();
    }
}

export default CrewPieceOutPage;
