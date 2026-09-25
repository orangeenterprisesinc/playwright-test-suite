/**
 * @fileoverview Every kind of record the suites create, with the name prefixes its
 * generated rows carry — the one table behind both per-test cleanup
 * (`cleanup.track`) and the run-start / run-end residue sweep.
 *
 * Adding an entity is one row here: the registry and the sweep derive the list and
 * delete calls from `listPath` + `idKey` (every setup entity shares the same
 * rowversion-guarded DELETE). `order` is the sweep order — children before the
 * parents their FKs point at, or the parent delete 409s.
 *
 * Nothing permanent may match a prefix: the Journey B fixture (`B1 RANCH`,
 * `B1 CREW`, `B5 STICKER SIX`, …), the reused `RestrictedTest` user and the seed rows
 * are guarded by {@link PROTECTED_NAME_PATTERNS}, asserted at module load.
 */
import type { TokenStyle } from '../../../utils/cleanup/runToken';

export interface SweepPrefix {
    prefix: string;
    /** How the clock is encoded after the prefix — see `runToken.ts`. */
    token: TokenStyle;
}

export interface CleanupTarget {
    /** Key used by specs and the registry, e.g. `'crew'`. */
    entity: string;
    /** List/detail path relative to the API root (which already ends in `/api/`). */
    listPath: string;
    /** Primary-key field on list rows, e.g. `crewCounter`. */
    idKey: string;
    /** Display-name field on list rows. */
    nameKey?: string;
    /** Sweep order; lower first. Children before parents. */
    order: number;
    prefixes: readonly SweepPrefix[];
    note?: string;
}

const factory = (prefix: string): SweepPrefix => ({ prefix, token: 'factory' });
const six = (prefix: string): SweepPrefix => ({ prefix, token: 'six' });
const uid = (prefix: string): SweepPrefix => ({ prefix, token: 'uid' });

/** Names that must never be swept, whatever prefix they might one day share. */
export const PROTECTED_NAME_PATTERNS: readonly RegExp[] = [
    /^B\d{1,2} /, // Journey B fixture: B1 RANCH, B5 STICKER SIX, B12 Break …
    /^C\d{1,2} /, // Journey C fixture: C6 CREW, C6 TABLE ONE …
    /^RestrictedTest/, // reused webpet non-SU login
    /^(ADP 5|Crew 01|DFV|Forklift|su|Admin)$/, // seed rows and logins
];

