/**
 * Types for the plain-JS leanResults module. It stays JS because
 * scripts/report/allure-generate.js runs from npm/CI with no TypeScript runtime;
 * this file is what lets the TS reporters import it under `noImplicitAny`.
 */

export interface LeanResultsOptions {
    /** Videos larger than this are dropped. Defaults to ALLURE_MAX_VIDEO_MB, else 8. */
    maxVideoMb?: number;
    /** Drop video regardless of size. */
    keepVideo?: boolean;
}

export interface AttachmentFilter {
    isKeptAttachmentFile(name: string): boolean;
    isKeptAttachment(attachment: unknown): boolean;
}

export declare const ATTACHMENT_FILE_PATTERN: RegExp;
export declare const KEPT_ATTACHMENT_EXTS: Set<string>;
export declare const VIDEO_EXTS: Set<string>;
export declare const DEFAULT_MAX_VIDEO_MB: number;

export declare function createFilter(
    options?: LeanResultsOptions & { sourceDir?: string },
): AttachmentFilter;

/** Writes a size-trimmed copy of `sourceDir` into `destDir`. */
export declare function createLeanAllureResults(
    sourceDir: string,
    destDir: string,
    options?: LeanResultsOptions,
): void;

export declare function isAuthSetupResult(data: unknown): boolean;
