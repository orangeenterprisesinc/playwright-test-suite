import { apiUrl } from '@config/webpetEnv';
import { deleteScanDevice } from '../data-factory';
/**
 * Equivalence test: scan-device-create-de15-pocket-pda
 *
 * Scenario: Create a new Scan Device 'DE15' (Pocket PDA) with crews and save.
 * Source:   specs/processed/scan-device-create-de15-pocket-pda-20260609-164335.scenario.yaml
 *
 * testIsolation: substitute — 'DE15' and referencePrefix 'D14' replaced with
 * per-run tokens. 'D14' already exists in the DB ('d14 - MARIA CREW TIME CLOCK').
 * ReferencePrefix column is nvarchar(3) — substitute is 3 chars ('Z' + 2 base-36 digits).
 * ScanDevice_Name_Unique is unfiltered;
 * rows accumulate.
 * Periodic cleanup:  DELETE FROM Device WHERE Name LIKE 'ZZTEST_SD_%'
 *                    DELETE FROM DeviceCrew WHERE NOT EXISTS (
 *                      SELECT 1 FROM Device WHERE Device.DeviceCounter = DeviceCrew.DeviceCounter)
 *
 * Two-step save: General fields (name, deviceType, referencePrefix,
 * connectivityMethod, webMailAddress) are available on the New form.
 * Crew assignment and Preferences (barcodeScannerType, cameraPositionIsBack)
 * are only shown after the first save (Edit form), so a second save is needed.
 *
 * Known gaps vs YAML — fields not exposed in the web form or not in DB:
 *   - ImportAtStart, ExportAtExit: DB columns present, no form field in web app
 *   - UseEmployeesAlternateCode: DB column present, no form field
 *   - ExportTraceabilitySetupRecords (DB: ExportTraceabilitySetup): no form field
 *   - DefaultScanMode (DB: DefaultScreenCode): no form field
 *   - DeviceType "Pocket PDA": no such label in web enum; using iPhone (1) as substitute
 *   - AliasSet "iPhone": no AliasSet with that name in DB; left as null
 *   - Crew "Crew 04": no crew named 'Crew 04' in DB; testing with Crew 02 + Crew 03 only
 *
 * Fields with assert: ignore: DeviceCounter (PK auto-increment), UpdateTime (server timestamp).
 *
 * Framework-aligned (Batch 14): the form's three locating quirks — positional
 * General selects, the `[data-open]` scoping the Edit form needs, and the fact
 * that `networkidle` never settles here — are documented once on
 * `ScanDeviceFormPage` instead of being re-derived at each callsite.
 */
import { expect, test } from '@fixtures/webpet.fixture';

const RUN_TOKEN = Date.now().toString(36).slice(-6).toUpperCase();
const SAFE_NAME = `ZZTEST_SD_${RUN_TOKEN}`;
// ReferencePrefix col is nvarchar(3) — max 3 chars. 'D14' already exists in DB.
// Use last 2 chars of base-36 token for 36^2=1296 combinations (enough for test use).
const SAFE_PREFIX = `Z${RUN_TOKEN.slice(-2)}`;
// webMailAddress is ALSO unique-constrained. The scenario's literal 'DE14@silo'
// was left un-substituted, so the first run took the address and every run since
// got 409 {"code":"unique","field":"webMailAddress"} — the create never landed
// and the test timed out on waitForURL. Substitute it like the other two.
const SAFE_WEBMAIL = `${SAFE_NAME}@silo`;

