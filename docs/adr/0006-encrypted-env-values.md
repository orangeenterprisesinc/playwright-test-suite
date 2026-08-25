# 0006 — Sensitive env values are stored encrypted as `ENC(...)`

- **Status:** superseded — feature removed 2026-08-25. Sensitive values live in
  plain text in the gitignored `.env` (and in CI secrets). With `SECRET_KEY`
  necessarily stored in the same file as the ciphertext, the at-rest gain was
  marginal, and the extra concept made onboarding a fresh clone harder to
  explain than it was worth. The record below is kept for history.
- **Date:** 2026-07-31

## Context

Credentials sat in plaintext in the gitignored `.env`: the dev-staging `PASSWORD`,
an SMTP app password, and a Slack incoming-webhook URL (which is bearer-equivalent
— anyone holding it can post to the channel). Gitignoring the file keeps them out
of git, but not out of a screen-share, a `cat .env` during pairing, a pasted log,
or an accidental `git add -f`.

Two sibling frameworks in the org already solve this with `crypto-js` AES and a
`SECRET_KEY`, decrypting at each call site
(`util/encrypt-decrypt-util.ts` in the playwright-tutorials project;
`utils/CommonUtils.ts` in PlaywrightWithTypescriptFramework).

## Decision

Any env value may be stored as an `ENC(v1:salt:iv:ciphertext:tag)` token.
`src/config/secrets.ts` provides the crypto and `getConfigValue()` decrypts
transparently, so **no call site changed**.

Three deviations from the sibling frameworks, each deliberate:

1. **`node:crypto` AES-256-GCM + scrypt, not `crypto-js` AES.** No new dependency,
   matching this repo's existing stance (the Slack and ELK reporters use
   `node:https` rather than an SDK). GCM is authenticated, so a tampered token
   fails loudly instead of yielding garbage; scrypt (N=16384) with a per-value
   random salt makes brute-forcing a weak key expensive and stops two identical
   passwords producing identical ciphertext. `crypto-js`'s default is AES-CBC with
   an MD5-based single-iteration KDF and no authentication tag. The cost of
   deviating: ciphertext is not interchangeable with the sibling repos.
2. **Decryption at the accessor, not at call sites.** Every consumer already read
   config through `getConfigValue()`, so one hook covered the whole suite. The
   sibling projects call `decryptData()` in each spec, which means a missed call
   site silently types ciphertext into a form.
3. **Committed files stay credential-free.** Encryption makes it *possible* to
   commit `ENC(...)` credentials in `.env.dev` / `.env.qa` and reduce CI to a
   single `SECRET_KEY` secret. We deliberately did not: ciphertext committed to git
   history cannot be un-published, so a future `SECRET_KEY` leak would expose every
   historical secret, whereas a CI secret can simply be rotated. Real credentials
   continue to come from CI secrets, and the encryption protects the local `.env`.

## Consequences

- Protection is **at rest only**. Anyone with both the file and `SECRET_KEY` can
  read every value. This is not a vault, and the docs say so in those words.
- `SECRET_KEY` must exist wherever an `ENC(...)` value is read. Because no
  committed file carries one, CI needs no new secret today — but the moment
  someone encrypts a value in a tracked file, CI must get `SECRET_KEY` or the run
  fails at config-read time.
- A missing or wrong key **throws** rather than passing the ciphertext through. A
  silent fall-through would surface as an opaque 401 from the application under
  test, which is far harder to diagnose than a configuration error.
- Reading a credential via `process.env` directly now **bypasses decryption**, so
  it is a genuine bug rather than a style inconsistency. Three sites were fixed:
  `tests/auth.setup.ts`, `tests/web/system/login-module.spec.ts`, and
  `src/config/webpetEnv.ts` (which wraps with `decryptIfNeeded` rather than
  adopting `getConfigValue`, to preserve the source repo's own resolution chain
  that ADR 0001 requires to stay byte-identical).
- The scheme is versioned (`v1:`), so the crypto parameters can change later
  without silently misreading old tokens.
- The CLI (`scripts/config/secret.ts`) is TypeScript importing
  `src/config/secrets.ts`, so there is exactly one implementation of the crypto —
  deliberately unlike the Allure scripts, whose plain-JS twins carry a "keep in
  sync" comment. This works because Node runs `.ts` natively via type stripping,
  and is the same technique that would collapse those Allure pairs.

## Revisit when

Secrets need to be shared across more than a couple of people or rotated on a
schedule — at which point a real secret manager (Azure Key Vault, AWS Secrets
Manager, 1Password CLI) replaces this, and `SECRET_KEY` plus `ENC(...)` is dropped
rather than extended.
