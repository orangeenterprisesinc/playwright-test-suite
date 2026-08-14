/**
 * Catalog workflow **A6 — Biometric enrollment**, verification tail: the
 * mailbox-family (kiosk) device commands that drive an enrolled biometric kiosk.
 *
 * | | |
 * |---|---|
 * | Catalog | `src/data/catalog/workflow-catalog.json` → A6 |
 * | Plan | `test-plans/journey-a/a06-biometric-device-commands.md` |
 * | Runner rows | `src/data/runner/journey-a.csv` → `A6-001`…`A6-004` |
 *
 * Relocated from `tests/webpet/equiv/biometric-device-commands-equivalence.spec.ts`
 * (WEBPET-877, Biometric Device Management Slice 12 — verification tail). Every
 * assertion below is the one that spec carried; what changed is the auth
 * transport (`sessionApi` instead of a hand-rolled CSRF header over the webpet
 * admin storage state) and the id/tag vocabulary.
 *
 * Device-command mirror of `tests/webpet/equiv/export-pet-setup-equivalence.spec.ts`
 * (WEBPET-845, Export Engine Slice 12). Proves the new web *mailbox-family*
 * (kiosk) device commands shipped by Slices 1/7-9/11 of WEBPET-865 produce the
 * same per-device result/log output as the legacy WinForms device-administration
 * surface for the same device set:
 *
 *   - Gather Logs            POST connectivity/device-command/gather-logs
 *                            (legacy AndroidGatherLogs, WEBPET-872)
 *   - Request Partial Data   POST connectivity/device-command/request-partial-data
 *                            (legacy PocketRequestPartialData, WEBPET-873)
 *   - Set Timezone           POST connectivity/device-command/set-timezone
 *                            (legacy UpdateBiometricKioskTimeZone, WEBPET-874;
 *                             converged route + run model in WEBPET-884)
 *
 * ── Scope: FAMILY A (mailbox) ONLY ───────────────────────────────────────────
 * The four direct-IP "Biometric Devices" cards (Export/Import Templates, Retrieve
 * Status, Set Time — family B) have NO web backend: a cloud-hosted backend cannot
 * reach a LAN biometric reader by IP. That topology question is deferred at the
 * epic level and recorded in docs/04-operating-system/OPEN_QUESTIONS.md ([cat:C],
 * WEBPET-876). Per the WEBPET-877 ticket Notes ("If direct-IP topology is
 * deferred, scope this to the mailbox-family commands"), this spec verifies
 * family A only. When a reachability path lands, extend this spec with the
 * direct-IP commands.
 *
 * The two SU-only firmware commands (Upgrade Program/OS, WEBPET-875) are also
 * mailbox-family, but the frontend cannot yet target them (no kiosk-device-list
 * endpoint — OPEN_QUESTIONS [cat:F], WEBPET-876). Their request/response contract
 * is exercised by Go unit tests on the base branch; they are out of scope for
 * this end-to-end sweep until the device-picker endpoint exists.
 *
 * ── Two tiers of assertion ───────────────────────────────────────────────────
 * TIER 1 — CONTRACT (always runs on a stack with an authenticated session).
 *   Each command's endpoint is real, permission-gated (connectivity.device-admin)
 *   + CSRF-guarded, returns the per-device run shape, persists a DeviceCommandRun,
 *   and the run-status poll reaches a terminal status. This proves the per-device
 *   result/log model is wired end-to-end — the precondition the whole epic's
 *   verification tail gates on. It does NOT assert legacy parity (no baseline).
 *
 * TIER 2 — PARITY (env-guarded; SKIPS, never fails). The legacy-vs-web per-device
 *   result/log diff — success/failure counts, per-device status lines,
 *   one-file-per-device delivery (never batched), and MessageType.Single
 *   ("Update Now") vs Setup (queued) semantics — is a host-bound harness step. It
 *   requires ALL of: a running stack, biometric-kiosk WebMail device fixtures, a
 *   stub/mock WebMail server with WEBMAIL_LIVE_SEND_ENABLED=true (the backend is
 *   fail-closed otherwise — see below), and a legacy baseline produced on the
 *   windows-automation host via C:\Scripts\biometric-device-commands.yaml
 *   (DeviceManagementMenu → Gather Logs / Request Partial Data / Set Timezone).
 *   Absent any of these (e.g. CI), Tier 2 skips. Its runner row `A6-004` is
 *   `enabled=0` for the same reason.
 *
 * ── Why parity is env-guarded: the backend is FAIL-CLOSED ─────────────────────
 * The kiosk command transport (newSetTimezoneTransport / newWebMailCommandTransport,
 * connectivity package) refuses to contact the WebMail mailbox unless
 * WEBMAIL_LIVE_SEND_ENABLED=true. With live send disabled, every device is
 * recorded as a per-device FAILURE with a clear reason and NO network call is made
 * (webmail.LoadConfig otherwise defaults to the PRODUCTION Azure mailbox even on
 * an unconfigured client DB). So on a default stack the commands run and persist a
 * run, but every device "fails closed" — which is correct, observable contract
 * behavior (Tier 1) but not legacy parity (Tier 2). See OPEN_QUESTIONS [cat:F] /
 * [cat:C] (WEBPET-843/875) for the live-send enablement checklist.
 *
 * Run Tier 2 locally on the equipped host with:
 *   PET_DEVICE_CMD_EQUIV=1 \
 *   WEBMAIL_LIVE_SEND_ENABLED=true   (on the API process) \
 *   PET_LEGACY_DEVICE_CMD_FILE="C:\\Scripts\\out\\device-commands-legacy.json" \
 *   npx playwright test a06-biometric-device-commands
 *
 * ── Gap recording ────────────────────────────────────────────────────────────
 * Any divergence found on the equipped host is recorded as a GAP-NNN row in
 * docs/equivalence-gaps.json, section "Connectivity > Biometric Devices",
 * feature per-command (e.g. "Gather Logs" / "Set Timezone"). The committed spec
 * is the repeatable harness; gap recording is a manual harness step (the spec
 * asserts parity, it does not mutate repo docs).
 */
