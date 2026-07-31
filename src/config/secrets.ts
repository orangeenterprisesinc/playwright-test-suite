/**
 * AES-256-GCM encryption for env values stored as `ENC(v1:salt:iv:ct:tag)`.
 * Wired into `getConfigValue()`, so no call site changes; plaintext passes through.
 *
 * Protects secrets AT REST only (screen-share, pasted log, accidental commit).
 * NOT a vault — file + `SECRET_KEY` recovers everything, so the key lives only in
 * the gitignored `.env` and CI secrets. Full rationale:
 * docs/adr/0006-encrypted-env-values.md
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/** Marker wrapping an encrypted value: `ENC(<scheme>:<salt>:<iv>:<ct>:<tag>)`. */
const ENC_OPEN = 'ENC(';
const ENC_CLOSE = ')';

/** Current token scheme. Bump when any crypto parameter below changes. */
const SCHEME = 'v1';

const CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const SALT_BYTES = 16;
/** 96 bits — the IV length GCM is specified for. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** scrypt cost. Node's default; ~50-100ms per derivation, paid once per salt. */
const SCRYPT_COST = 16_384;

const MASTER_KEY_VAR = 'SECRET_KEY';

/** Cached because scrypt is deliberately slow and getConfigValue is called freely. */
const keyCache = new Map<string, Buffer>();
const plainCache = new Map<string, string>();

/**
 * Throws rather than returning the ciphertext — a silent fall-through surfaces as
 * an opaque 401 from the app instead of a config error.
 */
function masterKey(override?: string): string {
    const key = override ?? process.env[MASTER_KEY_VAR];
    if (!key) {
        throw new Error(
            `An ENC(...) value was read but ${MASTER_KEY_VAR} is not set, so it cannot be ` +
                `decrypted. Add ${MASTER_KEY_VAR} to your gitignored .env (generate one with ` +
                `\`npm run secret:keygen\`), or set it as a CI secret.`,
        );
    }
    return key;
}

/** Derives a 32-byte AES key from the master key and a per-value salt. */
function deriveKey(secret: string, salt: Buffer): Buffer {
    const cacheKey = `${createHash('sha256').update(secret).digest('base64')}:${salt.toString('base64')}`;
    const cached = keyCache.get(cacheKey);
    if (cached) return cached;

    const derived = scryptSync(secret, salt, KEY_BYTES, { N: SCRYPT_COST });
    keyCache.set(cacheKey, derived);
    return derived;
}

/** True when a value is an `ENC(...)` token rather than plaintext. */
export function isEncrypted(value: string | undefined): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    return trimmed.startsWith(ENC_OPEN) && trimmed.endsWith(ENC_CLOSE);
}

/** Encrypts a plaintext value into an `ENC(...)` token safe to store in an env file. */
export function encryptValue(plain: string, secret?: string): string {
    const key = masterKey(secret);
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);

    const cipher = createCipheriv(CIPHER, deriveKey(key, salt), iv);
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const parts = [
        SCHEME,
        salt.toString('base64'),
        iv.toString('base64'),
        ciphertext.toString('base64'),
        tag.toString('base64'),
    ];
    return `${ENC_OPEN}${parts.join(':')}${ENC_CLOSE}`;
}

/**
 * Decrypts an `ENC(...)` token produced by {@link encryptValue}.
 *
 * @throws {Error} When the token is malformed, or when the key is wrong or the
 *                 value was tampered with (GCM authentication failure)
 */
export function decryptValue(token: string, secret?: string): string {
    const cached = plainCache.get(token);
    if (cached !== undefined) return cached;

    const key = masterKey(secret);
    const body = token.trim().slice(ENC_OPEN.length, -ENC_CLOSE.length);
    const parts = body.split(':');

    if (parts.length !== 5) {
        throw new Error(
            `Malformed ENC(...) value: expected 5 colon-separated parts, got ${parts.length}. ` +
                `Re-encrypt it with \`npm run secret:encrypt -- "<value>"\`.`,
        );
    }

    const [scheme, saltB64, ivB64, ctB64, tagB64] = parts;
    if (scheme !== SCHEME) {
        throw new Error(
            `Unsupported ENC(...) scheme '${scheme}'; this build understands '${SCHEME}'. ` +
                `Re-encrypt the value with \`npm run secret:encrypt\`.`,
        );
    }

    const tag = Buffer.from(tagB64, 'base64');
    if (tag.length !== TAG_BYTES) {
        throw new Error(`Malformed ENC(...) value: auth tag is ${tag.length} bytes, expected ${TAG_BYTES}.`);
    }

    const decipher = createDecipheriv(CIPHER, deriveKey(key, Buffer.from(saltB64, 'base64')), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(tag);

    let plain: string;
    try {
        plain = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        // GCM authentication failed. Deliberately does not echo the ciphertext.
        throw new Error(
            `Could not decrypt an ENC(...) value: wrong ${MASTER_KEY_VAR}, or the value was ` +
                `altered. Verify with \`npm run secret:decrypt -- "<token>"\`.`,
        );
    }

    plainCache.set(token, plain);
    return plain;
}

/** The hook `getConfigValue()` calls. Plaintext passes through untouched. */
export function decryptIfNeeded(value: string): string {
    return isEncrypted(value) ? decryptValue(value) : value;
}

/** Generates a cryptographically random master key, base64-encoded. */
export function generateMasterKey(bytes = 48): string {
    return randomBytes(bytes).toString('base64');
}
