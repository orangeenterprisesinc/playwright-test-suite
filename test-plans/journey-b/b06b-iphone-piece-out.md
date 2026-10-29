# B6b · iPhone piece-out import (PET-12946 regression)

## Application Overview

Planner → Generator handoff for PET-12946 (Highest, client-feedback, WCBF). Source plan: C:\Users\Gukapriyan\.claude\plans\hi-team-i-worked-binary-peach.md §B. Profile: .claude/profiles/JOURNEY.md. ONE spec, ONE happy-path test, ONE runner row (journey-one-happy-path convention; the planner agent's generic "add negative/edge cases" guidance is overridden by the profile). No browser exploration was done: every screen already has a page object.

**Bug:** iOS PET writes a piece-out row with one bare `<DateTime>yyyy-MM-ddTHH:mm:ss</DateTime>`. Android writes `<PieceOutDate>`+`<PieceOutTime>`. The prod importer rejects the iOS shape with "TimeCard: no DateTime could be derived (DateTime is NOT NULL)". The fallback that should handle it is scratch-b3/timecard.go:545-557. The suite only ever sends the Android pair (exportEnvelope.ts:521-522), so that fallback had no coverage.

**Real sample (copy verbatim, never invent):** scratchpad/pet-12946-attachments/kishore-sample-FromIphone-20261028092554981-O04.xml:5-24 (3 rows). The same shape appears in scratch-b3/sample.xml:1118-1137. That 2024 iPhone file also shows that iPhone TimeCard_Records (:5, DateIn/TimeIn) and TimeOut_Records (:1008-1012, DateOut/TimeOut) use the tags our builder already emits. So the iPhone family changes ONLY the PieceOut row.

## Runner-contract conflicts (read first)
1. **Row id `B6b` cannot be a catalog row.** In scripts/runner/check.js:126-131 a row with `workflow` set must have an id matching `^[A-Z]\d{1,2}$` and equal to that workflow. Decision: B6b is a non-catalog row with `workflow` and `journey` left blank, the way system.csv:2-6 does it. check.js:140-142 allows that. coverage:catalog is unchanged, and B6 stays the catalog row.
2. **Describe tag `@B6b` fails SUITE_TAG** (check.js:73 `^@(?:Journey[A-Z]|[A-Z]\d{1,2}|System)$`). Decision: widen it to `[A-Z]\d{1,2}[a-z]?` (one line plus the :72 comment). Fallback if the orchestrator declines: describe tags `['@JourneyB','@B6']` and run B6b by file path.
3. **Playwright `--grep` is a regex, so `@B6` also matches `@B6b`.** The "Android unchanged" run therefore needs `--grep-invert "@B6b"` (see Validation).
4. Scenario `workflow` must match `^B\d{1,2}$` (journeyBScenario.ts:172). Use `"workflow": "B6"` and `"label": "B6b"`. The B9-only check at :362 is unaffected.

## 1 · src/utils/relay/exportEnvelope.ts (device simulation, allowance (c))
- `export type DeviceFamily = 'android' | 'iphone'`. Add `deviceFamily?: DeviceFamily` to `DeviceRecord` (:374-399). An absent value means android.
- New `const IPHONE_PIECE_OUT_ORDER` with the sample's element order, built from `DEVICE_SCHEMA.tags` keys (all already exist at :274-315): updateTime, reference, numOfPieces, variety, workOrder, traceabilityCode, employee, ranch, job, crew, dateTime, memo, field, employeeSource, agRow, gpsReading, load.
- In `buildRow` (:487), before the `parts` skeleton: if `record.deviceFamily === 'iphone' && NODE_SHAPE[record.node] === 'pieceOut'`:
  - Throw unless `record.node === 'PieceOut'`. There is no iPhone sample for CrewPieceOut, CrewPiece or PieceOutWithTimeIn.
  - Otherwise return `buildIphonePieceOutRow(record, reference, at)`. Every element in IPHONE_PIECE_OUT_ORDER is ALWAYS emitted, empty when unset, exactly like the sample. Values: DateTime = UpdateTime = `deviceIso(at)` (:79); NumOfPieces = `String(record.pieces ?? '')`; GpsReading = `record.gps ?? ''`; EmployeeSource = `record.employeeSource ?? ''`. Use `xmlTag` (:475). Append `record.extra` last, as the Android row does. Emit NO PictureVerification, Signature, PieceOutDate or PieceOutTime.
  - Every other node or family keeps today's code path, so Android output stays byte-identical (B5–B8 envelope assertions).
- LookupContents (:606-614): track each section's family. A PieceOut section whose rows are all iphone gets `IPHONE_PIECE_OUT_LOOKUP_CONTENTS = 'Employee:Code|Crew:Code|Job:Code|Ranch:Code|Field:Code|Variety:Code|AgRow:Code'`. A section that mixes families throws (one file comes from one device). All other sections keep `RECORD_LOOKUP_CONTENTS` (:436).
  - Why the longer string: it is what every real iPhone file declares (both samples) and what prod's failing file carried. It also exercises the importer's handling of the present-but-empty `<Variety>`/`<AgRow>` lookups. A test that reproduces prod must send prod's bytes. If that lookup turns red on its own, that is a real-device defect to report, not something to heal away.
- `exportFileName(prefix, at = new Date(), family: DeviceFamily = 'android')` (:239-245). For iphone, emit `FromIphone-{yyyyMMddHHmmssSSS}-{prefix}.xml`, the current iOS name format from Kishore's and WCBF's files. The `-{prefix}.xml` suffix that `isOurLineage` and `isThisAttempt` match on (officeVerification.ts:333-337) is unchanged. Header, `DEVICE_VERSION` and reference minting (`buildReference` :179-181, `-ui` suffix) are unchanged.

## 2 · src/data/schemas/journeyBScenario.ts and journeyBFlow.ts
- Scenario-level `deviceFamily: z.enum(['android','iphone']).optional()` in JourneyBScenarioSchema (:169-298), not per record: one envelope is one device, and per-record JSON would allow files no device can produce.
- In superRefine (:299): if `deviceFamily === 'iphone'`, require `envelope === 'records'` and every record node in {TimeCard, TimeOut, PieceOut}. Otherwise raise the issue "no iPhone sample for <node> — never hand-invent XML".
- ExpectedEnvelopeJsonSchema (:77-112): add `sectionTags: z.record(z.string(), z.array(z.string().min(1))).optional()`. It is the exact ordered list of distinct element names per section, compared against `envelopeView.sectionTags` (journeyBFlow.ts:133-143).
- `expected` (:241-282): add `importLog: z.object({ status, recordsImported, recordsFailed }).strict().optional()`, all `z.string().min(1)`. These are the Internet Import Log cells (ImportLogPage.ts:14-17).
- journeyBFlow.ts:
  - `toDeviceRecords` (:252-271): add `deviceFamily: scenario.deviceFamily`. It already receives `{...scenario, records: subset}`, so the field passes through.
  - `buildRecordsEnvelope` :313: `exportFileName(prefix, undefined, scenario.deviceFamily)`.
  - `mintRun` :209: the same, for consistency.
  - deliverAndVerifyCards already takes `fileName: built[0].envelope.fileName` (:836), so isThisAttempt follows the new name.

## 3 · src/utils/api/officeVerification.ts: a partial file of this attempt is a failure
- `collectFailures` (:275-303): also collect files with `status === 'partial'` whose `message` names a card section. Match `/(\w+)_Records record \d+ \((\w+)\)/g` and check the node against `Object.keys(DEVICE_SCHEMA.nodes)` imported from `@utils/relay/exportEnvelope`.
  - A partial that names only non-card sections (e.g. `Employee_Records`, the code-history or biometric parent) is not a failure. Annotate it `this-attempt-file-partial-non-card` with the message.
  - Reason for the scoping: B4 and B5 also send the Employee_Records grid through this path (relay-ui), and the PayPeriod 515 in the B7 plan :49-55 can make their files partial on dev.
- `deliverAndVerifyCards` (:548-563): the "rows pre-existing" tolerance stays for `failed` files only. Any this-attempt partial with card rejections fails unconditionally after the card read: `expect(partials, "this attempt's file imported partially: <file>: <message>").toHaveLength(0)`. The message already carries "N imported, M failed: PieceOut_Records record N …".
- **B7 is untouched.** It uses transport relay-internet / verification none, which goes through `pullFromRelayInternetUi` (journeyBFlow.ts:778-820) and never calls collectFailures. Its PayPeriod partial stays covered by its own `importStatus` and `product-defect` annotation (b07 json :209-217). No scope or annotation change is needed.
- Single-folder already fails on a non-`completed` run (:257).

## 4 · B6 fidelity wording (Android only)
- b06-badge-piece-out.spec.ts:32: change the message to `'Android fidelity (AndroidPET PieceOutRecord.java): PieceOut carries PieceOutDate+PieceOutTime, no CardType; the iPhone <DateTime> shape is B6b'`.
- test-plans/journey-b/b06-badge-piece-out.md:104-106: replace "shows the same node" with "shows a DIFFERENT row (one bare `<DateTime>` ISO tag, no PieceOutDate/PieceOutTime, sample element order, the longer LookupContents). B6 covers Android only; the iPhone shape is B6b (PET-12946)."
- No assertion changes.

## 5 · New files
- **src/data/journey-b/b06b-iphone-piece-out.json**, modelled on B6's json and B8's mixed sections (b08 json :21-41):
  - Top level: `workflow "B6"`, `label "B6b"`, `deviceFamily "iphone"`, `dayOffset -22` (free: B uses 0..-10 and -17, D/E use -11..-21), `envelope records`, `transport relay-ui`, `verification cards`, `cardType null`, `modules [PiecePayment]` as B6, `extraEmployees [{6005, "B5 STICKER FIVE"}]` as B6.
  - _notes: provenance (sample path, PET-12946), and "owns (-22, crew 5001)".
  - records, all `crewCode 5001`:
    - 0: TimeCard, part TI, BarcodeBadge 6005, ranch 4001, field 4101, job 4201, 07:00.
    - 1–2: PieceOut, part PO, BarcodeBadge 6005, ranch 4001, field 4101, job 4201, pieces 1, at 09:25 and 09:40. Ranch and Field are carried as in the sample.
    - 3: TimeOut, part TO, BarcodeBadge 6005, 11:00.
  - expected.envelope:
    - `sections` `["TimeCard","PieceOut","TimeOut"]`; `referenceParts` `["TI","PO","PO","TO"]`; `pieceCounts {"1":2}`; `employeeSources {"BarcodeBadge":4}`.
    - `sectionTags.PieceOut = ["PieceOut","UpdateTime","Reference","NumOfPieces","Variety","WorkOrder","TraceabilityCode","Employee","Ranch","Job","Crew","DateTime","Memo","Field","EmployeeSource","AgRow","GpsReading","Load"]`.
    - `absentInSection.PieceOut = ["PieceOutDate","PieceOutTime","PictureVerification","Signature","CardType"]`.
    - `sectionLookups`: PieceOut takes the longer string; TimeCard and TimeOut take `Employee:Code|Crew:Code|Job:Code|Ranch:Code|Field:Code`.
  - expected.cards:
    - r0: Time In, cardType 1, field 4101, job 4201.
    - r1 and r2: Piece Out, cardType 0, pieces 1, employeeSourceText "Barcode Badge", field 4101, job 4201.
    - r3: Time Out, cardType 0.
  - `expected.importLog {status "completed", recordsImported "4", recordsFailed "0"}`.
  - cleanup: `[{kind timeCards, employeeCodes ["6005"], dayOffset -22, cardTypes [0,1]}]`, mirroring b06 json :84-96. The day sweep also removes any WEBPET-1409 synthesized Time In.
- **tests/web/journey-b-field/b06b-iphone-piece-out.spec.ts**: see the test steps below. Header doc names PET-12946, the data file and this plan. Imports only `@fixtures/base.fixture`, the schema, `loadScenario` and journeyBFlow (`runJourneyBScenario`, `assertImportedRows`, `cardOf`, `displayedStamp`, `recordStamp`, `importLogRowFor`). No inline literals except testCaseId, tags, titles and expect messages.
- **src/data/runner/journey-b.csv**, row after B6:
  `B6b,,,workflow,iphonePieceOut,iPhone piece-out import,"Deliver the piece-out export iOS PET produces (one bare DateTime tag per row, PET-12946) with a Time In and Time Out, import it on Connectivity > Import > Internet, and verify the file imports with zero failed records and every card shows the sent time on Transfer to Job Cards.",grower|perennial-grower,Piece Payment,regression,0,PET-12946,automated,1`
  Then run `npm run runner:sync` and `npm run runner:check`.

## API allowances (all via existing flow code, none new)
| Call | Endpoint | Allowance | Proof on screen |
|---|---|---|---|
| module gate | `GET session/me` modules (PiecePayment, annotate only) | plumbing read | — |
| fixture lookup | `GET ranches/fields/crews/jobs/employees` (seedOfficeFixture) | plumbing read | Transfer grid names |
| 6005 missing/binned | `POST employees` / `POST employees/{id}/restore` (setupEntitiesApi.ts) | arrange | — |
| before sweep | `GET time-cards` → `DELETE time-cards/{id}` (6005, day -22) | cleanup | — |
| envelope push | relay `UploadFile` | device | — |
| import Trigger | on screen (Connectivity ▸ Import ▸ Internet) | — (UI) | Import Log row |
| import run poll | `GET` import run (waitForImportFiles) | plumbing read | Import Log Status / Records failed |
| reference poll | `GET time-cards?from&to` (ids for cleanup) | plumbing read | `assertImportedRows` |
| grid load | `POST transfer-to-job-cards/analyze` (non-committing) | plumbing read | Transfer grid |
| teardown | `DELETE time-cards/{id}` | cleanup | — |

## Validation
1. `npm run typecheck`, `npm run lint`, `npm run runner:sync`, `npm run runner:check`.
2. `npm run test:dev -- --grep "@B5|@B6|@B8" --grep-invert "@B6b"`: Android unchanged; the B5/B6/B8 envelope assertions must still pass.
3. `UI_FIRST_GUARD=enforce npm run test:dev -- --grep "@B6b"`.

**Expected B6b result on dev.** Probably not the PASS the source plan predicts. "0 declines on env:dev" most likely means no iPhone piece-out ever reached dev's importer: only WCBF sends them, and our suite never did. Dev usually runs main ahead of prod v37/v38, so a regression in main would reproduce on dev.
- **If B6b fails** with "no DateTime could be derived" via the new partial check or Import Log `recordsFailed 2`: the spec is correct and is the PET-12946 reproduction. Keep the row `status automated` but set `enabled=0` with `jira=PET-12946`, like D8. Re-enable when dev ships the fix. Do NOT heal.
- **If B6b passes:** dev's importer handles `<DateTime>`, so dev ≠ prod build. Report that as a finding.
- **Any other red** (e.g. the empty Variety/AgRow lookups): Healer triage. Never trim the sample's shape to go green.

## Test Scenarios

### 1. B6b · iPhone piece-out import (@JourneyB @B6b)

**Seed:** `tests/seed.spec.ts`

#### 1.1. Deliver an iPhone piece-out export and verify every row imports with the sent time

**File:** `tests/web/journey-b-field/b06b-iphone-piece-out.spec.ts`

**Steps:**
  1. Declare describe 'B6b · iPhone piece-out' with tag ['@JourneyB','@B6b'] and a test with tag ['@Regression'] and annotation testCaseId 'B6b'. Load the scenario with loadScenario(JourneyBScenarioSchema, testInfo) and run runJourneyBScenario(scenario, { sessionApi, pages, testInfo }). The flow ensures 6005 exists, sweeps 6005's day -22, builds the iPhone envelope, pushes it through the relay and imports it on screen at Connectivity ▸ Import ▸ Internet (B6 spec :20-21 pattern).
    - expect: run.send.success is true (message: relay rejected the export)
    - expect: The flow's import step does not throw: no this-attempt file is failed or partial with a card-section rejection (the new officeVerification rule)
  2. Assert the envelope against expected.envelope (B6 spec :25-34 and B8 absentInSection pattern).
    - expect: run.envelope.sections equals ['TimeCard','PieceOut','TimeOut'] and referenceParts equals ['TI','PO','PO','TO']
    - expect: run.envelope.sectionTags.PieceOut equals expected.envelope.sectionTags.PieceOut exactly: the sample's element order, including DateTime
    - expect: For each tag in expected.envelope.absentInSection.PieceOut (PieceOutDate, PieceOutTime, PictureVerification, Signature, CardType), sectionTags.PieceOut does not contain it (message: 'iPhone fidelity: a PieceOut row carries one bare DateTime, never the Android PieceOutDate/PieceOutTime pair')
    - expect: run.envelope.sectionLookups equals expected.envelope.sectionLookups; pieceCounts and employeeSources equal expected
    - expect: run.envelope.references has length 4
  3. Call assertImportedRows(pages, run). It opens Transfer to Job Cards scoped to crew 5001 on day -22 and reads each card's row by reference.
    - expect: run.cards has length 4
    - expect: Every row shows the expected Employee, Crew, Ranch, Field, Job and Type ('Time In', 'Piece Out', 'Piece Out', 'Time Out')
    - expect: Both Piece Out rows show Pieces 1 and Employee Selection 'Barcode Badge', and are not manually edited
  4. For each record index 0..3, take cardOf(run, i) and compare displayedStamp(card.row) with recordStamp(run, i).slice(0, 16) (b11 spec :57 pattern).
    - expect: The Date/Time each piece-out row shows equals the DateTime sent (09:25 and 09:40 on day -22). This proves the office derived the NOT NULL DateTime from the bare <DateTime> tag
    - expect: The Time In shows 07:00 and the Time Out shows 11:00
  5. Read the Internet Import Log row for this file with importLogRowFor(pages, run.deliveries[0]) (b07 spec :88-95 pattern; filter Source Webmail plus the FromIphone file name).
    - expect: log.status.toLowerCase() equals expected.importLog.status ('completed')
    - expect: log.recordsImported equals '4' and log.recordsFailed equals '0' (message includes JSON of the row). This is the on-screen proof that no record was declined (PET-12946)
  6. Teardown runs through the scenario cleanup step (timeCards: 6005, day -22, card types 0 and 1). The flow registers it, so it survives a test timeout.
    - expect: No B6b time cards remain on day -22 for 6005
