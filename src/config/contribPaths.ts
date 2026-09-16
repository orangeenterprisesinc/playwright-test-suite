/**
 * @fileoverview Filesystem anchors for the developer-contribution lane.
 *
 * Mirrors `webpetPaths.ts` so the two lanes read the same way. The contrib lane
 * has no auth directory of its own: it borrows the `webpet-setup` project's
 * storage state (`tests/webpet/.auth/`), because a contrib spec drives the same
 * application as the web-pet suite and provisioning a second identical login
 * would only double the setup cost.
 */
import path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Where contributed specs live — flat, one file per ticket. */
export const CONTRIB_TESTS_ROOT = path.join(REPO_ROOT, 'tests', 'contrib');

/** Row source for the lane. Its own directory so the webpet manager stays untouched. */
export const CONTRIB_DATA_DIR = path.join(REPO_ROOT, 'src', 'data', 'contrib');

/** `tests/contrib/WEBPET-123-thing.spec.ts` → `WEBPET-123-thing.spec.ts`. */
export function contribSpecPath(absoluteFile: string): string {
    return path.relative(CONTRIB_TESTS_ROOT, absoluteFile).split(path.sep).join('/');
}
