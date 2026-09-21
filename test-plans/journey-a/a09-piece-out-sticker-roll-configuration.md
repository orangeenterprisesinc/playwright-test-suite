# A9 · Piece-out and sticker-roll configuration

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `A9` |
| Journey | `A` — Setup and configuration (office) |
| Segments | `grower`, `perennial-grower`, `pack-house` |
| Modules | `Piece Payment`, `Electronic Token`, `Traceability - Stickers` |
| Surface | `ui` → `tests/web/journey-a-setup/` |
| Demo candidate | no |
| Catalog status | ticketed (`PET-12637`; manual source `WEBPET-1446`, PASSED QA 2026-08-28) |

**Summary** (from the catalog)
> Configure the office-side settings that make field piece capture work: the piece
> method (sticker roll versus badge) and the piece-out preferences that bound each
> scan. The day-start sticker-roll assignment itself is a field action (see B4).

## Catalog steps

**The catalog wording for steps 2 and 3 is wrong, and the shipped dev ticket
`WEBPET-1592` says so explicitly.** This plan follows the dev ticket, not the catalog
text; both corrections are proposed back to `workflow-catalog.json` (Open questions).

| # | Catalog step | What the app actually does | Automatable? |
|---|---|---|---|
| 1 | Enable the piece modules. | Verified live 2026-09-16 on dev: `LabelTraceability` **true**, `ElectronicToken` **true**, `PiecePayment` **false**. `LabelTraceability` gates the Traceability - Stickers section wholesale, so it is asserted truthy. `PiecePayment` is sourced from `PT_MODULES`, which omits it (`PET-12689`) — annotated, never silently skipped, per the `b05` precedent. | yes — module state read and annotated (`A9-003`) |
| 2 | Set piece-out global preferences: default, maximum and minimum pieces per scan. | **Correction (`WEBPET-1592`):** these three are on the **Pocket** section — `defaultNumberOfTimeCardPieces`, `maximumNumberOfPieces`, `minimumNumberOfPieces` — not on Traceability - Stickers. Confirmed live: `defaultNumberOfTimeCardPieces` = 1, the other two **null** on dev. | yes — `A9-001` |
| 3 | Choose the piece method (sticker roll or badge). | **Correction (`WEBPET-1592`):** no such control exists, in web or legacy — swept and confirmed absent. Nearest shipped control is `pieceTraceabilityBarcodeFunction`, which chooses whether the barcode identifies the *employee* or the *piece*. Related, not the same choice. | proxy only — `A9-001` asserts `pieceTraceabilityBarcodeFunction`; true wording needs QA confirmation (Open question) |
| 4 | Confirm piece-eligible jobs exist (payment type piece or time and piece, see A3). | Verified live: `paymentType` `1` = piece (4 jobs) and `3` = timeAndPiece (13 jobs) exist on dev. A3 owns creating them; A9 asserts the precondition holds and fails loudly pointing at A3 if it does not. | yes, as a precondition assertion — `A9-003` |

**Variations**: there is no separate office sticker-range screen — ranges are set by
the day-start assignment in the field (`B4`, already automated); pack-house assigns at
the line. A9's scope is office configuration only, never range assignment.

## Safety constraint (non-negotiable)

`assignRollsDaily` **false to true**, confirmed, clears `AlternateCode` from **every**
Employee row in the tenant — no `Deleted` filter, no `RecordType` filter, by design
(`WEBPET-1593`). Journey B's fixtures are built on those codes
(`src/data/journey-b/fixture.ts`: sticker employees `6005`/`6006`/`6007`,
`B4_PACK_HOUSE_ROLL.alternateCode`, `EmployeeSource: AlternateCode` across B4/B5/B7).

**The spec must never send `confirmClearAlternateCodes: true` and must never write
`assignRollsDaily` at all.** See `A9-R7` for why the guard is not exercisable on dev.

