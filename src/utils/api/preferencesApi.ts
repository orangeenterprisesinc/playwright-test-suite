import { expect, type APIRequestContext } from '@playwright/test';

/**
 * The global Preferences record — `GET`/`PUT preferences`. One shared row on a shared
 * environment, so every spec that writes it puts it back.
 *
 * The PUT is partial by design and the GET body is not a valid PUT body: the response carries
 * read-only and derived fields, and echoing it back is rejected `400 invalid_body` (measured on
 * dev 2026-09-16). WEBPET-1592 shipped the guard that makes a partial write safe — omitting a
 * group does not blank it. A key sent as `null` is treated as absent, so a field that was unset
 * before a test cannot be restored to unset; {@link restorePreferences} reports which keys those
 * were rather than letting a caller believe the restore was total.
 *
 * `assignRollsDaily` is refused outright: flipping it false→true with `confirmClearAlternateCodes`
 * clears `AlternateCode` from every Employee row in the tenant, with no Deleted and no RecordType
 * filter (WEBPET-1593), and Journey B's fixtures are built on those codes.
 */

/** The whole record, as `GET` returns it. */
export type PreferencesBody = Record<string, unknown>;
/** A subset of the record, captured so it can be written back. */
export type PreferencesSnapshot = Record<string, unknown>;

/** Exactly the keys A9 writes — the `pieceOutPreferences` restorer snapshots and restores this list. */
export const PIECE_OUT_PREFERENCE_KEYS = [
    'defaultNumberOfTimeCardPieces',
    'maximumNumberOfPieces',
    'minimumNumberOfPieces',
    'stickerPrefix',
    'stickerBarcodeLength',
    'typicalDailyRollUsage',
    'pieceTraceabilityBarcodeFunction',
] as const;

const FORBIDDEN_KEY = 'assignRollsDaily';

export async function getPreferences(request: APIRequestContext): Promise<PreferencesBody> {
    const res = await request.get('preferences');
    expect(res.ok(), `GET preferences failed with ${res.status()}`).toBe(true);
    return (await res.json()) as PreferencesBody;
}

export async function putPreferences(request: APIRequestContext, data: PreferencesBody): Promise<void> {
    if (FORBIDDEN_KEY in data) {
        throw new Error(
            `putPreferences refuses to set '${FORBIDDEN_KEY}': a false→true transition clears ` +
                'AlternateCode from every Employee row (WEBPET-1593) and would destroy the Journey B fixtures.',
        );
    }
    const put = await request.put('preferences', { headers: { 'Content-Type': 'application/json' }, data });
    expect(put.ok(), `PUT preferences failed with ${put.status()}: ${(await put.text()).slice(0, 300)}`).toBe(true);
}

/** The current value of exactly `keys`, for a later {@link restorePreferences}; a missing key captures as null. */
export async function snapshotPreferences(
    request: APIRequestContext,
    keys: readonly string[],
): Promise<PreferencesSnapshot> {
    const body = await getPreferences(request);
    return Object.fromEntries(keys.map((key) => [key, body[key] ?? null]));
}

/**
 * Write a snapshot back. Returns the keys whose original value was `null` and so could not be
 * cleared — the caller surfaces them instead of believing the restore was total.
 *
 * Its own PUT rather than {@link putPreferences}: a restore failure needs its own remediation line.
 */
export async function restorePreferences(
    request: APIRequestContext,
    snapshot: PreferencesSnapshot,
): Promise<string[]> {
    const { confirmClearAlternateCodes: _dropped, [FORBIDDEN_KEY]: _never, ...body } = snapshot;

    const res = await request.put('preferences', {
        data: body,
        headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok()) {
        throw new Error(
            `Restoring preferences failed with ${res.status()}: ${(await res.text()).slice(0, 400)}. ` +
                'Dev staging may be left with test values — check /settings/preferences.',
        );
    }
    return Object.entries(body)
        .filter(([, value]) => value === null)
        .map(([key]) => key);
}