test.describe('Equivalence: scan-device-create-de15-pocket-pda', { tag: ['@WebPet', '@wp-equiv', '@WPBatch14'] }, () => {

    // The spec used to leak every device it created — cleanup was a manual DB note in the
    // header — and SAFE_PREFIX draws from only 1296 values ('Z' + Date.now() mod 1296),
    // each one permanently consumed by a leaked row on the unfiltered
    // ScanDevice_Name_Unique. deleteScanDevice is best-effort, so cleanup never fails a run.
    let createdDeviceId: number | null = null;

    test.afterAll(async ({ request }) => {
        if (createdDeviceId !== null) await deleteScanDevice(request, createdDeviceId);
    });

    test('[Equiv] Verify that creating a scan device writes the correct DB values.', {
        tag: ['@wp-e2e', '@wp-scan'],
        annotation: { type: 'testCaseId', description: 'WP-0177' },
    }, async ({ page, pages }) => {
        const form = pages.scanDeviceForm;
        test.setTimeout(300_000);

        // ── Step 1: Create — General section only ─────────────────────────────
        await form.gotoNew();

        // Name (substituted)
        await form.nameInput.fill(SAFE_NAME);

        // DeviceType — the SelectTrigger has no id; find by position in section#general.
        // "Pocket PDA" has no exact equivalent; substitute iPhone (1).
        // section#general has exactly 2 Selects: [0]=deviceType, [1]=connectivityMethod.
        await form.generalSelect(0).click();
        await form.selectOption('1').click();

        // ReferencePrefix (substituted — 'D14' already exists in DB)
        await form.referencePrefixInput.fill(SAFE_PREFIX);

        // ConnectivityMethod — "Web" = 4
        await form.generalSelect(1).click();
        await form.selectOption('4').click();

        // WebMailAddress
        await form.webMailAddressInput.fill(SAFE_WEBMAIL);

        // Active defaults true; Supervisor leaveBlank; SyncFolder leaveBlank.
        // Save button in ScanDeviceFormPage uses disabled={isSubmitting} only — no isDirty guard.
        await expect(form.saveButton).toBeEnabled();
        // The id comes from the create response, not the post-save URL: dev's save
        // double-fires and the redirect is unreliable, which is what made this step hang
        // for 60s naming nothing. Save two already waits on its PUT for the same reason.
        const deviceId = await form.saveNewAndReturnId();
        createdDeviceId = deviceId;
        await page.goto(`/setup/scan-devices/${String(deviceId)}`);

        // The record route must accept the id the create returned. Same check the old
        // post-save waitForURL made, minus the dependence on a redirect dev does not
        // reliably perform, plus the id equality the old version could not make.
        const match = page.url().match(/\/setup\/scan-devices\/(\d+)/);
        expect(match, 'should be on the new device record').not.toBeNull();
        expect(Number(match![1]), 'record URL should carry the created device id').toBe(deviceId);

        // ── Step 2: Edit — add Preferences + Crews ────────────────────────────
        // Preferences section only renders after the first save (isNew=false + device data loaded).
        // waitForLoadState('networkidle') is unusable here because 4 endpoints return 403 and
        // keep retrying indefinitely. Wait for the section element itself to appear instead.
        await form.preferencesSection.waitFor({ state: 'visible', timeout: 60_000 });

        // barcodeScannerType "Camera" = 2 (Preferences > Hardware & Scan)
        // cameraPositionIsBack "Yes" = true (Preferences > General)
        // Crews: Crew 02 (crewCounter=2), Crew 03 (crewCounter=3)
        // Note: Crew 04 does not exist in this DB by that name; omitted.
        //
        // From here on, option clicks are scoped to the OPEN portal — Base UI keeps
        // closed portals in the DOM for animations, so an unscoped [data-value="X"]
        // would match items from both the open dropdown and any stale closed one that
        // shares the same option value. `choosePreference`/`addCrew` use the scoped
        // matcher; step 1 above deliberately does not, because nothing is stale yet.

        await form.choosePreference('barcodeScannerType', '2');
        await form.choosePreference('cameraPositionIsBack', 'true');

        // Crew assignment — AssignmentTab: pick from Select dropdown, then click "Add".
        // Crew 02 (crewCounter=2), Crew 03 (crewCounter=3)
        await form.scrollToCrewSection();
        await form.addCrew(2);
        await form.addCrew(3);

        await expect(form.saveButton).toBeEnabled({ timeout: 10_000 });
        // Wait on the PUT itself rather than the post-save redirect: this step
        // fires a second, aborted PUT to the same endpoint on dev (a client-side
        // race outside this suite's control), which can leave the redirect to
        // the list page delayed or absent even though the successful PUT already
        // persisted every field this test asserts below.
        const [putResponse] = await Promise.all([
            page.waitForResponse(
                (res) =>
                    res.request().method() === 'PUT' &&
                    res.url().includes(`/api/scan-devices/${deviceId}`) &&
                    res.status() < 400,
                { timeout: 60_000 },
            ),
            form.saveButton.click(),
        ]);
        expect(putResponse.ok()).toBe(true);

        // ── DB assertions via GET /api/scan-devices/:id ────────────────────────
        const res = await page.request.get(apiUrl(`/api/scan-devices/${deviceId}`));
        expect(res.ok()).toBe(true);
        const row = await res.json();

        // General
        expect(row.name).toBe(SAFE_NAME);
        expect(row.active).toBe(true);
        expect(row.deviceType).toBe(1);               // iPhone (substitute for Pocket PDA)
        expect(row.referencePrefix).toBe(SAFE_PREFIX);  // substituted — original was 'D14'
        expect(row.connectivityMethod).toBe(4);        // Web
        expect(row.webMailAddress).toBe(SAFE_WEBMAIL);  // substituted — original was 'DE14@silo'
        expect(row.syncFolder ?? null).toBeNull();     // leaveBlank
        expect(row.supervisorCounter ?? null).toBeNull(); // leaveBlank

        // Include flags — defaults
        expect(row.includeCrew).toBe(true);            // IncludeCrews: Yes (default true)

        // Preferences set in step 2
        expect(row.barcodeScannerType).toBe(2);        // Camera
        expect(row.cameraPositionIsBack).toBe(true);   // Yes

        // Crew assignments (sorted for determinism)
        const assignedCrewIds: number[] = [...(row.crewIds ?? [])].sort((a: number, b: number) => a - b);
        expect(assignedCrewIds).toEqual([2, 3]);       // Crew 02, Crew 03

        // assert: ignore — DeviceCounter (PK), UpdateTime (server timestamp)
        // assert: ignore — AliasSet (no "iPhone" in DB; left null — not asserted)
        // assert: ignore — ImportAtStart, ExportAtExit, UseEmployeesAlternateCode,
        //                  ExportTraceabilitySetup, DefaultScanMode (not in web form)
    });

});
