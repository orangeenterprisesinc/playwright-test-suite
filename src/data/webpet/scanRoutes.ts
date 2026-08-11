/**
 * @fileoverview The Scan Mode route and screen tables (WEBPET-897…913).
 *
 * Shared by `scan-mode.spec.ts` and `scan-mode-gating.spec.ts`, which previously
 * each carried their own copy of the same eleven ungated segments. Two copies of
 * one route list is exactly the kind of duplication that drifts silently: a route
 * renamed in the app fails one spec and leaves the other passing on a stale name.
 *
 * `as const` is load-bearing, not stylistic: it narrows the segments to a literal
 * union, which makes the generated id maps in `src/data/webpet/ids/`
 * **index-checked at compile time**. Without it a renamed segment yields
 * `undefined`, the `testCaseId` annotation is empty, the runner gate silently
 * skips that test, and the run still reports green.
 */

/** One module-gated scan route and the module key that gates it. */
export interface GatedScanRoute {
    /** The `/scan/:segment` route segment. */
    readonly segment: string;
    /** The `auth.ModuleKeys` entry `RequireModule` reads. */
    readonly module: string;
}

/**
 * The module-gated scan routes, from `src/app/router/AppRouter.tsx`.
 *
 * `RequireModule` renders the screen when `modules[module] === true` and otherwise
 * `<Navigate to="/">`. Module entitlement comes from the live session and can
 * resolve to false for every key until the server entitlement data is real
 * (RequireModule.tsx note / SECURITY_MODEL.md §8) — which is why the gated-route
 * assertion is "the gate is wired", not "the screen renders".
 */
export const GATED_SCAN_ROUTES = [
    { segment: 'purchase', module: 'Inventory' },
    { segment: 'usage', module: 'Inventory' },
    { segment: 'physical-count', module: 'Inventory' },
    { segment: 'transfer-from', module: 'Inventory' },
    { segment: 'transfer-to', module: 'Inventory' },
    { segment: 'field-traceability', module: 'Traceability' },
    { segment: 'warehouse-traceability', module: 'Traceability' },
    { segment: 'run-in', module: 'LabelTraceability' },
    { segment: 'run-out', module: 'LabelTraceability' },
    { segment: 'run-piece-count', module: 'LabelTraceability' },
    { segment: 'run-projection', module: 'LabelTraceability' },
    { segment: 'run-tracking', module: 'LabelTraceability' },
    { segment: 'assign-barcode-roll', module: 'LabelTraceability' },
    { segment: 'assign-employee-crew', module: 'LabelTraceability' },
] as const satisfies readonly GatedScanRoute[];

/**
 * The foundation / Time & Crew / Driver segments, which are intentionally ungated.
 *
 * The Pocket-pref, time-card-pref and Driver module keys are not registered in
 * `auth.ModuleKeys` at all (connectivity-section precedent — OPEN_QUESTIONS.md,
 * WEBPET-900 / WEBPET-904), so any authenticated user reaches these. Both scan
 * specs iterate this same list: the gating spec asserts no redirect, and
 * `scan-mode.spec.ts` asserts the screen resolves.
 */
export const UNGATED_SCAN_ROUTES = [
    'time-in',
    'time-out',
    'piece-out',
    'time-card',
    'paid-break',
    'meal',
    'crew-time-in',
    'crew-time-out',
    'crew-piece-out',
    'driver-time-in',
    'driver-time-out',
] as const;

/**
 * Every scan screen key — mirrors `SCAN_SCREEN_KEYS` in
 * `src/features/scan/scanMode.ts` and the `common.nav.scan.items.*` i18n keys.
 * Each renders as a card on the landing grid.
 */
export const ALL_SCAN_SCREEN_KEYS = [
    'timeIn',
    'timeOut',
    'pieceOut',
    'timeCard',
    'paidBreak',
    'meal',
    'crewTimeIn',
    'crewTimeOut',
    'crewPieceOut',
    'fieldTraceability',
    'warehouseTraceability',
    'purchase',
    'usage',
    'physicalCount',
    'transferFrom',
    'transferTo',
    'driverTimeIn',
    'driverTimeOut',
    'assignBarcodeRoll',
    'runIn',
    'runOut',
    'assignEmployeeCrew',
    'runPieceCount',
    'runProjection',
    'runTracking',
    'packHouse',
] as const;

/**
 * Screen key → route segment for every card that has a landing-grid link.
 *
 * Mirrors the `scanScreenSegments` map in `src/features/scan/useScanNavigate.ts`
 * plus the inventory routes (purchase / usage / physical-count / transfer-from /
 * transfer-to), which are gated screens rather than command-navigation targets.
 * `packHouse` is deliberately absent — it is deferred and renders as a dimmed
 * non-navigable card.
 */
export const WIRED_SCAN_SEGMENTS = {
    timeIn: 'time-in',
    timeOut: 'time-out',
    pieceOut: 'piece-out',
    timeCard: 'time-card',
    paidBreak: 'paid-break',
    meal: 'meal',
    crewTimeIn: 'crew-time-in',
    crewTimeOut: 'crew-time-out',
    crewPieceOut: 'crew-piece-out',
    fieldTraceability: 'field-traceability',
    warehouseTraceability: 'warehouse-traceability',
    purchase: 'purchase',
    usage: 'usage',
    physicalCount: 'physical-count',
    transferFrom: 'transfer-from',
    transferTo: 'transfer-to',
    driverTimeIn: 'driver-time-in',
    driverTimeOut: 'driver-time-out',
    assignBarcodeRoll: 'assign-barcode-roll',
    runIn: 'run-in',
    runOut: 'run-out',
    assignEmployeeCrew: 'assign-employee-crew',
    runPieceCount: 'run-piece-count',
    runProjection: 'run-projection',
    runTracking: 'run-tracking',
} as const;

/**
 * Screens excluded from this slice's required surface.
 *
 * `packHouse` is Pack House (WEBPET-907), deferred behind the LAN-reachability
 * block (WEBPET-878). Fingerprint capture (WEBPET-905) and HandPunch import
 * (WEBPET-906) are not navigable scan-entry screens at all, so they have no card
 * and are covered by the three declared-skip tests instead.
 */
export const DEFERRED_SCAN_KEYS = ['packHouse'] as const;
