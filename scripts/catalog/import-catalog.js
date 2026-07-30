/**
 * Imports the PET Tiger Workflow Catalog (.docx) into a machine-readable
 * `src/data/catalog/workflow-catalog.json`.
 *
 * The catalog is the source of truth for what the suite must eventually cover:
 * 69 workflows across 6 journeys, each carrying the segments and licence modules
 * it applies to. Every runner row, spec plan and spec file keys off the workflow
 * id this script emits (`A1`, `D4`, …), so re-run it whenever the tester updates
 * the document:
 *
 *     npm run catalog:import
 *
 * Plain JS with no dependencies, matching the rest of `scripts/` — a .docx is a
 * ZIP holding `word/document.xml`, and Node's zlib can inflate it directly, so
 * no unzip library is needed.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const DOCX = path.join(__dirname, '..', '..', 'docs', 'catalog', 'PET-Tiger-Workflow-Catalog.docx');
const OUT = path.join(__dirname, '..', '..', 'src', 'data', 'catalog', 'workflow-catalog.json');

/**
 * Which surface a workflow is exercised through — this is our addition, not a
 * catalog field, and it decides where the spec lives:
 *
 * Two folders, split on whether a browser is needed (that is what picks the
 * Playwright project); three surfaces map onto them:
 *
 * - `ui`     → tests/web/journey-*  (a browser screen drives it)
 * - `calc`   → tests/web/journey-*  (a calculation verified against data — acts in
 *                                    the UI, verifies via API/DB; tagged @Workflow)
 * - `device` → tests/api/journey-*  (handheld/kiosk capture; no web screen, so it
 *                                    is driven through the sync API — browserless)
 */
const SURFACE = {
    A1: 'ui', A2: 'ui', A3: 'ui', A4: 'ui', A5: 'ui', A6: 'device', A7: 'ui',
    A8: 'ui', A9: 'ui', A10: 'ui', A11: 'ui', A12: 'ui', A13: 'ui', A14: 'ui',

    B1: 'device', B2: 'device', B3: 'device', B4: 'device', B5: 'device',
    B6: 'device', B7: 'device', B8: 'device', B9: 'device', B10: 'device',
    B11: 'device', B12: 'device', B13: 'device', B14: 'ui', B15: 'device',

    C1: 'device', C2: 'device', C3: 'device', C4: 'device', C5: 'device',
    C6: 'device', C7: 'device', C8: 'device', C9: 'device', C10: 'device',

    D1: 'ui', D2: 'ui', D3: 'ui', D4: 'ui', D5: 'ui', D6: 'ui', D7: 'ui',
    D8: 'ui', D9: 'calc', D10: 'calc',

    E1: 'calc', E2: 'calc', E3: 'calc', E4: 'calc', E5: 'calc', E6: 'calc',
    E7: 'calc', E8: 'ui', E9: 'ui', E10: 'ui', E11: 'ui', E12: 'calc', E13: 'calc',

    F1: 'ui', F2: 'ui', F3: 'ui', F4: 'ui', F5: 'ui', F6: 'ui', F7: 'ui',
};

/**
 * Module names the prose spells differently from the appendix. Kept explicit so
 * an unknown module is a warning rather than a silently-tolerated typo.
 */
const MODULE_ALIASES = {
    'Signature Acknowledgement': 'Signature',
};

// ── .docx reading ───────────────────────────────────────────────────────

/**
 * Extracts one entry from a ZIP archive by name. Walks the End-of-Central-
 * Directory record to the central directory, finds the entry, then inflates the
 * raw deflate stream at its local-header offset.
 */