Corollary: because the restore writes only the keys a test changed,
`assignRollsDaily` is never in a restore payload either — `restorePreferences` drops
the key outright.

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `A9-R1` | When File ▸ Administration ▸ Preferences is opened, PET Tiger shall display a "Traceability - Stickers" section. | `A9-001` |
| `A9-R2` | When the Pocket section's Default, Maximum and Minimum Number of Pieces in Piece-Out are saved, PET Tiger shall persist the entered values. | `A9-001` |
| `A9-R3` | When the Traceability - Stickers section's Piece-out Sticker Prefix, Sticker Barcode Length and Average Number of Employee Daily Pieces are saved, PET Tiger shall persist the entered values. | `A9-001` |
| `A9-R4` | When the Preferences screen is reloaded after a save, PET Tiger shall rehydrate both sections with the previously saved values. | `A9-001` |
| `A9-R5` | Where the Traceability - Stickers module is licensed, when Piece-out Traceability Barcode Function is saved, PET Tiger shall persist the selection as its wire value (`No`, `Yes` or `Optional`), not its displayed label. | `A9-001` |
| `A9-R6` | PET Tiger shall accept only values matching `^[0-9]*[dDhH]?$` for Traceability Uniqueness Verification Period, rejecting any other value. | — deliberately not automated: this suite is scoped to the happy path for now. It was implemented and passing as `A9-002` (API accept-set plus a field-routed UI rejection) and removed on request 2026-09-16; recover it from git history rather than rewriting it. |
| `A9-R7` | If `assignRollsDaily` is changed from `false` to `true` without `confirmClearAlternateCodes`, then PET Tiger shall reject the change with `409` and `code: confirm_clear_alternate_codes` and persist nothing. | — not automatable: dev already stores `true`, so the transition cannot be reached without first writing `false`, and restoring `true` afterwards would require the confirm flag that wipes every employee's alternate code. One-way door; recorded as an `environment-gate` annotation in `A9-001` instead. |
| `A9-R8` | PET Tiger shall render Undefined Employee as read-only on the Traceability - Stickers section. | `A9-001` |
| `A9-R9` | When a setup export is generated, PET Tiger shall include at least one job whose exported `PaymentType` is `Piece` or `Time & Piece`, so a field piece-out has a job to bind to. | `A9-001` |
| `A9-R10` | When a setup export is generated for an active pocket-class scan device, PET Tiger shall include the office's Default, Maximum and Minimum Number of Pieces in that device's `Preferen_Records`. | `A9-001` |

`A9-R5` names a module from the catalog entry (`Traceability - Stickers`), and the CSV
row carries it. `A9-R9` deliberately does **not** carry a `Where the Piece Payment
module is licensed` qualifier: dev reports that module false (`PT_MODULES`, PET-12689)
yet piece jobs export anyway, so gating the requirement on it would be untrue to the
behaviour.

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Preferences | `File ▸ Administration ▸ Preferences` (`/settings/preferences`) | `src/pages/admin/PreferencesPage.ts` | to write |
| App shell sidebar | — | `src/pages/shell/LeftNavigationPage.ts` | exists |

**Verified live 2026-09-16 — the screen is NOT tabbed.** It is one scrolling page of
`<section class="scroll-mt-24">` anchors with `<h2>` headings; the left-hand list is a
column of `<button>` elements that scroll to a section. The URL never changes, and
**every field is in the DOM at once**, so no section switching is needed to read or
fill a control. `PreferencesPage` therefore extends `BasePage` (not `SetupScreenPage`)
and addresses fields directly by `#id`.

Control types, read from the live DOM:

| Control | Fields |
|---|---|
| `INPUT[type=number]` | `defaultNumberOfTimeCardPieces`, `maximumNumberOfPieces`, `minimumNumberOfPieces`, `employeeCodeStartLocation`, `rollCodeStartLocation`, `stickerBarcodeLength`, `typicalDailyRollUsage` |
| `INPUT` (text) | `stickerPrefix`, `verifyTraceabilityUniquenessPeriod` |
| `INPUT[type=checkbox]` | `assignRollsDaily` (never written), `piecePutTwoStickers`, `importPieceOutsWithDuplicateStickers`, `checkForDuplicateAssignments`, `pieceOutAllowMultiplePieceCodes` |
| `BUTTON[role=combobox]` | `pieceTraceabilityBarcodeFunction` |
| `INPUT[type=text][readonly]` | `undefinedEmployee` — confirms `A9-R8` |

`pieceTraceabilityBarcodeFunction` is a base-ui Select: it closes behind an inert
backdrop, so the option click must be waited for, never raced.

## Data

- **Scenario file** — `src/data/journey-a/a09-piece-out-sticker-roll-configuration.json`, read at
  runtime by `loadScenario` and validated by `PieceOutConfigCaseSchema`: the values A9 writes, the
  `pieceTraceabilityBarcodeFunction` wire-value/label map, the screen's section and field names,
  and the piece-eligible payment-type labels the export carries.
- **API helper** — `src/utils/api/preferencesApi.ts`: `getPreferences`, `putPreferences` (partial
  write; it refuses `assignRollsDaily`), `snapshotPreferences` and `restorePreferences`. The
  snapshot/restore bracket is declared as a `restore` cleanup step and run by
  `src/utils/cleanup/runCleanup.ts`, not by the spec.
