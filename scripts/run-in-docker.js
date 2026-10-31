/**
 * Runs the suite inside Microsoft's Playwright image: the same browsers, OS libraries and fonts on every
 * machine and in CI. Only the test command runs in the container; the repo is mounted at /work, so
 * artifacts/ lands on the host as usual. See docs/DOCKER.md.
 *
 * Usage: node scripts/run-in-docker.js <envName> [playwright test args…]
 *        node scripts/run-in-docker.js --pull
 *   e.g. node scripts/run-in-docker.js dev --grep=@Smoke
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function fail(message) {
    console.error(`[docker] ${message}`);
    process.exit(2);
}

// The tag follows the installed @playwright/test, so the image's browsers always match the library.
let version;
try {
    version = require(path.join(ROOT, 'node_modules', '@playwright', 'test', 'package.json')).version;
} catch {
    fail('node_modules is missing: run `npm ci` first (the image tag comes from the installed @playwright/test).');
}
const IMAGE = `mcr.microsoft.com/playwright:v${version}-noble`;

if (spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'ignore' }).status !== 0) {
    fail('Docker is not running. Start Docker Desktop (or the Docker service) and try again.');
}

if (process.argv[2] === '--pull') {
    process.exit(spawnSync('docker', ['pull', IMAGE], { stdio: 'inherit' }).status ?? 1);
}

const [envName = 'dev', ...args] = process.argv.slice(2);

const screenArg = args.find((arg) => ['--headed', '--ui', '--debug'].some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
if (screenArg) fail(`${screenArg} needs a screen, which the container does not have. Use the native script, e.g. \`npm run test:headed\`.`);

const wantsEdge = args.some((arg, i) => arg === '--project=msedge' || (arg === '--project' && args[i + 1] === 'msedge'));

// The variables the suite and its reporters read. Host-specific ones (PATH, HOME, JAVA_HOME, GITHUB_WORKSPACE)
// never cross: the container has its own. `-e NAME` hands over the value without writing it anywhere.
const PASS_ENV =
    /^(TEST_|PW_|E2E_|WEBPET|SCAN_|IMPORT_|UI_FIRST|SEND_|SMTP_|EMAIL_|SLACK_|S3_|RESIDUE_|VIDEO_|WINDOW_|DEVICE_RELAY|OFFICE_|INTERNET_|FIXTURE_|CLEANUP_|REMINDER_|WARMUP_|LOG_|CI_|GITHUB_)|^(CI|ENV|USER_NAME|PASSWORD|BASE_URL|API_URL|APP_URL|PLAYWRIGHT_BASE_URL|MAX_FAILURES|ALLURE|ALLURE_REPORT_URL|CAPTURE|SLOW_MO|WORKERS|RETRY|BRANCH_OVERRIDE|CROSS_BROWSER|FILE_LOG|JSON_LOGS|NOTIFY_SMTP_WRITE|TZ)$/;
const envArgs = Object.keys(process.env)
    .filter((name) => PASS_ENV.test(name) && name !== 'GITHUB_WORKSPACE')
    .flatMap((name) => ['-e', name]);

const linuxHost = process.platform === 'linux';
const dockerArgs = ['run', '--rm', '--init', '--ipc=host', '-v', `${ROOT}:/work`, '-w', '/work', ...envArgs];

if (linuxHost) {
    // CI: reuse the host's Linux node_modules; hand the files the run writes back to the runner's user;
    // the reporters build the Allure HTML in-run, so lend them the host's Java.
    dockerArgs.push('-e', `PTS_OWNER=${process.getuid()}:${process.getgid()}`);
    if (process.env.GITHUB_ACTIONS) dockerArgs.push('-e', 'GITHUB_WORKSPACE=/work');
    if (process.env.JAVA_HOME) dockerArgs.push('-v', `${process.env.JAVA_HOME}:/opt/java:ro`, '-e', 'JAVA_HOME=/opt/java');
} else {
    // Windows/macOS: the host's node_modules hold Windows/macOS binaries, so the container keeps its own in a
    // named volume, reinstalled only when package-lock.json changes.
    dockerArgs.push('-v', 'pts-node-modules:/work/node_modules', '-e', 'PTS_INSTALL=1');
}
if (wantsEdge) dockerArgs.push('-e', 'PTS_EDGE=1');

// `npm install`, not `npm ci`: ci deletes node_modules, which fails on a volume mount point.
const script = [
    'if [ -n "${PTS_INSTALL:-}" ]; then',
    '  lock=$(sha1sum package-lock.json | cut -c1-40)',
    '  if [ "$(cat node_modules/.pts-lock 2>/dev/null)" != "$lock" ]; then',
    '    npm install --no-audit --no-fund && echo "$lock" > node_modules/.pts-lock || exit 1',
    '  fi',
    'fi',
    // Edge is not in the image; installing it needs root, which is why the container runs as root.
    'if [ -n "${PTS_EDGE:-}" ]; then npx playwright install msedge || exit 1; fi',
    'node scripts/run-playwright.js "$@"',
    'rc=$?',
    'if [ -n "${PTS_OWNER:-}" ]; then chown -R "$PTS_OWNER" artifacts .auth 2>/dev/null || true; fi',
    'exit $rc',
].join('\n');

console.log(`[docker] ${IMAGE}: node scripts/run-playwright.js ${[envName, ...args].join(' ')}`);
const result = spawnSync('docker', [...dockerArgs, IMAGE, 'bash', '-c', script, 'bash', envName, ...args], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
