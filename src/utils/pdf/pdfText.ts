import { readFile } from 'node:fs/promises';

/** A PDF's text, lines whitespace-collapsed, pages joined by a blank line. pdf.js is ESM-only and this repo compiles to CommonJS, hence the dynamic import. */
export async function readPdfText(source: string | Uint8Array): Promise<string> {
    const bytes = typeof source === 'string' ? await readFile(source) : source;
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    // pdf.js detaches the array it is handed; a copy keeps the caller's Buffer usable.
    const doc = await getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
    try {
        const pages: string[] = [];
        for (let n = 1; n <= doc.numPages; n += 1) {
            const { items } = await (await doc.getPage(n)).getTextContent();
            const raw = items.map((i) => ('str' in i ? `${i.str}${i.hasEOL ? '\n' : ' '}` : '')).join('');
            pages.push(raw.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
        }
        return pages.join('\n\n');
    } finally {
        await doc.destroy();
    }
}