- **Generated values** — none. Preferences is one global record, not a list of
  uniquely-named rows, so A9 writes fixed literals and restores the original body.

**The `pieceTraceabilityBarcodeFunction` value/label inversion is a live trap:**

| Wire value | Displayed label |
|---|---|
| `No` | Identify Employee & Optional |
| `Yes` | Identify Piece & Required |
| `Optional` | Identify Piece & Optional |

**Collision:** `employeeCodeStartLocation` and `rollCodeStartLocation` are written and
restored by `b07-undefined-employee-reconciliation.spec.ts`. A9 **reads and asserts**
them but never writes them, avoiding a concurrent-write race against dev.

## Preconditions

- [ ] Authenticated `su` session (`.auth/user.json`), same as `A1`.
- [ ] `LabelTraceability` licensed on client 1 — verified true 2026-09-16. Asserted at
      run time so the section assertions cannot pass vacuously.
- [ ] At least one job with `paymentType` `1` or `3` — verified (4 and 13 on dev).
      `A9-003` asserts and fails pointing at A3 rather than creating one out of scope.
- [ ] An active scan device on client 1 — verified: 8 active, including `1308`
      "Guka Phone Pocket" (type 0). `A9-003` picks an active device at run time rather
      than hardcoding an id, and annotates an `environment-gate` if none is active.

## Cleanup

A9 creates no persistent setup entity; it mutates the single global Preferences record
and restores it. Every test that writes preferences must:

1. `snapshotPreferences` the exact keys it is about to write.
2. Write only those keys.
3. In `finally`, `restorePreferences` the snapshot — never sending
   `confirmClearAlternateCodes`.

**The PUT is partial, and the GET body is not a valid PUT body.** Echoing the whole
`GET /preferences` response back is rejected `400 invalid_body` (measured 2026-09-16);
the partial write is the supported shape, guaranteed by WEBPET-1592's "a PUT that omits
a group does not blank that group" criterion.

**A `null` write is ignored, so an unset preference cannot be re-unset.** Three keys
(`maximumNumberOfPieces`, `minimumNumberOfPieces`, `typicalDailyRollUsage`) were null on
dev before the first run and now hold 5 / 1 / 7. That is a one-time baseline shift, not
ongoing drift — every later run restores those values exactly. `restorePreferences`
returns the keys it could not clear and the spec surfaces them as a
`shared-state-drift` annotation rather than letting it pass unnoticed.

| Entity | Prefix | Route |
|---|---|---|
| (none created) | — | — |

**Do not** use the `page.route('**/api/preferences*')` rewrite from `tests/webpet/`.
A9's subject is that preferences *save*; rewriting the response makes the spec vacuous.

## Test cases

`src/data/runner/journey-a.csv`:

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `A9-001` | End-to-end: configure the piece-out and sticker-roll preferences, confirm they save, and confirm they reach a scan device setup export | `A9-R1`, `A9-R2`, `A9-R3`, `A9-R4`, `A9-R5`, `A9-R8`, `A9-R9`, `A9-R10` | `regression` | 1 |

**Scope: one end-to-end happy path**, mirroring the manual walkthrough that passed QA
(configure → save → confirm it sticks → confirm the device setup file carries it), the
same single-test shape as `A1-001`. `A9-002` (the uniqueness-period reject case,
`A9-R6`) and `A9-003` (the export, now folded into `A9-001`) were built and then
removed on request 2026-09-16; both ids are left unused so the numbering still matches
git history.

It is `@Regression` only — no `@Smoke`. A9 sits next to a proven destructive
side effect (`WEBPET-1593`), so it stays out of the most frequently run tier even though it never triggers that side effect.

## Open questions for the tester

- [ ] **Catalog step 3 wording.** "Piece method (sticker roll or badge)" matches no
      control in web or legacy (`WEBPET-1592`, swept). Treated here as
      `pieceTraceabilityBarcodeFunction`. Confirm with QA what was meant, then correct
      `workflow-catalog.json` — the catalog is currently wrong.
- [ ] **Catalog step 2 location.** Piece counts are on the **Pocket** section, not
      Traceability - Stickers. `WEBPET-1592` called this "itself a discoverability
      finding". Worth correcting the catalog text too.
- [ ] **`A9-R7` cannot be automated on dev** while `assignRollsDaily` is `true`. To
      cover it, a throwaway tenant (or a dev reset to `false`) is needed. Worth a
      decision: accept the gap, or ask for the preference to be seeded `false` on a
      non-shared environment.
- [ ] **`PET-12637`'s `blocked-by-dev` label is stale** — `WEBPET-1592` and
      `WEBPET-1593` are both Done. Flagging only; no Jira write until instructed.