function readZipEntry(zipPath, entryName) {
    const buf = fs.readFileSync(zipPath);

    // End of central directory: signature 0x06054b50, scanned from the tail
    // because it is followed by a variable-length comment.
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error(`${zipPath} is not a ZIP archive (no EOCD record)`);

    const entryCount = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16); // central directory offset

    for (let i = 0; i < entryCount; i++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt central directory');
        const method = buf.readUInt16LE(p + 10);
        const compressedSize = buf.readUInt32LE(p + 20);
        const nameLength = buf.readUInt16LE(p + 28);
        const extraLength = buf.readUInt16LE(p + 30);
        const commentLength = buf.readUInt16LE(p + 32);
        const localOffset = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLength);

        if (name === entryName) {
            // Local file header: name/extra lengths repeat here and can differ
            // from the central directory's, so read them again.
            const localNameLength = buf.readUInt16LE(localOffset + 26);
            const localExtraLength = buf.readUInt16LE(localOffset + 28);
            const start = localOffset + 30 + localNameLength + localExtraLength;
            const raw = buf.subarray(start, start + compressedSize);
            return method === 0 ? raw : zlib.inflateRawSync(raw);
        }
        p += 46 + nameLength + extraLength + commentLength;
    }
    throw new Error(`Entry '${entryName}' not found in ${zipPath}`);
}