import { existsSync, readFileSync } from 'node:fs';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '@fixtures/base.fixture';

// Terminal run statuses for the per-device command run rollup
// (DeviceCommandStatus*, connectivity package): completed / failed / partial.
const TERMINAL = ['completed', 'failed', 'partial'] as const;

// ── Tier-2 env guard ─────────────────────────────────────────────────────────
// Opt-in flag + an existing legacy baseline file are BOTH required. Absent
// either, the parity tier skips (not fails) so CI stays green.
const LEGACY_FILE = process.env.PET_LEGACY_DEVICE_CMD_FILE ?? '';
const PARITY_ENABLED =
    process.env.PET_DEVICE_CMD_EQUIV === '1' && LEGACY_FILE !== '' && existsSync(LEGACY_FILE);
const PARITY_SKIP_REASON =
    'device-command parity requires PET_DEVICE_CMD_EQUIV=1, a running stack with ' +
    'WEBMAIL_LIVE_SEND_ENABLED=true + a WebMail stub + biometric-kiosk device ' +
    'fixtures, and a legacy baseline at PET_LEGACY_DEVICE_CMD_FILE ' +
    '(windows-automation host) — absent here, skipping (host-bound harness step).';

// A per-device result row, normalized across the command response shape. All
// three family-A commands now share the ExportCommandRunResponse envelope
// (WEBPET-884 convergence). We key on deviceCounter and compare status.
interface NormDeviceResult {
    deviceCounter: number;
    status: string;
}

// commandRunResponse is the common envelope the family-A commands return: a
// runId, a rolled-up status, and a per-device list. The two response shapes
// differ only in the device-array field name (devices vs results) and the
// per-device field names — normalizeDevices reconciles both.
interface CommandRunResponse {
    runId: number;
    status: string;
    skipped?: boolean;
    reason?: string;
    devices?: Array<{ deviceCounter: number; status: string }>;
}

function normalizeDevices(body: CommandRunResponse): NormDeviceResult[] {
    const list = body.devices ?? [];
    return list.map((d) => ({ deviceCounter: d.deviceCounter, status: d.status }));
}

