/**
 * Run tokens — the clock-derived suffix every factory-made name carries — and
 * their decoder. Encoder and decoder live together so the residue sweep can date
 * a record from its name alone: the API exposes no timestamps on list rows.
 *
 * Three shapes exist in the suite (base36 digits of `Date.now()`):
 * - `factory`  `<Prefix>_<RUN_ID><worker>_<seq>` — RUN_ID is the low 5 digits
 *   (wraps every ~16.8 h), pinned per run by global setup through RESIDUE_RUN_ID
 *   so every worker of one run shares it; `worker` is the Playwright worker index.
 * - `six`      `<Prefix><6 digits>` — the equiv specs' shape (wraps every ~25 d).
 * - `uid`      `<Prefix><8+ digits, lowercase>` — `src/data/generated/random.ts`,
 *   the full clock plus a random tail, so its age is exact.
 */
export type TokenStyle = 'factory' | 'six' | 'uid';

const MOD_5 = 36 ** 5;
const MOD_6 = 36 ** 6;

export const WORKER_INDEX: string =
    process.env['TEST_WORKER_INDEX'] ?? process.env['TEST_PARALLEL_INDEX'] ?? '0';

/** Low 5 base36 digits of the clock; global setup pins one value for the whole run. */
export const RUN_ID: string = (
    process.env['RESIDUE_RUN_ID'] ?? Date.now().toString(36).slice(-5)
).toUpperCase();

export const RUN_TOKEN: string = `${RUN_ID}${WORKER_INDEX}`.toUpperCase();

let seq = 0;

/** A run-unique name: unique per worker and across workers, dated by its token. */
export function uniqueName(prefix: string): string {
    seq += 1;
    return `${prefix}_${RUN_TOKEN}_${seq}`;
}

/** The equiv specs' 6-digit token, kept here so encoder and decoder cannot drift. */
export function sixCharRunToken(now = Date.now()): string {
    return now.toString(36).slice(-6).toUpperCase();
}

export interface NameAge {
    decodable: boolean;
    style?: TokenStyle;
    /** Age in ms — modulo the token's wrap period for `factory` and `six`. */
    ageMs?: number;
    /** The 5-digit run id, `factory` style only. */
    runId?: string;
}

/**
 * Date a record from its name. `factory` is searched, not anchored: an employee
 * name is `<lastName>, <firstName>` and `ensureEmployee` may truncate the `_seq`.
 * An undecodable name is reported as such and left to the caller to judge.
 */
export function decodeNameAge(name: string, prefix: string, style: TokenStyle, now = Date.now()): NameAge {
    const rest = name.startsWith(prefix) ? name.slice(prefix.length) : name;
    if (style === 'factory') {
        const match = /_?([0-9A-Z]{5})(\d{1,3})(?:_\d+)?(?=$|,|\s)/.exec(rest.toUpperCase());
        if (!match) return { decodable: false };
        const stamp = parseInt(match[1], 36);
        return { decodable: true, style, runId: match[1], ageMs: ((now % MOD_5) - stamp + MOD_5) % MOD_5 };
    }
    if (style === 'six') {
        const match = /^([0-9A-Z]{6})(?:$|\W)/.exec(rest.toUpperCase());
        if (!match) return { decodable: false };
        const stamp = parseInt(match[1], 36);
        return { decodable: true, style, ageMs: ((now % MOD_6) - stamp + MOD_6) % MOD_6 };
    }
    const match = /^([0-9a-z]{8})[0-9a-z]{0,4}$/.exec(rest);
    if (!match) return { decodable: false };
    return { decodable: true, style, ageMs: Math.max(0, now - parseInt(match[1], 36)) };
}
