/**
 * Run tokens — the clock-derived suffix every factory-made name carries — and
 * their decoder. Encoder and decoder live together so the residue sweep can date
 * a record from its name alone: the API exposes no timestamps on list rows.
 *
 * Four shapes exist in the suite (base36 digits of `Date.now()` except `readable`):
 * - `factory`  `<Prefix>_<RUN_ID><worker>_<seq>` — RUN_ID is the low 5 digits
 *   (wraps every ~16.8 h), pinned per run by global setup through RESIDUE_RUN_ID
 *   so every worker of one run shares it; `worker` is the Playwright worker index.
 * - `six`      `<Prefix><6 digits>` — the equiv specs' shape (wraps every ~25 d).
 * - `uid`      `<Prefix><8+ digits, lowercase>` — `src/data/generated/random.ts`,
 *   the full clock plus a random tail, so its age is exact.
 * - `readable` `<WF> NEW <NOUN> <MMDD-HHmmss UTC>-W<worker>[-<n>]` — the UTC time the
 *   name was minted, so its age is exact (the year is inferred).
 */
export type TokenStyle = 'factory' | 'six' | 'uid' | 'readable';

const MOD_5 = 36 ** 5;
const MOD_6 = 36 ** 6;
const DAY_MS = 86_400_000;

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

// Groups: 1 = separator, 2..6 = MM DD HH mm ss.
const READABLE_TAIL = String.raw`(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-W\d{1,3}(?:-\d+)?`;

function readableRegex(middle: string): RegExp {
    return new RegExp(String.raw`^[A-Z]\d{1,2}([ -])${middle}\1${READABLE_TAIL}$`);
}

/** Any readable run name, whatever its noun; `NEW` is optional for fields too short to hold it (users, 25). */
export const READABLE_RUN_NAME: RegExp = readableRegex(String.raw`(?:NEW\1)?[A-Z]+(?:\1[A-Z]+)*`);

/** One sweep row's readable name, e.g. stem `NEW CREW` — spaces in the stem match the name's separator. */
export function readableNamePattern(stem: string): RegExp {
    if (!/^[A-Z]+( [A-Z]+)*$/.test(stem)) throw new Error(`readableNamePattern: '${stem}' must be upper-case words`);
    return readableRegex(stem.split(' ').join(String.raw`\1`));
}

const readableSeen = new Map<string, number>();
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * `<owner> NEW <NOUN> <MMDD-HHmmss UTC>-W<worker>`, e.g. `A4 NEW CREW 1029-153245-W1`.
 * `sep` '-' is for names that become a mailbox (no spaces). `-<n>` is appended only when this
 * process mints the very same name again (same second); the seconds keep a cron run and a
 * dispatch that start in one minute apart. `withNew` false drops `NEW` for a field that cannot fit it.
 */
export function readableName(owner: string, noun: string, sep: ' ' | '-' = ' ', now = Date.now(), withNew = true): string {
    if (!/^[A-Z]\d{1,2}$/.test(owner)) throw new Error(`readableName: owner '${owner}' is not a workflow id like 'A4'`);
    if (!/^[A-Z]+( [A-Z]+)*$/.test(noun)) throw new Error(`readableName: noun '${noun}' must be upper-case words`);
    const d = new Date(now);
    const stamp = `${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
    const base = `${[owner, ...(withNew ? ['NEW'] : []), ...noun.split(' '), stamp].join(sep)}-W${WORKER_INDEX}`;
    const count = (readableSeen.get(base) ?? 0) + 1;
    readableSeen.set(base, count);
    return count > 1 ? `${base}-${count}` : base;
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
    if (style === 'readable') {
        const match = READABLE_RUN_NAME.exec(name);
        if (!match) return { decodable: false };
        const [mo, day, h, mi, s] = match.slice(2, 7).map(Number);
        if (mo < 1 || mo > 12 || day < 1 || day > 31 || h > 23 || mi > 59 || s > 59) return { decodable: false };
        const year = new Date(now).getUTCFullYear();
        let stamped = Date.UTC(year, mo - 1, day, h, mi, s);
        // The name carries no year: a stamp that lands in the future belongs to last year (Dec name read in Jan).
        if (stamped > now + DAY_MS) stamped = Date.UTC(year - 1, mo - 1, day, h, mi, s);
        return { decodable: true, style, ageMs: Math.max(0, now - stamped) };
    }
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
