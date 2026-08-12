/**
 * Deterministic Journey B fixture — no random data. Codes follow the catalog
 * barcode rule (≥4 digits, no leading zero, unique). These records exist on
 * dev staging (discovered-not-recreated by officeFixture) and are the codes
 * the XML import tests reference in their envelopes.
 *
 * B2 (crew move) needs a destination, hence the second field/job.
 */
export const JOURNEY_B_FIXTURE = {
    ranch: { code: '4001', name: 'B1 RANCH' },
    field: { code: '4101', name: 'B1 FIELD' },
    job: { code: '4201', name: 'B1 HARVEST', paymentType: 'Time' },
    // B2 destinations
    field2: { code: '4102', name: 'B2 FIELD EAST' },
    job2: { code: '4202', name: 'B2 PRUNING', paymentType: 'Time' },
    crew: { code: '5001', name: 'B1 CREW' },
    present: [
        { code: '6001', name: 'B1 PRESENT ONE' },
        { code: '6002', name: 'B1 PRESENT TWO' },
        { code: '6003', name: 'B1 PRESENT THREE' },
    ],
    absentee: { code: '6004', name: 'B1 ABSENTEE FOUR' },
} as const;
