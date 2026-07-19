/**
 * @fileoverview Allure report generation.
 *
 * Invokes `allure-commandline`'s JS API directly rather than shelling out to
 * `npx allure` / the node_modules/.bin wrapper — those are .cmd shims on
 * Windows, and cmd.exe treats `&` as a command separator, which breaks when
 * the repo lives in a path containing one (see scripts/run-playwright.js).
 *
 * {@link prepareLeanEmailReport} embeds ONLY screenshots (plus tiny step logs)
 * and drops the heavy video/trace attachments before generating — that keeps
 * the single-file email report small enough that it never hits the "file too
 * large" failure. The full video/trace remain available in the Playwright HTML
 * report and raw test-results/ artifacts. It is written entirely under the OS
 * temp dir (no zip — many mail gateways strip those), so it never shows up as a
 * folder in the repo tree; call the returned `cleanup()` once the email is sent.
 *
 * The static multi-file report for CI artifacts / `npm run report:allure` is
 * generated separately by `scripts/generate-allure-report.js` (plain JS, so it
 * runs from npm/CI without a TypeScript runtime).
 *
 * @module utils/allureHelper
 */
import allureCommandline from 'allure-commandline';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * allure-commandline shells out to `java`, which only sees this process's
 * `PATH`/`JAVA_HOME` — not whatever a later system-wide install (e.g. via
 * winget) configured, since already-running terminals never pick that up
 * automatically on Windows. Rather than requiring every terminal to be
 * restarted, read the machine-level value straight from the registry (the
 * same source `[System.Environment]::GetEnvironmentVariable(...,'Machine')`
 * reads) and patch this process's own env before invoking allure.
 */
function ensureJavaOnPath(): void {
    if (process.platform !== 'win32') return;
    if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))) return;

    try {
        const output = execFileSync(
            'reg',
            ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', 'JAVA_HOME'],
            { encoding: 'utf-8' },
        );
        const javaHome = output.match(/JAVA_HOME\s+REG_\w+\s+(.+)/)?.[1]?.trim();
        if (javaHome && fs.existsSync(path.join(javaHome, 'bin', 'java.exe'))) {
            process.env.JAVA_HOME = javaHome;
            process.env.PATH = `${path.join(javaHome, 'bin')};${process.env.PATH}`;
        }
    } catch {
        // Best-effort — if the registry lookup fails, allure generate fails
        // with its usual clear "JAVA_HOME is not set" error, same as before.
    }
}

/** Runs `allure <args>` and resolves once the process exits successfully. */
function runAllure(args: string[]): Promise<void> {
    ensureJavaOnPath();
    return new Promise((resolve, reject) => {
        const proc = allureCommandline(args);
        proc.on('error', reject);
        proc.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`allure ${args[0]} exited with code ${code}`));
        });
    });
}

/** Allure names attachment files `<uuid>-attachment.<ext>`; this captures the extension. */
const ATTACHMENT_FILE_PATTERN = /-attachment\.([a-z0-9]+)$/i;

/**
 * Attachment extensions Allure keeps: screenshots (small, high value) plus the
 * tiny text/markdown step logs. Video (`.webm`) and Playwright trace (`.zip`)
 * are dropped — they're the multi-MB attachments that blow up the single-file
 * report and cause the "file too large" failure. The full video/trace still
 * live in the Playwright HTML report and raw test-results/ artifacts.
 */
const KEPT_ATTACHMENT_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'md']);

/** Whether an attachment file (`<uuid>-attachment.<ext>`) should be copied into the lean report. */
function isKeptAttachmentFile(name: string): boolean {
    const match = name.match(ATTACHMENT_FILE_PATTERN);
    if (!match) return true; // not an attachment file (result/container/env JSON) — always kept
    return KEPT_ATTACHMENT_EXTS.has(match[1].toLowerCase());
}

/** Whether a single `attachments[]` entry in a result JSON should be kept. */
function isKeptAttachment(attachment: unknown): boolean {
    if (!attachment || typeof attachment !== 'object') return false;
    const { source, type } = attachment as { source?: string; type?: string };

    // Drop video and Playwright trace by mime type first (most reliable signal).
    if (type && (type.startsWith('video/') || type.includes('playwright-trace') || type === 'application/zip')) {
        return false;
    }
    // Otherwise fall back to the source file's extension.
    if (source) {
        const match = source.match(ATTACHMENT_FILE_PATTERN);
        if (match) return KEPT_ATTACHMENT_EXTS.has(match[1].toLowerCase());
    }
    return true;
}

/**
 * Whether a parsed result JSON belongs to the `auth-setup` project (the
 * one-time login). Those aren't real tests — excluding them keeps the report
 * focused on ui/api/workflow.
 */
function isAuthSetupResult(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const obj = data as { fullName?: string; labels?: Array<{ name?: string; value?: string }> };
    if (obj.fullName && obj.fullName.includes('.setup.ts')) return true;
    return (obj.labels ?? []).some((l) => l.name === 'parentSuite' && l.value === 'auth-setup');
}

/** Recursively filters every `attachments` array down to the kept entries, so the report never references a file we didn't copy. */
function filterAttachments(node: unknown): void {
    if (Array.isArray(node)) {
        node.forEach(filterAttachments);
        return;
    }
    if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (Array.isArray(obj.attachments)) obj.attachments = obj.attachments.filter(isKeptAttachment);
        for (const value of Object.values(obj)) filterAttachments(value);
    }
}

/**
 * Writes a screenshot-only copy of `sourceDir`'s allure-results into `destDir`:
 * screenshots and step logs are kept; video and trace attachments are dropped
 * (both the files and their references in the result JSON).
 */
function createLeanAllureResults(sourceDir: string, destDir: string): void {
    fs.mkdirSync(destDir, { recursive: true });

    for (const name of fs.readdirSync(sourceDir)) {
        const srcPath = path.join(sourceDir, name);
        if (fs.statSync(srcPath).isDirectory()) continue;

        // Attachment files: copy only the kept types (screenshots / text logs).
        if (ATTACHMENT_FILE_PATTERN.test(name)) {
            if (isKeptAttachmentFile(name)) fs.copyFileSync(srcPath, path.join(destDir, name));
            continue;
        }

        if (name.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
            // Drop the auth-setup project's results — infra, not a real test.
            if (name.endsWith('-result.json') && isAuthSetupResult(data)) continue;
            filterAttachments(data);
            fs.writeFileSync(path.join(destDir, name), JSON.stringify(data));
        } else {
            fs.copyFileSync(srcPath, path.join(destDir, name));
        }
    }
}

/**
 * Builds a lean, single-file Allure report (screenshots + step logs only, no
 * video/trace) for emailing. Everything is written under the OS temp dir —
 * call the returned `cleanup()` once you're done reading `htmlPath` (e.g. after
 * `sendMail`).
 */
export async function prepareLeanEmailReport(resultsDir = 'allure-results'): Promise<{ htmlPath: string; cleanup: () => void }> {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-email-'));
    const leanResultsDir = path.join(tmpRoot, 'results');
    const reportDir = path.join(tmpRoot, 'report');

    createLeanAllureResults(resultsDir, leanResultsDir);
    await runAllure(['generate', leanResultsDir, '--single-file', '--clean', '-o', reportDir]);

    return {
        htmlPath: path.join(reportDir, 'index.html'),
        cleanup: () => fs.rmSync(tmpRoot, { recursive: true, force: true }),
    };
}
