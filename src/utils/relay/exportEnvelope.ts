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
 * `{seq}-{yyMMdd}-{part}-{prefix}-ui`, the app's default NYIPU format with `-`
 * separators. `part` is the capture screen's reference part (`CI` Crew In,
 * `TI` Time In, …); `ui` the default initials.
 */
export function buildReference(seq: number, at: Date, prefix: string, part: string = 'CI'): string {
    return `${pad(seq, 7)}-${referenceDate(at)}-${part}-${prefix}-ui`;
}

/** A day at a fixed hour — deterministic, and inside the office's punch day. */
export function punchMoment(hour = 7, minute = 15, date = new Date()): Date {
    const d = new Date(date);
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

/**
 * Every node/tag/attribute name the importer accepts (`importmap/timecard.go`),
 * so specs build and assert envelopes without ever writing a literal XML tag.
 * See the B3 plan's "Planner resolution" for provenance.
 */
export const DEVICE_SCHEMA = {
    nodes: {
        TimeCard: 'TimeCard',
        TimeIn: 'TimeIn',
        TimeOut: 'TimeOut',
        PieceOut: 'PieceOut',
        CrewIn: 'CrewIn',
        CrewOut: 'CrewOut',
        CrewPieceOut: 'CrewPieceOut',
        CrewPiece: 'CrewPiece',
        PieceOutWithTimeIn: 'PieceOutWithTimeIn',
        SignatureCard: 'SignatureCard',
        NonLaborCard: 'NonLaborCard',
        BreakCard: 'BreakCard',
        UnpaidBreakCard: 'UnpaidBreakCard',
        TimeCardQuestion: 'TimeCardQuestion',
        TimeCardEquipment: 'TimeCardEquipment',
    },
    recordsSuffix: '_Records',
    attributes: {
        lookupContents: 'LookupContents',
    },
    tags: {
        reference: 'Reference',
        dateIn: 'DateIn',
        timeIn: 'TimeIn',
        dateOut: 'DateOut',
        timeOut: 'TimeOut',
        pieceOutDate: 'PieceOutDate',
        pieceOutTime: 'PieceOutTime',
        dateTime: 'DateTime',
        cardType: 'CardType',
        employee: 'Employee',
        crew: 'Crew',
        job: 'Job',
        ranch: 'Ranch',
        field: 'Field',
        gpsReading: 'GpsReading',
        traceabilityCode: 'TraceabilityCode',
        updateTime: 'UpdateTime',
        pictureVerification: 'PictureVerification',
        signature: 'Signature',
        memo: 'Memo',
        employeeSource: 'EmployeeSource',
        numOfPieces: 'NumOfPieces',
        breakTime: 'BreakTime',
        variety: 'Variety',
        workOrder: 'WorkOrder',
        agRow: 'AgRow',
        load: 'Load',
        startDate: 'StartDate',
        startTime: 'StartTime',
        endDate: 'EndDate',
        endTime: 'EndTime',
        startDateTime: 'StartDateTime',
        endDateTime: 'EndDateTime',
        length: 'Length',
        isPaidBreak: 'IsPaidBreak',
    },
    employeeSource: {
        crew: 'Crew',
        barcodeBadge: 'BarcodeBadge',
        /** A sticker scan — AndroidPET's `EmployeeScanSourceOptions.AlternateCode`, which the office renders "Sticker Code". */
        alternateCode: 'AlternateCode',
    },
    /** The capture screen a reference identifies, per `importmap/timecard.go`. */
    referenceParts: {
        crewIn: 'CI',
        crewOut: 'CO',
        pieceOut: 'PO',
        timeIn: 'TI',
        timeOut: 'TO',
        signature: 'SC',
        nonLabor: 'NL',
        break: 'BR',
    },
} as const;

export type RecordNode = keyof typeof DEVICE_SCHEMA.nodes;
export type EmployeeSource = (typeof DEVICE_SCHEMA.employeeSource)[keyof typeof DEVICE_SCHEMA.employeeSource];

export interface DeviceRecord extends Partial<EnvelopeCard> {
    node: RecordNode;
    part: string;
    employeeSource?: EmployeeSource;
    at?: Date;
    pieces?: number;
    traceabilityCode?: string;
    reference?: string;
    extra?: Record<string, string>;
}

export interface BuildEnvelopeInput {
    deviceAddress: string;
    prefix: string;
    /** Envelope-level punch time — only feeds the Header; per-record `at` wins for rows. */
    at?: Date;
    records: DeviceRecord[];
}

/**
 * `Employee:Code|Crew:Code|Job:Code|Ranch:Code|Field:Code` — the individual
 * time-in `TimeCard_Records` LookupContents from the B3 plan's Planner
 * resolution (sample fidelity, not derived from {@link LOOKUP_CONTENTS}).
 */
const RECORD_LOOKUP_CONTENTS = 'Employee:Code|Crew:Code|Job:Code|Ranch:Code|Field:Code';

type RowShape = 'punchIn' | 'punchOut' | 'pieceOut' | 'breakShape' | 'aux';

/** Which date/time-tag family a node's row uses — data, not per-node logic. */
const NODE_SHAPE: Record<RecordNode, RowShape> = {
    TimeCard: 'punchIn',
    TimeIn: 'punchIn',
    CrewIn: 'punchIn',
    TimeOut: 'punchOut',
    CrewOut: 'punchOut',
    SignatureCard: 'punchOut',
    NonLaborCard: 'punchOut',
    PieceOut: 'pieceOut',
    CrewPieceOut: 'pieceOut',
    CrewPiece: 'pieceOut',
    PieceOutWithTimeIn: 'pieceOut',
    BreakCard: 'breakShape',
    UnpaidBreakCard: 'breakShape',
    TimeCardQuestion: 'aux',
    TimeCardEquipment: 'aux',
};

function xmlTag(name: string, value: string): string {
    return `<${name}>${esc(value)}</${name}>`;
}

/**
 * One row's element list, in the order the B3 plan's sample gives for
 * TimeCard/TimeIn (`punchIn`): Reference, DateIn, TimeIn, Employee, Crew, Job,
 * Ranch, Field, GpsReading (only when set), TraceabilityCode, UpdateTime,
 * PictureVerification, Signature, Memo, EmployeeSource — no CardType. The other
 * shapes reuse the same skeleton with their own date/time tags, kept simple and
 * data-driven off {@link DEVICE_SCHEMA} rather than guessed per node.
 */
function buildRow(record: DeviceRecord, reference: string, at: Date): string {
    const T = DEVICE_SCHEMA.tags;
    const shape = NODE_SHAPE[record.node];
    const dateStr = deviceDate(at);
    const timeStr = deviceTime(at);
    const isoStr = deviceIso(at);

    const parts: string[] = [xmlTag(T.reference, reference)];

    switch (shape) {
        case 'punchIn':
            parts.push(xmlTag(T.dateIn, dateStr), xmlTag(T.timeIn, timeStr));
            break;
        case 'punchOut':
            parts.push(xmlTag(T.dateOut, dateStr), xmlTag(T.timeOut, timeStr));
            break;
        case 'pieceOut':
            parts.push(xmlTag(T.pieceOutDate, dateStr), xmlTag(T.pieceOutTime, timeStr));
            break;
        case 'breakShape':
            parts.push(
                xmlTag(T.startDate, dateStr),
                xmlTag(T.startTime, timeStr),
                xmlTag(T.endDate, dateStr),
                xmlTag(T.endTime, timeStr),
            );
            break;
        case 'aux':
            parts.push(xmlTag(T.dateTime, isoStr));
            break;
    }

    if (record.employeeCode) parts.push(xmlTag(T.employee, record.employeeCode));
    if (record.crewCode) parts.push(xmlTag(T.crew, record.crewCode));
    if (record.jobCode) parts.push(xmlTag(T.job, record.jobCode));
    if (record.ranchCode) parts.push(xmlTag(T.ranch, record.ranchCode));
    if (record.fieldCode) parts.push(xmlTag(T.field, record.fieldCode));

    if (shape === 'pieceOut' && record.pieces !== undefined) {
        parts.push(xmlTag(T.numOfPieces, String(record.pieces)));
    }
    if (record.gps) parts.push(xmlTag(T.gpsReading, record.gps));

    parts.push(xmlTag(T.traceabilityCode, record.traceabilityCode ?? ''));
    parts.push(xmlTag(T.updateTime, isoStr));

    if (shape !== 'aux') {
        parts.push(xmlTag(T.pictureVerification, ''));
        parts.push(xmlTag(T.signature, ''));
        parts.push(xmlTag(T.memo, ''));
    }
    if (record.employeeSource) parts.push(xmlTag(T.employeeSource, record.employeeSource));

    if (record.extra) {
        for (const [tagName, value] of Object.entries(record.extra)) {
            parts.push(xmlTag(tagName, value));
        }
    }

    const node = DEVICE_SCHEMA.nodes[record.node];
    return `<${node}>${parts.join('')}</${node}>`;
}

/**
 * General-purpose envelope builder, grouping records by node into
 * `<{Node}_Records>` sections. Reference sequence numbers are assigned in
 * document order across the whole `records` array, matching a real device's
 * counter; a record's own `at` overrides the envelope-level `at` for its row
 * and reference date, but the Header timestamp always comes from the latter —
 * identical construction to {@link buildCrewTimeInEnvelope}'s Header.
 */
export function buildEnvelope({
    deviceAddress,
    prefix,
    at: envelopeAt = punchMoment(),
    records,
}: BuildEnvelopeInput): BuiltEnvelope {
    const iso = deviceIso(envelopeAt);
    const references: string[] = [];
    const groups = new Map<RecordNode, string[]>();

    records.forEach((record, i) => {
        const at = record.at ?? envelopeAt;
        const reference = record.reference ?? buildReference(i + 1, at, prefix, record.part);
        references.push(reference);
        const rowsForNode = groups.get(record.node) ?? [];
        rowsForNode.push(buildRow(record, reference, at));
        groups.set(record.node, rowsForNode);
    });

    const sections = [...groups.entries()]
        .map(([node, rows]) => {
            const recordsTag = `${DEVICE_SCHEMA.nodes[node]}${DEVICE_SCHEMA.recordsSuffix}`;
            return (
                `<${recordsTag} ${DEVICE_SCHEMA.attributes.lookupContents}="${RECORD_LOOKUP_CONTENTS}">` +
                rows.join('') +
                `</${recordsTag}>`
            );
        })
        .join('');

    const xml =
        '<OrangeExportFile>' +
        `<Header>${DEVICE_VERSION},${iso},Created By Export, Android PET` +
        '<Version>1</Version>' +
        `<DeviceWebMail>${esc(deviceAddress)}</DeviceWebMail>` +
        '</Header>' +
        sections +
        '</OrangeExportFile>';

    return { xml, references };
}