const TARGETS: readonly CleanupTarget[] = [
    {
        entity: 'employee',
        listPath: 'employees',
        idKey: 'employeeCounter',
        order: 10,
        // `Temporary Badge` cannot fit the token in a 20-char last name, so the
        // factory carries it in the first name — hence the `, Test_` in that prefix.
        prefixes: [factory('E2EEmp_'), factory('E2EBadgeGuard_'), factory('E2EReconEmp_'), factory('Temporary Badge, Test_')],
        note: 'soft-delete only (WEBPET-1798); 409 when job cards still reference the employee',
    },
    { entity: 'field', listPath: 'fields', idKey: 'fieldCounter', order: 20, prefixes: [factory('E2EField_'), factory('E2EPickField_')] },
    {
        entity: 'ranch',
        listPath: 'ranches',
        idKey: 'ranchCounter',
        order: 21,
        prefixes: [factory('E2ERanch_'), factory('E2EPickRanch_'), factory('E2ETimeInRanch_')],
    },
    {
        entity: 'variety',
        listPath: 'varieties',
        idKey: 'varietyCounter',
        order: 30,
        prefixes: [factory('E2EVar_'), factory('E2EPickVar_'), six('ZZTEST_VAR_')],
    },
    {
        entity: 'crop',
        listPath: 'crops',
        idKey: 'cropCounter',
        order: 31,
        prefixes: [factory('E2ECrop_'), factory('E2EPickCropV_'), factory('E2EPickCropN_'), factory('E2EVarCrop_')],
    },
    // A table's FK points at its crew (and employees may point at the table), so it sits between them.
    { entity: 'crewTable', listPath: 'crew-tables', idKey: 'crewTableCounter', order: 38, prefixes: [factory('E2ECrewTable_')] },
    { entity: 'crew', listPath: 'crews', idKey: 'crewCounter', order: 40, prefixes: [factory('E2ECrew_')] },
    {
        entity: 'department',
        listPath: 'departments',
        idKey: 'departmentCounter',
        order: 41,
        prefixes: [factory('E2EDept_'), factory('E2EPickDept_')],
    },
    {
        entity: 'job',
        listPath: 'jobs',
        idKey: 'jobCounter',
        order: 50,
        prefixes: [factory('E2EJob_'), factory('E2EJobIdle_'), factory('E2EJobActAs_'), factory('E2EReconJob_')],
    },
    { entity: 'jobGroup', listPath: 'job-groups', idKey: 'jobGroupCounter', order: 51, prefixes: [factory('E2EJG_'), factory('WP2682JG_')] },
    { entity: 'equipment', listPath: 'equipments', idKey: 'equipmentCounter', order: 52, prefixes: [factory('E2EEquip_')] },
    { entity: 'customer', listPath: 'customers', idKey: 'customerCounter', order: 53, prefixes: [factory('E2ECust_')] },
    {
        entity: 'billingCenter',
        listPath: 'billing-centers',
        idKey: 'billingCenterCounter',
        order: 54,
        prefixes: [factory('E2EBillCtr_'), six('_PET213TestBillingCenter_')],
    },
    { entity: 'documentType', listPath: 'document-types', idKey: 'documentTypeCounter', order: 55, prefixes: [factory('E2EDocType_')] },
    { entity: 'board', listPath: 'boards', idKey: 'deviceCounter', order: 56, prefixes: [factory('E2EBoard_')], note: 'boards live in the Device table' },
    // A scoped device's crew/ranch/field assignments point at those rows, so it goes before them (B15).
    { entity: 'scanDevice', listPath: 'scan-devices', idKey: 'deviceCounter', order: 15, prefixes: [six('ZZTEST_SD_')], note: 'Device table' },
    {
        entity: 'validation',
        listPath: 'validations',
        idKey: 'validationCounter',
        order: 58,
        prefixes: [six('_PET202TestValidation_'), six('_PET202TestValidation2_')],
        note: 'soft-delete only (WEBPET-1798)',
    },
    { entity: 'notification', listPath: 'notifications', idKey: 'notificationCounter', order: 59, prefixes: [uid('ZZ NOTIF CHECK ')] },
    { entity: 'user', listPath: 'users', idKey: 'usersCounter', order: 60, prefixes: [uid('QA User '), six('ZZTEST_USR_')] },
];

export const CLEANUP_TARGETS: readonly CleanupTarget[] = [...TARGETS].sort((a, b) => a.order - b.order);

for (const target of CLEANUP_TARGETS) {
    for (const { prefix } of target.prefixes) {
        if (prefix.trim().length < 5) {
            throw new Error(`cleanupTargets: prefix '${prefix}' on ${target.entity} is too short to be safe`);
        }
        if (PROTECTED_NAME_PATTERNS.some((pattern) => pattern.test(prefix))) {
            throw new Error(`cleanupTargets: prefix '${prefix}' on ${target.entity} matches a protected name`);
        }
    }
}

/** Looks up a target by entity key, throwing if it is not registered. */
export function cleanupTarget(entity: string): CleanupTarget {
    const target = CLEANUP_TARGETS.find((t) => t.entity === entity);
    if (!target) {
        const known = CLEANUP_TARGETS.map((t) => t.entity).join(', ');
        throw new Error(`No cleanup target registered for '${entity}'. Known entities: ${known}`);
    }
    return target;
}

export function isProtectedName(name: string): boolean {
    return PROTECTED_NAME_PATTERNS.some((pattern) => pattern.test(name));
}
