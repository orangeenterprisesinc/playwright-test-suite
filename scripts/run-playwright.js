/**
 * Shim-free Playwright launcher.
 *
 * Windows cmd.exe treats `&` as a command separator, so the .cmd shims in
 * node_modules/.bin (playwright, cross-env, …) break when the repo lives in
 * a path like `D:\R&D\…`. This runner invokes the Playwright CLI through
 * node directly with relative paths, avoiding every shim.
 *
 * Usage: node scripts/run-playwright.js <envName> [playwright test args…]
 *   e.g. node scripts/run-playwright.js local --grep=@Smoke
 *
 * An already-set TEST_ENV always wins (mirrors envLoader precedence).
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const [envName = 'local', ...args] = process.argv.slice(2);
const cli = path.join(__dirname, '..', 'node_modules', '@playwright', 'test', 'cli.js');

// The migrated web-pet projects are conditional in playwright.config.ts
// (see WEBPET_ENABLED). The runner process would detect `--project=webpet`
// on its own argv, but worker processes re-load the config with a different
// argv — exporting WEBPET=1 keeps the project list identical everywhere.
const wantsWebpet = args.some(
    (arg, i) =>
        arg.startsWith('--project=webpet') ||
        (arg === '--project' && (args[i + 1] ?? '').startsWith('webpet')),
);

const result = spawnSync(process.execPath, [cli, 'test', ...args], {
    stdio: 'inherit',
    env: {
        ...process.env,
        TEST_ENV: process.env.TEST_ENV || envName,
        ...(wantsWebpet ? { WEBPET: '1' } : {}),
    },
});

process.exit(result.status === null ? 1 : result.status);
