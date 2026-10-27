/**
 * Offline proof of `ENC(...)` env values (`src/config/secrets.ts`, ADR 0006).
 *
 * Every credential read goes through `getConfigValue` / `decryptIfNeeded`, so a
 * regression here does not fail loudly where it happens: the ciphertext reaches a
 * login form and surfaces as an "invalid credentials" nobody traces back here.
 *
 * Runs only in the opt-in `tools-unit` project: `npm run test:unit`.
 */
import { test, expect } from '@playwright/test';
import { ConfigProperties, getConfigValue } from '@config/configProperties';
import { decryptIfNeeded, encryptValue, generateMasterKey, isEncrypted } from '@config/secrets';

const KEY = generateMasterKey();
const saved = { PASSWORD: process.env.PASSWORD, SECRET_KEY: process.env.SECRET_KEY };

test.afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
});

test('an ENC(...) value round-trips through getConfigValue', () => {
    process.env.SECRET_KEY = KEY;
    process.env.PASSWORD = encryptValue('s3cret-Pw!');
    expect(isEncrypted(process.env.PASSWORD)).toBe(true);
    expect(getConfigValue(ConfigProperties.PASSWORD)).toBe('s3cret-Pw!');
});

test('plaintext passes through untouched, with or without a key', () => {
    delete process.env.SECRET_KEY;
    expect(decryptIfNeeded('plain')).toBe('plain');
    process.env.PASSWORD = 'plain';
    expect(getConfigValue(ConfigProperties.PASSWORD)).toBe('plain');
});

test('two encryptions of one value differ (per-value salt)', () => {
    process.env.SECRET_KEY = KEY;
    expect(encryptValue('same')).not.toBe(encryptValue('same'));
});

test('a missing or wrong key throws instead of passing ciphertext through', () => {
    process.env.SECRET_KEY = KEY;
    const token = encryptValue('s3cret-Pw!');
    process.env.SECRET_KEY = generateMasterKey();
    expect(() => decryptIfNeeded(token)).toThrow();
    delete process.env.SECRET_KEY;
    expect(() => decryptIfNeeded(token)).toThrow();
});