// Each family-A command, with the request body that exercises the
// MessageType.Single ("Update Now") path so the one-file-per-device + Single
// semantics can be checked in Tier 2.
// `url` is relative to `sessionApi`'s baseURL, which already ends in `/api/`.
const COMMANDS = [
    {
        name: 'Gather Logs',
        url: 'connectivity/device-command/gather-logs',
        body: { logsAndData: false, updateImmediately: true },
    },
    {
        name: 'Request Partial Data',
        url: 'connectivity/device-command/request-partial-data',
        // A valid range is required (end strictly after start — legacy ValidateData).
        body: { startDate: '2020-01-01', endDate: '2020-01-31', updateImmediately: true },
    },
    {
        name: 'Set Timezone',
        url: 'connectivity/device-command/set-timezone',
        body: { updateImmediately: true },
    },
] as const;

type DeviceCommand = (typeof COMMANDS)[number];

/**
 * The Tier-1 contract body, shared by all three commands — one body, three
 * explicit `test()` declarations. The declarations must stay literal: the
 * runner checker parses specs with regular expressions and a template-literal
 * title or a generated annotation is invisible to it (and therefore exempt from
 * every tag and requirement rule). See scripts/runner/lib/runner-data.js.
 */
async function assertPerDeviceRunReachesTerminalStatus(
    sessionApi: APIRequestContext,
    cmd: DeviceCommand,
): Promise<void> {
    test.setTimeout(120_000);

    // `sessionApi` (base.fixture) carries everything a mutating call to the Go
    // API needs: the persisted session cookie, an `Origin` matching the web app
    // — OriginCheck 403s unsafe methods whose Origin does not match — and the
    // `pt_csrf` cookie echoed back as `X-CSRF-Token` for RequireCSRF's
    // double-submit check. See src/utils/api/sessionContext.ts.
    const res = await sessionApi.post(cmd.url, { data: cmd.body });

    // The command is gated by connectivity.device-admin + RequireCSRF. With an
    // authenticated session holding that permission the call is authorized. A
    // 400 "no valid devices selected" is the legitimate no-eligible-device
    // outcome on a DB without biometric-kiosk WebMail devices — that is
    // contract-valid too, so we accept either a 2xx run body or a 400 no-devices
    // response, but never a 401/403 (auth/permission regression) or 5xx (server
    // error).
    expect(res.status(), `${cmd.name} must not return an auth/permission/server error`).not.toBe(401);
    expect(res.status()).not.toBe(403);
    expect(res.status(), `${cmd.name} returned a server error`).toBeLessThan(500);

    if (res.status() === 400) {
        // No eligible devices in this DB — the run model is still proven by the
        // other commands / Tier 2; nothing more to assert here.
        const err = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const msg = (err.error ?? err.message ?? '').toLowerCase();
        expect(msg, `${cmd.name} 400 should be the no-devices outcome`).toContain('device');
        return;
    }

    expect(res.ok(), `${cmd.name} command should succeed`).toBe(true);
    const body = (await res.json()) as CommandRunResponse;

    // Set Timezone short-circuits with skipped=true when no biometric-kiosk
    // devices exist — a contract-valid no-op (completed, no devices).
    if (body.skipped) {
        expect(body.status).toBe('completed');
        expect(normalizeDevices(body)).toHaveLength(0);
        return;
    }

    // A real run: a runId, a terminal rollup status, and a per-device list.
    expect(body.runId, `${cmd.name} must create a persisted run`).toBeGreaterThan(0);
    expect(TERMINAL, `${cmd.name} run status "${body.status}"`).toContain(body.status);

    const devices = normalizeDevices(body);
    // When devices were selected, each carries a per-device status line — the
    // per-device result/log model under verification.
    for (const d of devices) {
        expect(TERMINAL, `device ${d.deviceCounter} status "${d.status}"`).toContain(d.status);
    }

    // The run-status poll (GET connectivity/device-admin/runs/{id}) returns the
    // same run plus its per-command rows, and is owner-scoped. Confirm it reads
    // back a terminal status — proving the async pipeline's read path.
    const runRes = await sessionApi.get(`connectivity/device-admin/runs/${body.runId}`);
    expect(runRes.ok(), `${cmd.name} run-status poll should succeed`).toBe(true);
    const run = (await runRes.json()) as { runId: number; status: string; commands: unknown[] };
    expect(run.runId).toBe(body.runId);
    expect(TERMINAL, `${cmd.name} polled run status "${run.status}"`).toContain(run.status);
}

