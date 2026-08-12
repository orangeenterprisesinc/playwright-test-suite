import type { APIRequestContext } from '@playwright/test';
import { JOURNEY_B_FIXTURE } from '@data/journey-b/fixture';
import {
    ensureCrew,
    ensureEmployee,
    ensureField,
    ensureJob,
    ensureRanch,
    type EnsuredRecord,
} from './setupEntitiesApi';

/**
 * Gives the office the same records — under the same codes — the export
 * envelopes reference, so an import links instead of dangling.
 *
 * Idempotent: each record is looked up by code and created only when missing.
 * Nothing is deleted, so the set becomes a stable QA fixture and reruns are cheap.
 */
export interface OfficeFixture {
    ranch: EnsuredRecord;
    field: EnsuredRecord;
    field2: EnsuredRecord;
    job: EnsuredRecord;
    job2: EnsuredRecord;
    crew: EnsuredRecord;
    /** Keyed by the barcode, e.g. `6001`. */
    employees: Map<string, EnsuredRecord>;
}

export async function seedOfficeFixture(request: APIRequestContext): Promise<OfficeFixture> {
    const F = JOURNEY_B_FIXTURE;

    const ranch = await ensureRanch(request, F.ranch);
    // Fields hang off the ranch, so it has to exist first.
    const field = await ensureField(request, { ...F.field, ranchCounter: ranch.id });
    const field2 = await ensureField(request, { ...F.field2, ranchCounter: ranch.id });
    // Only code and name cross over: the fixture carries PaymentType as text
    // ('Time') while the office API takes a numeric enum, so that value is
    // deliberately not forwarded — ensureJob applies the office default.
    const job = await ensureJob(request, { code: F.job.code, name: F.job.name });
    const job2 = await ensureJob(request, { code: F.job2.code, name: F.job2.name });
    const crew = await ensureCrew(request, F.crew);

    const employees = new Map<string, EnsuredRecord>();
    for (const employee of [...F.present, F.absentee]) {
        employees.set(employee.code, await ensureEmployee(request, employee));
    }

    return { ranch, field, field2, job, job2, crew, employees };
}
