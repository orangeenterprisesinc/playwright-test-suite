/**
 * @fileoverview GENERATED — do not edit.
 *
 * Runner ids for tests/webpet/scan-mode.spec.ts, keyed by the business key in the
 * `caseKey` column of src/data/webpet/webpetRunnerManager.csv.
 *
 * Regenerate with: npm run webpet:runner:ids
 */
export const scanModeIds = {
    'resolves:crew-piece-out': 'WP-0357',
    'resolves:crew-time-in': 'WP-0355',
    'resolves:crew-time-out': 'WP-0356',
    'resolves:driver-time-in': 'WP-0358',
    'resolves:driver-time-out': 'WP-0359',
    'resolves:meal': 'WP-0354',
    'resolves:paid-break': 'WP-0353',
    'resolves:piece-out': 'WP-0351',
    'resolves:time-card': 'WP-0352',
    'resolves:time-in': 'WP-0349',
    'resolves:time-out': 'WP-0350',
} as const;

/** Every business key this spec addresses. */
export type ScanModeIdsKey = keyof typeof scanModeIds;
