/**
 * Offline proof of the PDF text reader, against the 595-byte webpet sample ("PET-219 test").
 *
 * Runs only in the opt-in `tools-unit` project: `npm run test:unit`.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { WEBPET_SAMPLE_PDF } from '@config/webpetPaths';
import { readPdfText } from '@utils/pdf/pdfText';

test.describe('PDF text reader', () => {
    test('reads the text of a PDF file path', async () => {
        expect(await readPdfText(WEBPET_SAMPLE_PDF)).toContain('PET-219 test');
    });

    test('reads a Buffer and leaves it usable', async () => {
        const buffer = await readFile(WEBPET_SAMPLE_PDF);
        expect(await readPdfText(buffer)).toContain('PET-219 test');
        expect(buffer.subarray(0, 4).toString('latin1')).toBe('%PDF');
    });

    test('rejects bytes that are not a PDF', async () => {
        await expect(readPdfText(Buffer.from('not a pdf'))).rejects.toThrow();
    });
});
