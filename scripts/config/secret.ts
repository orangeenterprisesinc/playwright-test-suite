/**
 * Encrypt / decrypt / key-generate CLI for env secrets.
 *
 * Usage:
 *   npm run secret:keygen                       # print a fresh SECRET_KEY
 *   npm run secret:encrypt -- "myPassword"      # print an ENC(...) token
 *   npm run secret:decrypt -- "ENC(v1:...)"     # verify a token round-trips
 *
 * Written in TypeScript and importing src/config/secrets.ts directly, so there is
 * exactly ONE implementation of the crypto — deliberately unlike the Allure
 * scripts, which carry a plain-JS twin of their TS logic and a "keep in sync"
 * comment. Node runs .ts natively via type stripping (Node >=22.18; this repo
 * pins >=20 in engines but the CLI itself needs a Node that strips types, which
 * every supported dev/CI version here does).
 *
 * The npm scripts pass `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON`. Node
 * emits that warning because this file uses ESM syntax while package.json has no
 * `"type"` field, so it reparses as ESM. Adding `"type": "module"` would silence
 * it globally and break every `require()`-based script under scripts/ — so the
 * warning is suppressed for this entry point only.
 *
 * The master key is read from SECRET_KEY. This script loads .env first so the key
 * does not have to be exported into the shell by hand.
 */
import { loadEnvFiles } from '../../src/config/envLoader.ts';
import { decryptValue, encryptValue, generateMasterKey, isEncrypted } from '../../src/config/secrets.ts';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..');

// Populates SECRET_KEY from the gitignored .env. warnOnMissing is off: this CLI
// is often the very first thing run on a fresh checkout, before any env file
// exists, and a keygen must not print a scary warning.
loadEnvFiles({ cwd: ROOT, warnOnMissing: false });

const [command, ...rest] = process.argv.slice(2);
const value = rest.join(' ').trim();

function usage(message?: string): never {
    if (message) console.error(`\n${message}`);
    console.error(`
Usage:
  npm run secret:keygen                    Generate a SECRET_KEY for your .env
  npm run secret:encrypt -- "<value>"      Encrypt a value into an ENC(...) token
  npm run secret:decrypt -- "ENC(v1:...)"  Decrypt a token (to verify it)
`);
    process.exit(message ? 1 : 0);
}

try {
    switch (command) {
        case 'keygen': {
            console.log(generateMasterKey());
            console.error(
                '\nAdd this to your gitignored .env as SECRET_KEY=..., and add the SAME value as a\n' +
                    'CI secret named SECRET_KEY. Never commit it to a tracked file.\n' +
                    'Changing it invalidates every existing ENC(...) value.',
            );
            break;
        }

        case 'encrypt': {
            if (!value) usage('encrypt needs a value: npm run secret:encrypt -- "myPassword"');
            if (isEncrypted(value)) usage('That value is already an ENC(...) token.');
            console.log(encryptValue(value));
            console.error('\nPaste the line above as the value in your .env, e.g. PASSWORD=ENC(...)');
            break;
        }

        case 'decrypt': {
            if (!value) usage('decrypt needs a token: npm run secret:decrypt -- "ENC(v1:...)"');
            if (!isEncrypted(value)) usage('That is not an ENC(...) token — nothing to decrypt.');
            console.log(decryptValue(value));
            break;
        }

        case undefined:
        case '--help':
        case '-h':
            usage();
            break;

        default:
            usage(`Unknown command '${command}'.`);
    }
} catch (error) {
    // Message only: a stack trace here would bury the actionable line, and these
    // errors are all configuration problems rather than bugs.
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
}
