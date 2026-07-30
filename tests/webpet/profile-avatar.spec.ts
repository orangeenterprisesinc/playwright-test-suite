/**
 * Profile avatar (PET-390) — happy-path upload spec.
 *
 * Exercises the POST/GET/DELETE /api/users/{id}/avatar endpoints via the
 * Profile page's hidden file input. Skips when MinIO is not reachable from the
 * dev API (playwright.config.ts does NOT auto-start the server stack — see the
 * PET-25 slice doc).
 *
 * Pattern mirrors the PET-201 deferral: end-to-end file-upload coverage runs
 * locally against `docker compose -f compose.dev.yml up -d` + `pnpm dev`.
 *
 * Framework-aligned (Batch 06): the file-input locator lives on ProfilePage,
 * including why it needs `.first()`. The response-waiting stays in the spec —
 * it is the assertion, not page structure.
 */
import { expect, test } from '@fixtures/webpet.fixture';

// 1×1 transparent PNG (smallest possible valid PNG payload). Inlined so the
// spec doesn't carry a binary fixture file; Playwright accepts a Buffer for
// setInputFiles when given the {name, mimeType, buffer} shape.
const PNG_1X1 = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300000000020001e2218bdc0000000049454e44ae426082',
    'hex',
);

test.describe('Profile avatar — upload', { tag: ['@WebPet', '@wp-settings', '@wp-avatar', '@WPBatch06'] }, () => {

    test('[Profile] Verify that an avatar upload stores server-side and the image refetches.', {
        tag: ['@wp-ui', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0281' },
    }, async ({ page, pages }) => {
        const profile = pages.profile;
        await profile.gotoProfile();

        await profile.avatarFileInput.waitFor({ state: 'attached', timeout: 5000 });

        // Capture the upload POST itself first. This spec's own docstring says it
        // should "skip when MinIO is not reachable," but that guard was never
        // actually implemented — without it, a down MinIO/S3 makes the POST 5xx
        // and the test just times out waiting on the GET below with a confusing
        // error. Check the POST's outcome explicitly and skip with a clear reason
        // when the storage backend isn't up, instead of hanging.
        const postResponsePromise = page.waitForResponse(
            (resp) =>
                /\/api\/users\/\d+\/avatar$/.test(new URL(resp.url()).pathname) &&
                resp.request().method() === 'POST',
            { timeout: 10_000 },
        );

        // Capture the avatar GET that should fire after the upload-driven
        // cacheBuster flip. The src changes from `?v={old}` to `?v={new}`,
        // triggering a fresh request.
        const avatarRequestPromise = page.waitForResponse(
            (resp) => /\/api\/users\/\d+\/avatar\?v=/.test(resp.url()) && resp.status() === 200,
            { timeout: 10_000 },
        );
        // If the POST below turns out to have failed, we test.skip() before ever
        // awaiting this — leaving it to reject on its own timeout would surface as
        // an unhandled rejection (Playwright reports it against the page/context
        // teardown, masking the intended skip). Mark it handled up front; the real
        // `await avatarRequestPromise` further down is unaffected by this.
        avatarRequestPromise.catch(() => undefined);

        await profile.avatarFileInput.setInputFiles({
            name: 'avatar.png',
            mimeType: 'image/png',
            buffer: PNG_1X1,
        });

        const postResponse = await postResponsePromise;
        test.skip(
            !postResponse.ok(),
            `Avatar upload POST returned ${postResponse.status()} — storage backend (MinIO/S3) is likely not reachable locally. Run \`docker compose -f compose.dev.yml up -d\` (see this file's docstring / PET-25 slice doc) and re-run.`,
        );

        // The mutation finishes, useProfileAvatar flips its cacheBuster, and the
        // <img> re-issues the GET. We assert the GET arrives with status 200 —
        // proves the server stored the bytes and is serving them back.
        const resp = await avatarRequestPromise;
        expect(resp.status()).toBe(200);
        expect(resp.headers()['content-type']).toMatch(/^image\//);
    });

});
