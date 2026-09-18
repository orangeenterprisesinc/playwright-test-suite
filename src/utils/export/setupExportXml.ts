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
