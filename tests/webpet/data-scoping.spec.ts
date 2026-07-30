/**
 * Regression coverage for the data-scoping boundary documented in
 * docs/02-migration/plan-data-scoping.md.
 *
 * PET Tiger ships single-tenant per deployment — no CompanyCounter / TenantId
 * column exists on any table. Row-level visibility is per-user via the
 * UserCrew and UserDepartment junction tables, applied today only in
 * ListEmployees and ListCrews. These tests guard those two handlers against
 * regressions in the scoping-helper call path (e.g., a future refactor that
 * nil-derefs LoadUserAllowedCrews when the user has zero assignments).
 *
 * Prereqs — same as every other spec:
 *   cd apps/api && go run .
 *   cd apps/web && pnpm dev
 *
 * PET-441 — the restricted-user scenario below runs end-to-end if the setup
 * project provisioned the RestrictedTest fixture. If it didn't (no crews in
 * seed, POST /api/users failed, etc.), the spec skips cleanly per the
 * test.skip guard.
 *
 * Framework-aligned (Batch 08): **nothing to relocate** — this file drives the
 * API only and contains no locators. The conversion is the import paths, the
 * titles, the tags and the runner annotations. Recorded here so a future reader
 * does not go looking for a page object.
 *
 * The restricted request context is built inline rather than as a fixture role:
 * the suite's `test` is admin-scoped, and swapping mid-test would change what
 * every other assertion in the file sees. A side context is the honest shape.
 */
import { existsSync, readFileSync } from 'fs';
import { WEBPET_RESTRICTED_META, WEBPET_RESTRICTED_STORAGE } from '@config/webpetPaths';
import { API_BASE_URL } from '@config/webpetEnv';
import { expect, test, restrictedAuthAvailable } from '@fixtures/webpet.fixture';
import { request as pwRequest } from '@playwright/test';

interface RestrictedMeta {
    userId: number;
    username: string;
    crewId: number;
}

interface EmployeeRow {
    employeeCounter: number;
    name: string;
    crewCounter?: number | null;
}

interface CrewRow {
    crewCounter: number;
    name: string;
}

function readRestrictedMeta(): RestrictedMeta | null {
    if (!existsSync(WEBPET_RESTRICTED_META)) return null;
    return JSON.parse(readFileSync(WEBPET_RESTRICTED_META, 'utf-8')) as RestrictedMeta;
}

test.describe('Data scoping — SU visibility regression', { tag: ['@WebPet', '@wp-scoping', '@WPBatch08'] }, () => {

    test('[Scoping] Verify that the employees endpoint returns a non-empty array for the seeded admin.', {
        tag: ['@wp-api', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0131' },
    }, async ({ request }) => {
        const res = await request.get('/api/employees');
        expect(res.status()).toBe(200);

        const body = (await res.json()) as Array<{ employeeCounter: number; name: string }>;
        expect(Array.isArray(body)).toBe(true);
        // Admin has zero UserCrew / UserDepartment rows in the seeded dev DB, so
        // the "no filter → all rows visible" branch must return every non-deleted
        // RecordType=0 employee. An empty array here would indicate the handler
        // started filtering SU incorrectly.
        expect(body.length).toBeGreaterThan(0);
        // Shape assertion — catches regressions that strip fields from the
        // employeeSelectSQL projection.
        expect(body[0]).toHaveProperty('employeeCounter');
        expect(body[0]).toHaveProperty('name');
    });

    test('[Scoping] Verify that the crews endpoint returns a non-empty array for the seeded admin.', {
        tag: ['@wp-api', '@wp-smoke'],
        annotation: { type: 'testCaseId', description: 'WP-0132' },
    }, async ({ request }) => {
        const res = await request.get('/api/crews');
        expect(res.status()).toBe(200);

        const body = (await res.json()) as Array<{ crewCounter: number; name: string }>;
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBeGreaterThan(0);
        expect(body[0]).toHaveProperty('crewCounter');
        expect(body[0]).toHaveProperty('name');
    });

});

test.describe('Data scoping — restricted user leakage (PET-441)', { tag: ['@WebPet', '@wp-scoping', '@WPBatch08'] }, () => {
    // The restricted-user fixture is provisioned by the setup project only when
    // POST /api/users + GET /api/crews are both available against the dev DB.
    // When unavailable (CI without DB, missing seed crew, etc.), skip the whole
    // describe block instead of failing — mirrors the MSSQL_USER-gated Go
    // integration test pattern.
    test.skip(
        !restrictedAuthAvailable,
        'RestrictedTest user not provisioned — see support/provision.ts. ' +
            'Skipping data-scoping leakage assertions.',
    );

    test('[Scoping] Verify that a restricted user sees only employees in their allowed crew.', {
        tag: ['@wp-api', '@wp-regression'],
        annotation: { type: 'testCaseId', description: 'WP-0133' },
    }, async ({ request: adminRequest }) => {
        const meta = readRestrictedMeta();
        expect(
            meta,
            'restricted-meta.json must exist when restrictedAuthAvailable is true',
        ).not.toBeNull();
        const assignedCrewId = meta!.crewId;

        // Admin response — full population (no junction rows → no filter).
        const adminRes = await adminRequest.get('/api/employees');
        expect(adminRes.status()).toBe(200);
        const adminEmployees = (await adminRes.json()) as EmployeeRow[];
        expect(adminEmployees.length).toBeGreaterThan(0);

        // Restricted response — a separate request context carrying the restricted
        // storage state. See the file header for why this is not a fixture role.
        const restrictedCtx = await pwRequest.newContext({
            baseURL: API_BASE_URL,
            storageState: WEBPET_RESTRICTED_STORAGE,
        });
        const restrictedRes = await restrictedCtx.get('/api/employees');
        expect(restrictedRes.status()).toBe(200);
        const restrictedEmployees = (await restrictedRes.json()) as EmployeeRow[];

        // Assertion A: restricted list is a strict subset of admin list (or equal
        // if every employee happens to belong to the assigned crew). Subset by id.
        const adminIds = new Set(adminEmployees.map((e) => e.employeeCounter));
        for (const emp of restrictedEmployees) {
            expect(
                adminIds.has(emp.employeeCounter),
                `Restricted user saw employee ${String(emp.employeeCounter)} that admin did not`,
            ).toBe(true);
        }
        expect(restrictedEmployees.length).toBeLessThanOrEqual(adminEmployees.length);

        // Assertion B: every restricted-visible employee has the assigned crew id.
        // Employees with null CrewCounter are excluded by the LoadUserAllowedCrews
        // filter (legacy invariant).
        for (const emp of restrictedEmployees) {
            expect(
                emp.crewCounter,
                `Employee ${String(emp.employeeCounter)} surfaced for restricted user without matching crewCounter`,
            ).toBe(assignedCrewId);
        }

        // Assertion C: restricted /api/crews returns exactly one crew matching the
        // assignment. The crews endpoint is scoped via the same helper.
        const restrictedCrewsRes = await restrictedCtx.get('/api/crews');
        expect(restrictedCrewsRes.status()).toBe(200);
        const restrictedCrews = (await restrictedCrewsRes.json()) as CrewRow[];
        expect(restrictedCrews).toHaveLength(1);
        expect(restrictedCrews[0]?.crewCounter).toBe(assignedCrewId);

        await restrictedCtx.dispose();
    });

});
