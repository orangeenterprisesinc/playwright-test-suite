import { Locator, Page } from '@playwright/test';
import { CrewPunchPage } from './CrewPunchPage';

/**
 * Input ▸ Batch ▸ Crew Piece Out (`/input/crew-piece-out/new`) — one row for the whole crew, which
 * the transfer later distributes across its members. Ranch is required on this form (it is optional
 * on Crew Time In), and this is the punch that carries the job.
 */
export class CrewPieceOutPage extends CrewPunchPage {
    readonly numOfPiecesInput: Locator;

    constructor(page: Page) {
        super(page, '/input/crew-piece-out/new', /New Crew Piece Out/i);
        this.numOfPiecesInput = page.locator('#numOfPieces');
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
        await this.save();
    }
}

export default CrewPieceOutPage;