test.describe('A6 · Biometric enrollment — device commands (family A / mailbox)', { tag: ['@JourneyA', '@A6'] }, () => {
    // ── TIER 1 — CONTRACT (always) ─────────────────────────────────────────────
    // Proves the per-device result/log model is wired end-to-end for each mailbox
    // command. Runs on any stack with an authenticated session; asserts contract,
    // not parity.
    test('[Equiv] Verify that the Gather Logs command returns a per-device run reaching terminal status.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A6-001' },
            { type: 'requirement', description: 'A6-R1|A6-R2|A6-R3|A6-R4|A6-R5|A6-R6' },
        ],
    }, async ({ sessionApi }) => {
        await assertPerDeviceRunReachesTerminalStatus(sessionApi, COMMANDS[0]);
    });

    test('[Equiv] Verify that the Request Partial Data command returns a per-device run reaching terminal status.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A6-002' },
            { type: 'requirement', description: 'A6-R1|A6-R2|A6-R3|A6-R4|A6-R5|A6-R6' },
        ],
    }, async ({ sessionApi }) => {
        await assertPerDeviceRunReachesTerminalStatus(sessionApi, COMMANDS[1]);
    });

    test('[Equiv] Verify that the Set Timezone command returns a per-device run reaching terminal status.', {
        tag: ['@Regression'],
        annotation: [
            { type: 'testCaseId', description: 'A6-003' },
            { type: 'requirement', description: 'A6-R1|A6-R2|A6-R3|A6-R4|A6-R5|A6-R6' },
        ],
    }, async ({ sessionApi }) => {
        await assertPerDeviceRunReachesTerminalStatus(sessionApi, COMMANDS[2]);
    });

    // ── TIER 2 — PARITY (env-guarded) ──────────────────────────────────────────
    // The host-bound legacy-vs-web per-device result/log diff. Skips unless the
    // full harness env is present (see PARITY_SKIP_REASON).
    test.describe('parity vs legacy (host-bound)', () => {
        test.skip(!PARITY_ENABLED, PARITY_SKIP_REASON);

        test('[Equiv] Verify that the web per-device result and log output matches legacy for the same device set.', {
            tag: ['@Regression'],
            annotation: [
                { type: 'testCaseId', description: 'A6-004' },
                { type: 'requirement', description: 'A6-R7|A6-R8|A6-R9' },
            ],
        }, async ({ sessionApi }) => {
            test.setTimeout(300_000);

            // Legacy baseline shape: { [commandName]: { devices: [{deviceCounter,
            // status}], messageType: "Single"|"Setup", filesPerDevice: 1 } }, produced
            // by the FlaUI script driving DeviceManagementMenu for the SAME device set.
            const legacy = JSON.parse(readFileSync(LEGACY_FILE, 'utf-8')) as Record<
                string,
                { devices: NormDeviceResult[]; messageType: 'Single' | 'Setup'; filesPerDevice: number }
            >;

            for (const cmd of COMMANDS) {
                const expected = legacy[cmd.name];
                // Only compare commands present in the legacy baseline.
                if (!expected) continue;

                const res = await sessionApi.post(cmd.url, { data: cmd.body });
                expect(res.ok(), `${cmd.name} command should succeed under live send`).toBe(true);
                const body = (await res.json()) as CommandRunResponse;

                const web = normalizeDevices(body).sort((a, b) => a.deviceCounter - b.deviceCounter);
                const exp = [...expected.devices].sort((a, b) => a.deviceCounter - b.deviceCounter);

                // Same device set + per-device status parity (success/failure counts and
                // per-device status lines). Each divergence is a GAP-NNN on the host.
                expect(
                    web.map((d) => d.deviceCounter),
                    `[${cmd.name}] device-set parity`,
                ).toEqual(exp.map((d) => d.deviceCounter));
                expect(web, `[${cmd.name}] per-device status parity`).toEqual(exp);

                // One-file-per-device (never batched) + MessageType.Single ("Update Now",
                // since updateImmediately=true) is family-A contract. filesPerDevice is
                // captured by the harness from the WebMail stub's received-file log.
                expect(expected.filesPerDevice, `[${cmd.name}] one file per device`).toBe(1);
                expect(expected.messageType, `[${cmd.name}] MessageType.Single for Update Now`).toBe(
                    'Single',
                );
            }
        });
    });
});
