/**
 * Builds a size-trimmed copy of an Allure results dir, shared by both report
 * generators: `scripts/report/allure-generate.js` (multi-file, for CI artifacts)
 * and `src/reporting/generate/allure/report.ts` (single-file, emailed/uploaded).
 *
 * Plain JS on purpose, and the TS side imports THIS rather than the reverse:
 * allure-generate.js runs from npm and CI with no TypeScript runtime, so it
 * cannot import a .ts module, whereas Playwright's transpiler loads .js fine.
 * The two copies this replaces carried "keep in sync" comments and had already
 * drifted — one blanket-dropped every video, which is how the Journey B emulator
 * recording disappeared from a report whose workflow advertised it.
 *
 * The constraint being expressed is SIZE, not format: the single-file report has
 * to survive a mail gateway. So videos are capped, not banned — a 480x960 device
 * journey is a few hundred KB, while the fifteen-minute browser webm that
 * originally motivated the ban was tens of MB.
 */
const fs = require('node:fs');
const path = require('node:path');

/** Allure names attachment files `<uuid>-attachment.<ext>`; this captures the extension. */
const ATTACHMENT_FILE_PATTERN = /-attachment\.([a-z0-9]+)$/i;

/** Always kept: screenshots and the tiny text/markdown step logs. */
const KEPT_ATTACHMENT_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md']);

/** Kept when under the size cap. */
const VIDEO_EXTS = new Set(['mp4', 'webm']);

const DEFAULT_MAX_VIDEO_MB = Number(process.env.ALLURE_MAX_VIDEO_MB ?? 8);

/** Playwright traces are useless inside Allure (it has no trace viewer) and are the biggest files. */
function isTrace(type, ext) {
    return (type && (type.includes('playwright-trace') || type === 'application/zip')) || ext === 'zip';
}

function extensionOf(name) {
    const match = String(name || '').match(ATTACHMENT_FILE_PATTERN);
    return match ? match[1].toLowerCase() : '';
}

function sizeMb(file) {
    try {
        return fs.statSync(file).size / (1024 * 1024);
    } catch {
        return Infinity;
    }
}

/**
 * @param {{ maxVideoMb?: number, keepVideo?: boolean, sourceDir?: string }} [options]
 *   keepVideo:false drops video regardless of size (used by nothing today, but it
 *   is the knob the single-file report would reach for if gateways tighten).
 */
function createFilter(options = {}) {
    const { maxVideoMb = DEFAULT_MAX_VIDEO_MB, keepVideo = true, sourceDir = '' } = options;

    /** Whether a video of this size is worth embedding. */
    const videoFits = (fileName) => {
        if (!keepVideo) return false;
        if (!sourceDir) return true; // no dir to measure against — let the file pass, the JSON pass decides
        return sizeMb(path.join(sourceDir, fileName)) <= maxVideoMb;
    };

    /** Decides on a file in the results dir, by name. */
    const isKeptAttachmentFile = (name) => {
        const ext = extensionOf(name);
        if (!ext) return true; // result/container/env JSON — never an attachment
        if (isTrace(null, ext)) return false;
        if (KEPT_ATTACHMENT_EXTS.has(ext)) return true;
        if (VIDEO_EXTS.has(ext)) return videoFits(name);
        return false;
    };

    /** Decides on one `attachments[]` entry inside a result JSON. */
    const isKeptAttachment = (attachment) => {
        if (!attachment || typeof attachment !== 'object') return false;
        const { source, type } = attachment;
        const ext = extensionOf(source);

        if (isTrace(type, ext)) return false;

        const isVideo = (type && String(type).startsWith('video/')) || VIDEO_EXTS.has(ext);
        if (isVideo) return source ? videoFits(source) : false;

        // Fall back to the file extension; an unrecognised type with no
        // extension is kept, matching the previous behaviour for metadata.
        if (ext) return KEPT_ATTACHMENT_EXTS.has(ext);
        return true;
    };

    return { isKeptAttachmentFile, isKeptAttachment };
}

/** Recursively trims every `attachments` array so the report never references a file we did not copy. */
function filterAttachments(node, isKeptAttachment) {
    if (Array.isArray(node)) {
        node.forEach((child) => filterAttachments(child, isKeptAttachment));
        return;
    }
    if (node && typeof node === 'object') {
        if (Array.isArray(node.attachments)) node.attachments = node.attachments.filter(isKeptAttachment);
        for (const value of Object.values(node)) filterAttachments(value, isKeptAttachment);
    }
}

/** The auth-setup project's results are infra, not real tests — drop them. */
function isAuthSetupResult(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.fullName && data.fullName.includes('.setup.ts')) return true;
    return (data.labels || []).some((l) => l.name === 'parentSuite' && l.value === 'auth-setup');
}

/**
 * Writes a trimmed copy of `sourceDir` into `destDir`.
 *
 * @param {string} sourceDir
 * @param {string} destDir
 * @param {{ maxVideoMb?: number, keepVideo?: boolean }} [options]
 */
function createLeanAllureResults(sourceDir, destDir, options = {}) {
    const { isKeptAttachmentFile, isKeptAttachment } = createFilter({ ...options, sourceDir });

    fs.mkdirSync(destDir, { recursive: true });

    for (const name of fs.readdirSync(sourceDir)) {
        const srcPath = path.join(sourceDir, name);
        if (fs.statSync(srcPath).isDirectory()) continue;

        if (ATTACHMENT_FILE_PATTERN.test(name)) {
            if (isKeptAttachmentFile(name)) fs.copyFileSync(srcPath, path.join(destDir, name));
            continue;
        }

        if (name.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
            if (name.endsWith('-result.json') && isAuthSetupResult(data)) continue;
            filterAttachments(data, isKeptAttachment);
            fs.writeFileSync(path.join(destDir, name), JSON.stringify(data));
        } else {
            fs.copyFileSync(srcPath, path.join(destDir, name));
        }
    }
}

module.exports = {
    ATTACHMENT_FILE_PATTERN,
    KEPT_ATTACHMENT_EXTS,
    VIDEO_EXTS,
    DEFAULT_MAX_VIDEO_MB,
    createFilter,
    createLeanAllureResults,
    isAuthSetupResult,
};
