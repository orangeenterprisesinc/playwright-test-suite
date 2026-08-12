/**
 * Builds the `OrangeExportFile` envelope a PET Pocket device produces, so a test
 * can drive the real device→office pipeline without an emulator.
 *
 * Ported from AndroidPET's own serializer (`sync/ExportTableItem.kt`,
 * `sync/TimeCardExport.java`) — the formats below are the app's, not ours:
 * `DateIn` yyyy/MM/dd, `TimeIn` HH:mm:ss, `UpdateTime` ISO, CardType as the
 * STRING "TimeIn", and setup records referenced by **Code**, which is what the
 * LookupContents attribute declares to the importer.
 *
 * Two importer rules make this exact rather than approximate:
 *   - a `<Header>` must carry `<Version>1</Version>` or the whole file is
 *     rejected as an incompatible format;
 *   - `DateIn` + `TimeIn` must both be present, or the row fails on a NOT NULL
 *     DateTime. An unresolvable-but-present code fails the record too, so every
 *     value here must exist office-side (see officeFixture).
 *
 * Element order within `<TimeCard>` is a Java HashMap artifact in the app, not a
 * contract — the order below mirrors a captured envelope for fidelity, and
 * nothing asserts on it.
 */

/** No XML prolog: the app's serializer never calls startDocument(). */
const CARD_TYPE_TIME_IN = 'TimeIn';
const LOOKUP_CONTENTS = 'Field:Code|Crew:Code|Employee:Code|Equipment:Code|Ranch:Code|Job:Code';

/** Matches the app version the device reports in the Header text node. */
export const DEVICE_VERSION = '26.01.22';

export interface EnvelopeCard {
    employeeCode: string;
    crewCode: string;
    ranchCode: string;
    fieldCode: string;
    jobCode: string;
    /** "(lat,long)" — optional, as on the device when GPS is off. */
    gps?: string;
}

export interface EnvelopeInput {
    /** The device's own mailbox — lands in `<DeviceWebMail>`. */
    deviceAddress: string;
    cards: EnvelopeCard[];
    /** Reference prefix; a per-run value keeps references unique. */
    prefix: string;
    /** Punch time, defaults to a fixed morning hour so runs are deterministic. */
    at?: Date;
}

export interface BuiltEnvelope {
    xml: string;
    /** One per card, in order — the importer's identity key. */
    references: string[];
}

function esc(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** `yyyy/MM/dd` — the app's dbDateFormatter. */
export function deviceDate(d: Date): string {
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** `HH:mm:ss`. */
export function deviceTime(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `yyyy-MM-ddTHH:mm:ss` — isoDateFormatter, used by UpdateTime and the Header. */
export function deviceIso(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${deviceTime(d)}`;
}

/** `yyMMdd` — the reference's date segment. */
function referenceDate(d: Date): string {
    return `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/**
 * A per-run reference prefix. On a device this is a fixed device id ("DFLT"),
 * but references are the importer's dedupe key: reusing one across runs would
 * make the second import an update of the first run's rows rather than a fresh
 * insert. Base36 of the clock keeps it 4 chars, like a real device prefix.
 */
export function newRunPrefix(now = new Date()): string {
    return Math.floor(now.getTime() / 1000)
        .toString(36)
        .slice(-4)
        .toUpperCase();
}

/**
 * `{seq}-{yyMMdd}-CI-{prefix}-ui`, the app's default NYIPU format with `-`
 * separators. `CI` is the Crew In screen's part id; `ui` the default initials.
 */
export function buildReference(seq: number, at: Date, prefix: string): string {
    return `${pad(seq, 7)}-${referenceDate(at)}-CI-${prefix}-ui`;
}

/** Today at a fixed hour — deterministic, and inside the office's punch day. */
export function punchMoment(hour = 7, minute = 15): Date {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
}

/**
 * One `<TimeCard>` per card, all in a single `TimeCard_Records` block — which is
 * what a crew time-in produces: the app writes TimeCard rows with a `-CI-`
 * reference, never a CrewIn_Records block.
 */
export function buildCrewTimeInEnvelope({
    deviceAddress,
    cards,
    prefix,
    at = punchMoment(),
}: EnvelopeInput): BuiltEnvelope {
    const dateIn = deviceDate(at);
    const timeIn = deviceTime(at);
    const iso = deviceIso(at);
    const references: string[] = [];

    const rows = cards.map((card, i) => {
        const reference = buildReference(i + 1, at, prefix);
        references.push(reference);
        const gps = card.gps ? `<GpsReading>${esc(card.gps)}</GpsReading>` : '';
        return (
            '<TimeCard>' +
            `<Crew>${esc(card.crewCode)}</Crew>` +
            `<Field>${esc(card.fieldCode)}</Field>` +
            `<TimeIn>${timeIn}</TimeIn>` +
            `<Employee>${esc(card.employeeCode)}</Employee>` +
            `<Ranch>${esc(card.ranchCode)}</Ranch>` +
            `<DateIn>${dateIn}</DateIn>` +
            `<CardType>${CARD_TYPE_TIME_IN}</CardType>` +
            gps +
            `<Reference>${reference}</Reference>` +
            `<UpdateTime>${iso}</UpdateTime>` +
            `<Job>${esc(card.jobCode)}</Job>` +
            '<EmployeeSource>Crew</EmployeeSource>' +
            '</TimeCard>'
        );
    });

    const xml =
        '<OrangeExportFile>' +
        `<Header>${DEVICE_VERSION},${iso},Created By Export, Android PET` +
        '<Version>1</Version>' +
        `<DeviceWebMail>${esc(deviceAddress)}</DeviceWebMail>` +
        '</Header>' +
        `<TimeCard_Records LookupContents="${LOOKUP_CONTENTS}">` +
        rows.join('') +
        '</TimeCard_Records>' +
        '</OrangeExportFile>';

    return { xml, references };
}

/** `FromAndroid-{yyMMddHHmmss}-{prefix}.xml`, per OeFileNameBuilder. */
export function exportFileName(prefix: string, at = new Date()): string {
    const stamp =
        `${pad(at.getFullYear() % 100)}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
        `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
    return `FromAndroid-${stamp}-${prefix}.xml`;
}
