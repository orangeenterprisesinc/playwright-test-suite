/**
 * @fileoverview The PET Tiger licence modules, as a compile-checked union.
 *
 * These are the toggles on the Program Configuration screen — the canonical
 * names listed in the appendix of the Workflow Catalog. Every runner row declares
 * the modules its workflow needs, and a customer scope declares the modules that
 * customer has enabled; the scope gate skips a test whose modules are not all
 * within scope (see `src/config/scope.ts`).
 *
 * Typing them means a mistyped module in a runner row fails `npm run typecheck`
 * and `npm run runner:check` instead of silently never matching a scope.
 *
 * Keep in step with `src/data/catalog/workflow-catalog.json` → `modules`, which
 * `npm run catalog:import` regenerates from the document.
 */

/** A PET Tiger licence module name, exactly as the appendix spells it. */
export type PetTigerModule =
    | 'Anonymous Workers'
    | 'Batch Processing'
    | 'Bio-Identification'
    | 'Bonus Payment'
    | 'Bulk Data Entry'
    | 'Connectivity'
    | 'Contract Labor'
    | 'Cost Accounting'
    | 'Department'
    | 'Document'
    | 'Driver Tracking'
    | 'Electronic Token'
    | 'Equipment'
    | 'Field Printer'
    | 'Fuel'
    | 'GIS API'
    | 'Grower Billing'
    | 'H2A'
    | 'Harvest'
    | 'Human Resources'
    | 'Inventory'
    | 'Irrigation'
    | 'Load'
    | 'Mapping'
    | 'Measurement'
    | 'Network'
    | 'Non Labor Time Cards'
    | 'Notification'
    | 'Office Attendance'
    | 'Onboarding'
    | 'Paid Sick'
    | 'Paid Vacation'
    | 'Packing'
    | 'Pallet Tracking'
    | 'Picture Verification'
    | 'Piece Payment'
    | 'Piece Removal'
    | 'Real Time'
    | 'Real Time Dashboard'
    | 'Scale'
    | 'Schedule'
    | 'Signature'
    | 'Time Card Questions'
    | 'Time Sheet Entry'
    | 'Traceability - Crew'
    | 'Traceability - Items'
    | 'Traceability - Stickers'
    | 'Training'
    | 'Verification'
    | 'Windows'
    | 'Windows Scanning'
    | 'Work Order'
    | 'Yard Load';

/**
 * `core` is the catalog's shorthand for the base engine with no add-on. A runner
 * row may declare it in place of the three modules it stands for.
 */
export type ModuleRequirement = PetTigerModule | 'core';

/** The modules `core` expands to — the base engine every instance has. */
export const CORE_MODULES: readonly PetTigerModule[] = ['Windows', 'Network', 'Real Time'];

/** Every canonical module name, for runtime validation. */
export const ALL_MODULES: readonly PetTigerModule[] = [
    'Anonymous Workers', 'Batch Processing', 'Bio-Identification', 'Bonus Payment',
    'Bulk Data Entry', 'Connectivity', 'Contract Labor', 'Cost Accounting', 'Department',
    'Document', 'Driver Tracking', 'Electronic Token', 'Equipment', 'Field Printer', 'Fuel',
    'GIS API', 'Grower Billing', 'H2A', 'Harvest', 'Human Resources', 'Inventory',
    'Irrigation', 'Load', 'Mapping', 'Measurement', 'Network', 'Non Labor Time Cards',
    'Notification', 'Office Attendance', 'Onboarding', 'Paid Sick', 'Paid Vacation',
    'Packing', 'Pallet Tracking', 'Picture Verification', 'Piece Payment', 'Piece Removal',
    'Real Time', 'Real Time Dashboard', 'Scale', 'Schedule', 'Signature',
    'Time Card Questions', 'Time Sheet Entry', 'Traceability - Crew', 'Traceability - Items',
    'Traceability - Stickers', 'Training', 'Verification', 'Windows', 'Windows Scanning',
    'Work Order', 'Yard Load',
];

/**
 * Expands a row's module requirements to concrete module names, replacing `core`
 * with the base engine so a scope comparison is apples-to-apples.
 */
export function expandModules(required: readonly string[]): PetTigerModule[] {
    const expanded = new Set<PetTigerModule>();
    for (const module of required) {
        if (module === 'core') {
            for (const base of CORE_MODULES) expanded.add(base);
        } else {
            expanded.add(module as PetTigerModule);
        }
    }
    return [...expanded];
}
