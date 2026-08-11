// Install the UiAutomator2 driver into a project-local APPIUM_HOME (./.appium)
// so the harness never depends on (or mutates) a global appium install.
//
// Pinned to 4.x: driver 5.x requires the Appium 3 server, and this repo runs
// Appium 2.
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const appiumHome = join(repoRoot, '.appium');
const appiumBin = join(
    repoRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'appium.cmd' : 'appium',
);
const env = { ...process.env, APPIUM_HOME: appiumHome };
const shell = process.platform === 'win32';

const installed = execFileSync(appiumBin, ['driver', 'list', '--installed', '--json'], {
    env,
    encoding: 'utf-8',
    shell,
});
if (installed.includes('uiautomator2')) {
    console.log('uiautomator2 driver already installed in', appiumHome);
    process.exit(0);
}

console.log('Installing uiautomator2@4.2.3 into', appiumHome);
execFileSync(appiumBin, ['driver', 'install', 'uiautomator2@4.2.3'], {
    env,
    stdio: 'inherit',
    shell,
});