/** Flattens WordprocessingML to plain text, one line per paragraph. */
function docxToLines(xml) {
    return xml
        .replace(/<\/w:p>/g, '\n')
        .replace(/<w:tab[^>]*\/>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .split('\n')
        .map((line) => line.replace(/ /g, ' ').trim());
}

// ── Parsing ─────────────────────────────────────────────────────────────

/**
 * Splits a `Steps:` value ("1) do this. 2) do that.") into an ordered array.
 *
 * Scans for the markers *in sequence* — `1)`, then `2)` after it, and so on —
 * rather than splitting on any `\d+\)`. Step prose contains parenthesised digits
 * of its own ("view SSN or I9)" in A1, "(2, 4, or 6)" in C10), and a blind split
 * tears those steps in half.
 */
function parseSteps(value) {
    const positions = [];
    let cursor = 0;
    for (let n = 1; ; n++) {
        const marker = new RegExp(`(^|\\s)${n}\\)\\s*`, 'g');
        marker.lastIndex = cursor;
        const match = marker.exec(value);
        if (!match) break;
        positions.push({ start: match.index + match[0].length, markerStart: match.index });
        cursor = match.index + match[0].length;
    }

    if (!positions.length) {
        const single = value.trim();
        return single ? [single] : [];
    }

    return positions
        .map(({ start }, i) => {
            const end = i + 1 < positions.length ? positions[i + 1].markerStart : value.length;
            return value.slice(start, end).trim();
        })
        .filter(Boolean);
}

/** Splits a comma-separated field, dropping empties and trailing punctuation. */
function parseList(value) {
    return value
        .split(',')
        .map((item) => item.trim().replace(/\.$/, ''))
        .filter(Boolean);
}

/**
 * Parses the catalog's per-workflow blocks. Each begins with `A1 · Title` and is
 * followed by `Key: value` lines; a line that is neither starts a new workflow
 * nor a known key is appended to the previous key (the catalog wraps some
 * `Variations` values across several paragraphs).
 */
function parseCatalog(lines) {
    const KEYS = ['Summary', 'Segments', 'Modules', 'Steps', 'Variations', 'Demo', 'Jira', 'Status'];
    const workflows = [];
    const journeys = [];

    let journey = null;
    let current = null;
    let lastKey = null;

    for (const line of lines) {
        if (!line) continue;

        const journeyMatch = /^Journey ([A-F]):\s*(.+)$/.exec(line);
        if (journeyMatch) {
            journey = { id: journeyMatch[1], title: journeyMatch[2].trim() };
            journeys.push(journey);
            current = null;
            continue;
        }

        // "A1 · License, serial number, and user setup" — the separator is a
        // middle dot, and the document also uses a plain hyphen in places.
        const workflowMatch = /^([A-F]\d{1,2})\s*[·•\-–]\s*(.+)$/.exec(line);
        if (workflowMatch && journey) {
            current = {
                id: workflowMatch[1],
                journey: journey.id,
                journeyTitle: journey.title,
                title: workflowMatch[2].trim(),
                surface: SURFACE[workflowMatch[1]] || 'ui',
                summary: '',
                segments: [],
                modules: [],
                steps: [],
                variations: '',
                demo: false,
                jira: '',
                status: 'draft',
            };
            workflows.push(current);
            lastKey = null;
            continue;
        }

        if (!current) continue;

        const keyMatch = /^([A-Za-z]+):\s*(.*)$/.exec(line);
        const key = keyMatch && KEYS.includes(keyMatch[1]) ? keyMatch[1] : null;

        if (!key) {
            // Continuation of the previous key (e.g. extra Variations sentences).
            if (lastKey === 'Variations') {
                current.variations = `${current.variations} ${line}`.trim();
            } else if (lastKey === 'Summary') {
                current.summary = `${current.summary} ${line}`.trim();
            }
            continue;
        }

        const value = keyMatch[2].trim();
        lastKey = key;

        switch (key) {
            case 'Summary': current.summary = value; break;
            case 'Segments': current.segments = parseList(value); break;
            case 'Modules':
                current.modules = parseList(value).map((m) => MODULE_ALIASES[m] || m);
                break;
            case 'Steps': current.steps = parseSteps(value); break;
            case 'Variations': current.variations = value; break;
            case 'Demo': current.demo = /^yes/i.test(value); break;
            case 'Jira': current.jira = value; break;
            case 'Status': current.status = value || 'draft'; break;
        }
    }

    return { journeys, workflows };
}

/** Pulls the appendix's canonical module list so module names can be validated. */
function parseModuleAppendix(lines) {
    const anchor = lines.findIndex((line) => /^Anonymous Workers,/.test(line));
    return anchor < 0 ? [] : parseList(lines[anchor]);
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
    if (!fs.existsSync(DOCX)) {
        console.error(`Catalog not found: ${DOCX}`);
        process.exit(1);
    }

    const lines = docxToLines(readZipEntry(DOCX, 'word/document.xml').toString('utf8'));
    const { journeys, workflows } = parseCatalog(lines);
    const canonicalModules = parseModuleAppendix(lines);

    // "core" is the catalog's shorthand for the base engine, not a module name.
    const known = new Set([...canonicalModules, 'core']);
    const unknown = new Set();
    for (const workflow of workflows) {
        for (const module of workflow.modules) {
            if (!known.has(module)) unknown.add(`${workflow.id}: ${module}`);
        }
    }
    if (unknown.size) {
        console.warn('Module names not in the appendix (add an alias or fix the doc):');
        for (const entry of unknown) console.warn(`  - ${entry}`);
    }

    const missingSurface = workflows.filter((w) => !SURFACE[w.id]).map((w) => w.id);
    if (missingSurface.length) {
        console.warn(`No surface mapped, defaulted to 'ui': ${missingSurface.join(', ')}`);
    }

    const catalog = {
        source: path.basename(DOCX),
        journeys,
        modules: canonicalModules,
        segments: ['grower', 'perennial-grower', 'pack-house', 'nursery', 'flc'],
        workflows,
    };

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(catalog, null, 4)}\n`);

    const bySurface = workflows.reduce((acc, w) => {
        acc[w.surface] = (acc[w.surface] || 0) + 1;
        return acc;
    }, {});
    console.log(`Wrote ${workflows.length} workflows across ${journeys.length} journeys to ${path.relative(process.cwd(), OUT)}`);
    console.log(`Modules in appendix: ${canonicalModules.length}`);
    console.log(`By surface: ${Object.entries(bySurface).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    for (const journey of journeys) {
        const count = workflows.filter((w) => w.journey === journey.id).length;
        console.log(`  Journey ${journey.id}: ${count} workflows — ${journey.title}`);
    }
}

main();
