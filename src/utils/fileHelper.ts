/**
 * @fileoverview File-system helper utilities for test automation.
 *
 * Provides functions for creating, reading, writing, and deleting files and
 * directories, as well as managing downloads, uploads, and temporary files
 * used during Playwright test execution.
 *
 * @module utils/fileHelper
 * @author Vicky
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import { createTempFile, waitForDownload, cleanupTempFiles } from '@utils/fileHelper';
 *
 * const tmpPath = createTempFile('data.txt', 'hello');
 * const dlPath  = await waitForDownload(page, () => page.click('#download-btn'));
 * cleanupTempFiles();
 * ```
 */
import fs from 'fs';
import path from 'path';
import { Page } from '@playwright/test';
import { Logger } from './logger';

const logger = new Logger('FileHelper');

/** @const {string} DOWNLOADS_DIR - Default directory for downloaded files */
const DOWNLOADS_DIR = 'test-results/downloads';

/** @const {string} UPLOADS_DIR - Default directory for upload test fixtures */
const UPLOADS_DIR = 'test-data/uploads';

/** @const {string} TEMP_DIR - Default directory for temporary files */
const TEMP_DIR = 'test-results/temp';

/**
 * Ensures that the given directory exists, creating it recursively if needed.
 *
 * @param {string} dirPath - Absolute or relative directory path
 */
export function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.debug(`Created directory: ${dirPath}`);
    }
}

/**
 * Creates a temporary file with the given content inside {@link TEMP_DIR}.
 *
 * @param {string} filename - Name of the file to create
 * @param {string} content - Text content to write
 * @returns {string} Absolute path to the created file
 */
export function createTempFile(filename: string, content: string): string {
    ensureDir(TEMP_DIR);
    const filePath = path.join(TEMP_DIR, filename);
    fs.writeFileSync(filePath, content);
    logger.debug(`Created temp file: ${filePath}`);
    return filePath;
}

/**
 * Creates a temporary file filled with `'x'` characters of the specified byte size.
 *
 * @param {string} filename - Name of the file
 * @param {number} [sizeInBytes=1024] - File size in bytes
 * @returns {string} Path to the created file
 */
export function createRandomFile(filename: string, sizeInBytes: number = 1024): string {
    const content = 'x'.repeat(sizeInBytes);
    return createTempFile(filename, content);
}


/**
 * Reads and returns the entire content of a UTF-8 text file.
 *
 * @param {string} filePath - Path to the file
 * @returns {string} File content
 */
export function readFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
}


/**
 * Reads a JSON file and parses it into the specified type.
 *
 * @template T - Target type of the parsed JSON
 * @param {string} filePath - Path to the JSON file
 * @returns {T} Parsed object
 */
export function readJsonFile<T>(filePath: string): T {
    const content = readFile(filePath);
    return JSON.parse(content) as T;
}


/**
 * Serialises `data` as pretty-printed JSON and writes it to a file,
 * creating the parent directory if necessary.
 *
 * @param {string} filePath - Destination file path
 * @param {unknown} data - Data to serialise
 */
export function writeJsonFile(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    logger.debug(`Wrote JSON file: ${filePath}`);
}

/**
 * Deletes a file if it exists; no-op otherwise.
 *
 * @param {string} filePath - Path to the file
 */
export function deleteFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Deleted file: ${filePath}`);
    }
}

/**
 * Recursively deletes a directory and its contents if it exists.
 *
 * @param {string} dirPath - Path to the directory
 */
export function deleteDir(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true });
        logger.debug(`Deleted directory: ${dirPath}`);
    }
}


/**
 * Checks whether a file exists at the given path.
 *
 * @param {string} filePath - Path to check
 * @returns {boolean} `true` if the file exists
 */
export function fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
}


/**
 * Returns the size of a file in bytes.
 *
 * @param {string} filePath - Path to the file
 * @returns {number} File size in bytes
 */
export function getFileSize(filePath: string): number {
    const stats = fs.statSync(filePath);
    return stats.size;
}
/**
 * Returns the lower-cased file extension (e.g. `'.png'`).
 *
 * @param {string} filePath - Path to the file
 * @returns {string} Extension including the leading dot
 */
export function getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
}

/**
 * Waits for a file download triggered by `triggerAction`, saves it, and returns the path.
 *
 * @param {Page} page - Playwright page
 * @param {() => Promise<void>} triggerAction - Action that initiates the download
 * @param {string} [savePath] - Optional custom save path; defaults to {@link DOWNLOADS_DIR}
 * @returns {Promise<string>} Path to the downloaded file
 */
export async function waitForDownload(
    page: Page,
    triggerAction: () => Promise<void>,
    savePath?: string,
): Promise<string> {
    ensureDir(DOWNLOADS_DIR);
    const downloadPromise = page.waitForEvent('download');
    await triggerAction();
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    const finalPath = savePath || path.join(DOWNLOADS_DIR, filename);
    await download.saveAs(finalPath);
    logger.info(`Downloaded file: ${finalPath}`);

    return finalPath;
}

/**
 * Returns the absolute path to an upload fixture file, throwing if it does not exist.
 *
 * @param {string} filename - Name of the file inside {@link UPLOADS_DIR}
 * @returns {string} Resolved file path
 * @throws {Error} If the file is not found
 */
export function getUploadFilePath(filename: string): string {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Upload file not found: ${filePath}`);
    }
    return filePath;
}


/**
 * Creates a set of sample upload fixture files (`.txt`, `.json`, `.csv`)
 * inside {@link UPLOADS_DIR} for integration testing.
 */
export function createSampleUploadFiles(): void {
    ensureDir(UPLOADS_DIR);

    // Create sample text file
    createTempFile('sample.txt', 'This is a sample text file for upload testing.');

    // Create sample JSON file
    writeJsonFile(path.join(UPLOADS_DIR, 'sample.json'), { test: 'data', value: 123 });

    // Create sample CSV file
    const csvContent = 'name,email,age\nJohn,john@example.com,30\nJane,jane@example.com,25';
    fs.writeFileSync(path.join(UPLOADS_DIR, 'sample.csv'), csvContent);

    logger.info('Created sample upload files');
}


/** Recursively deletes all files in the temporary directory. */
export function cleanupTempFiles(): void {
    deleteDir(TEMP_DIR);
    logger.info('Cleaned up temp files');
}


/** Recursively deletes all files in the downloads directory. */
export function cleanupDownloads(): void {
    deleteDir(DOWNLOADS_DIR);
    logger.info('Cleaned up downloads');
}

export default {
    ensureDir,
    createTempFile,
    createRandomFile,
    readFile,
    readJsonFile,
    writeJsonFile,
    deleteFile,
    deleteDir,
    fileExists,
    getFileSize,
    getFileExtension,
    waitForDownload,
    getUploadFilePath,
    createSampleUploadFiles,
    cleanupTempFiles,
    cleanupDownloads,
};
