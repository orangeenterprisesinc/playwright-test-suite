// Parsers for the OrangeExportFile the OFFICE produces (Setup ▸ Scan Devices ▸ Push to Device; the
// setup export a09 reads in 4d): section blocks and their Clear attribute. Read-only — nothing here builds XML.

/** The inner XML of `<{tag} …>…</{tag}>`, or '' when the section is absent. */
export function recordsBlock(xml: string, tag: string): string {
    const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
    return match ? match[1] : '';
}

/** True when the section's opening tag carries Clear="True" — the device replaces the table instead of merging into it. */
export function recordsBlockCleared(xml: string, tag: string): boolean {
    const match = new RegExp(`<${tag}([^>]*)>`).exec(xml);
    return !!match && /Clear="True"/.test(match[1]);
}

export interface SetupExportView {
    xml: string;
    /** Every `<X_Records>` section tag, document order. */
    sections: string[];
    block(tag: string): string;
    cleared(tag: string): boolean;
}

export function setupExportView(xml: string): SetupExportView {
    return {
        xml,
        sections: [...xml.matchAll(/<(\w+_Records)\b/g)].map((m) => m[1]),
        block: (tag) => recordsBlock(xml, tag),
        cleared: (tag) => recordsBlockCleared(xml, tag),
    };
}

/**
 * One `Preferen_Records` value, by its legacy `Name`.
 *
 * The envelope is `<Preferen><Name>Key</Name><Value>v</Value></Preferen>`, so the value is not
 * inside a tag named after the key — a `<Key>` lookup finds nothing.
 */
export function preferenceInExport(xml: string, key: string): string | undefined {
    const hit = xml.match(new RegExp(`<Name>\\s*${key}\\s*</Name>\\s*<Value>([^<]*)</Value>`, 'i'));
    return hit ? hit[1].trim() : undefined;
}

/**
 * The exported job names whose `PaymentType` makes them piece-eligible.
 *
 * `paymentTypes` are the labels the export writes, not the numeric paymentType the office API
 * returns; the file XML-escapes the ampersand, so the comparison unescapes before matching.
 */
export function pieceJobsInExport(xml: string, paymentTypes: readonly string[], section = 'Job_Records'): string[] {
    const eligible = new Set(paymentTypes);
    return [...recordsBlock(xml, section).matchAll(/<Job>(.*?)<\/Job>/gs)]
        .map((job) => job[1])
        .filter((job) => {
            const type = job.match(/<PaymentType>([^<]*)</)?.[1].replace(/&amp;/g, '&').trim();
            return type !== undefined && eligible.has(type);
        })
        .map((job) => job.match(/<Name>([^<]*)</)?.[1] ?? '(unnamed)');
}
