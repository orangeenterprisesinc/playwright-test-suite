/**
 * @fileoverview Filesystem anchors for the migrated web-pet suite.
 *
 * Every path the suite touches, resolved once from the repo root rather than
 * from each consumer's own `__dirname`. Before this module the same locations
 * were recomputed in seven places with three different relative depths
 * (`join(__dirname, '.auth', …)` in the fixture and `data-scoping`,
 * `join(__dirname, '..', '.auth', …)` in the three `equiv/` specs and
 * `provision.ts`), so moving any file silently broke a subset of them — and the
 * failure mode is a *skip*, not an error, because `restrictedAuthAvailable` is
 * an `existsSync` check.
 *
 * The auth directory deliberately stays at `tests/webpet/.auth/`: it is written
 * by the `webpet-setup` project and read by the specs, and relocating it while
 * the fixture also moves would change two variables at once. `.gitignore`'s
 * unanchored `.auth/` rule covers it either way.
 *
 * @module config/webpetPaths
 */
import path from 'node:path';

/** Repository root — this file lives at `<root>/src/config/`. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** `tests/webpet` — the anchor for the suite's structural runner keys. */
export const WEBPET_TESTS_ROOT = path.join(REPO_ROOT, 'tests', 'webpet');

/**
 * Auth state captured by `webpet-setup`. Gitignored; deleting the directory and
 * re-running the setup project is the documented fix for stale credentials.
 */
export const WEBPET_AUTH_DIR = path.join(WEBPET_TESTS_ROOT, '.auth');

/** Admin (`su`) storage state — cookies + CSRF token. */
export const WEBPET_ADMIN_STORAGE = path.join(WEBPET_AUTH_DIR, 'storage.json');

/**
 * Storage state for the crew-scoped `RestrictedTest_*` user. Provisioning is
 * best-effort, so this file may legitimately not exist — callers gate on
 * {@link WEBPET_RESTRICTED_META} / an `existsSync` check rather than assuming it.
 */
export const WEBPET_RESTRICTED_STORAGE = path.join(WEBPET_AUTH_DIR, 'storage-restricted.json');

/** Side-channel metadata for the restricted user (carries its assigned crew id). */
export const WEBPET_RESTRICTED_META = path.join(WEBPET_AUTH_DIR, 'restricted-meta.json');

/** The one binary fixture: the PDF uploaded by `employee-documents.spec.ts`. */
export const WEBPET_SAMPLE_PDF = path.join(WEBPET_TESTS_ROOT, 'fixtures', 'sample.pdf');

/** Idempotent DelLlano seed, applied once per DB refresh. */
export const WEBPET_SEED_SQL = path.join(WEBPET_TESTS_ROOT, 'seed', 'delllano-e2e-seed.sql');

/** Run-control data. The CSV is authored; the JSON is its generated mirror. */
export const WEBPET_DATA_DIR = path.join(REPO_ROOT, 'src', 'data', 'webpet');
export const WEBPET_RUNNER_CSV = path.join(WEBPET_DATA_DIR, 'webpetRunnerManager.csv');
export const WEBPET_RUNNER_JSON = path.join(WEBPET_DATA_DIR, 'webpetRunnerManager.json');
/** Generated id maps for loop-generated tests, keyed by business key. */
export const WEBPET_IDS_DIR = path.join(WEBPET_DATA_DIR, 'ids');

/**
 * Structural identity of a spec file: its path relative to `tests/webpet`, with
 * posix separators. Pairs with the test's title path to form the runner key
 * that `scripts/webpet/runner-sync.js` writes and the gate reproduces.
 */
export function webpetSpecPath(absoluteFile: string): string {
    return path.relative(WEBPET_TESTS_ROOT, absoluteFile).split(path.sep).join('/');
}
