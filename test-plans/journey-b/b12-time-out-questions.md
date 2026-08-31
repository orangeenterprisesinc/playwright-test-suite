# `B12` · Time-out questions to notification

> **Transport, not simulation — happy path only (user decision 2026-08-27).** One test that
> mirrors Amy's recording step by step. No negative cases, no variations. The
> `/annotations-to-script` "4–5 failure/edge rows" rule is **suspended** for this workflow;
> anything the frames and the email screenshot did not settle is listed under
> *Not established / out of scope* rather than turned into a second scenario. The one
> deliberate **unexpected answer** in Amy's flow is part of the happy path, not a negative case.
>
> **Two findings from source reshape this workflow before a line is written.** Both are
> established read-only, quoting file and line, and neither is a guess:
>
> 1. **Nothing flags during import.** `DetectAndFlagClockOutAnswers` (WEBPET-1081) and
>    `sendClockOutFlagNotifications` (WEBPET-1082) are called from **exactly two files** —
>    `input/time_in.go` and `input/time_out.go`, i.e. `POST`/`PUT /api/time-cards/time-out`.
>    Repo-wide, `TimeCardQuestionFlag` appears in **no** file under `connectivity/`. An XML
>    import therefore writes the `TimeCardQuestion` answer rows and creates **no flag, sends
>    no email, and leaves nothing to acknowledge**. The ticket's step 2 ("flagged during
>    import") describes the legacy product, not web-pet.
> 2. **The email in the screenshot was not sent by web-pet.** Its phrases `has responded`
>    and `Yours Faithfully` exist **nowhere** in the web-pet repository. It is the **legacy
>    real-time service**'s message (`EmployerAttentionNotify`,
>    `PetTiger/EmployeeTrack/Data/TimeCard/TimeCardImport.cs:1577-1596`, which
>    `clockout_flag_notify.go`'s own doc comment names as the thing it ports) — matching the
>    catalog's wording, *"The **real-time service** emails the designated notification user."*
>    Amy's LAN box runs web-pet's **UI** (the screens are unmistakably web-pet) with the
>    legacy service alongside it on the same database.
>
> **Consequence:** the screenshot's strings are manual evidence that the workflow passes in
> the legacy stack. They are **not** valid assertion targets against web-pet, and this plan
> does not use them as such. web-pet's own wording is recorded below for the record.

## Scope decisions (human, 2026-08-27)

1. **`B12-R10` is a named gate, not an assertion** (Option A, Planner-recommended). The test
   asserts `B12-R3`–`R9` and names both halves of R10 in annotations: the detector is
   unreachable from `connectivity/`, and the email has no observable channel. The transcribed
   screenshot below is the manual evidence. Rationale that decided it: when the product
   follow-up lands (flag-on-import), R10 becomes assertable through **the same import this
   test already performs** — an assertion is added and nothing is unwound. Forcing the flag
   today via a post-import `PUT /time-cards/time-out/{id}` was considered and rejected: it is
   a step the recording never shows, it still cannot assert R10's email half, and a
   re-submitting `PUT` adds rowversion/normalisation flake to a `demo=1` test.
2. **No standalone `SignatureCard` row.** The frames show the signature on the *Time Out* card,
   not as a separate CardType-2 record (see `B12-R7`). The envelope therefore carries
   **6 card records** — 3 `TimeCard`/`TI` morning time-ins and 3 `TimeOut`/`TO` clock-outs,
   the latter each carrying `<Signature>` — plus **9 `TimeCardQuestion` grid rows**, which are
   not cards and mint no reference. Same card count as B11. A latent bug found while
   establishing this is recorded but deliberately **not fixed**, since no spec uses the node:
   `NODE_SHAPE.SignatureCard` is `'punchOut'` (emitting `DateOut`/`TimeOut`) while the importer's
   SignatureCard arm reads only `DateIn`/`TimeIn` (`importmap/timecard.go:438-441`), and
   `DateTime` is NOT NULL — so a `SignatureCard` built today would be rejected. Whoever
   automates a workflow that needs it must flip that entry to `'punchIn'` first.
3. **Held to the `B1`–`B11` assertion pattern — no extra coverage.** Those six specs carry
   2–6 requirements each, every one a field-equality assertion on an imported card. Two rows
   drafted earlier were therefore **dropped**: a "the created question echoes its
   `requiredResponse`" row (that tests the questions CRUD — journey A's `A7`/`A14` territory,
   not B12) and a "the conforming worker's card holds no flag" row (vacuously true while
   nothing flags on import at all, so it would have passed for the wrong reason). If detector
   coverage is wanted, it belongs in a separate, honestly-titled office-API spec.

## First dev run (2026-08-28)

Three runs, each red for a different and instructive reason; the third proved the workflow's core.

1. A bug in this suite's own `ensureQuestion` (the create response does not echo
   `allowedResponses`, so `unexpectedAnswer` saw an empty list). Fixed in
   `src/utils/api/questionsApi.ts`.
2. `import-run` **370** came back `status: completed` with
   `message: "1 section(s) skipped"` and **zero failures** — the whole
   `TimeCardQuestion_Records` section was `StatusSkippedGated`
   (`connectivity/import_engine.go:253-264`). **Root cause:** the WEBPET-1413 import
   module gate reads **TigerMaster `vw_ActiveClientModules`** translated to *legacy wire
   names*, and `PT_MODULES` is *"deliberately not consulted: it carries the 20 web
   permission keys, not wire names"* — which is why `GET /session/me` reported
   `TimeCardQuestions: true` while the import still gated the section. Dev client 1
   licensed 13 modules `[4,6,9,13,17,21,22,36,38,44,46,47,50]` — no **43 Time Card
   Questions**. Granted on human authority via
   `PUT /admin/tm/clients/1/modules` (read-merge-write, nothing de-licensed) → 14
   modules. **Reversal:** `setClientModules(1, [4,6,9,13,17,21,22,36,38,44,46,47,50])`.
3. With the module licensed the grid rows imported and **`B12-R3`–`R6` all passed** —
   three Time Out cards (cardType 0, id equality, `programCreated`, `-TO-` refs), null
   Job/Ranch/Field, and each card's three answers joined by the parent `<Reference>`
   with the unexpected values stored verbatim. This run is the **first live proof** of
   the `TimeCardQuestion` wire format anywhere: the four-element `'grid'` row and the
   omitted `LookupContents` are correct (resolving N1 and N2 empirically). It also
   established `B12-R9`'s gate — `signature: null`, the importer leaving the column
   unbound by design.

Source: `docs/media/journey-b/b12-time-out-questions.mp4` (Jira attachment **66894**,
12,734,096 bytes, 1920×1032, 202.9 s) → `.video-annotations/b12-time-out-questions/` —
**134 keyframes, 67 action (18 force-sampled), max action gap 5.0 s of 5.0 s allowed, not
capped** (the default run capped at 60 change points with an 8.5 s gap; re-run with
`--max-frames 120`).

| Artifact | Path |
|---|---|
| Catalog entry | `src/data/catalog/workflow-catalog.json` → `B12` |
| Jira | `PET-12650` (automation) / `WEBPET-1531` (manual test, read-only source — Amy Sandoval Gonzalez's "PASSED QA" comment, 2026-08-11) |
| Recording | `docs/media/journey-b/b12-time-out-questions.mp4` |
| Evidence | `docs/media/journey-b/b12-notification-email.png` (attachment **66895**, transcribed in full below) |
| This plan | `test-plans/journey-b/b12-time-out-questions.md` |
| Spec | `tests/web/journey-b-field/b12-time-out-questions.spec.ts` |
| Runner rows | `src/data/runner/journey-b.csv` → `B12-001` |

## Catalog entry

| Field | Value |
|---|---|
| Workflow | `B12` |
| Journey | `B` — Field harvest day (mobile field capture) |
| Segments | `grower`, `perennial-grower`, `pack-house` |
| Modules | `Time Card Questions`, `Notification`, `Signature` |
| Surface | `device` — spec lives in `tests/web/journey-b-field/`, runner category `workflow` (API + UI in one test, like B1/B2/B3/B11) |
| Demo candidate | **yes** — CSV `demo=1`, so the test also carries `@Demo` |
| Catalog status | draft |

**Summary** (from the catalog)
> At clock-out the worker answers compliance and safety questions; an unexpected answer
> emails the crew's notification user and leaves a signed acknowledgment. The question set
> and expected answers are configured in device setup (A7, A14).

## Catalog steps

Amy's environment: her own LAN office at `https://192.168.1.74` (web PET Tiger, user `Su`)
plus a physical **RS35** handheld screen-shared over Zoom (Spanish UI, PET **26.01.22**,
device mailbox **`Device32@jensilo`**, reference prefix **`S32`**). Crew is
**`330 Ivan Felix`**; the day is **08/11/2026**, ~10:39–10:42 AM.

| # | Catalog step | What the recording shows | Automatable? |
|---|---|---|---|
| 1 | The worker answers the timeout questions. | *kf 0–11, 21, 35–39, 45.* Device on `PET - Tiempo de Salida - New` (individual time-out; 08/11/2026, 10:39 AM, Empleado and Memo empty, SCAN icons, buttons `MENU PRINCIPAL` / `AT WORK` / `LISTA` / `AHORRO`). On scanning an employee a **question sheet** opens: three questions, each a `Yes-Si` / `No` checkbox pair, **pre-checked with the expected answers** — Break→`Yes-Si`, Injury→`No`, Lunch→`Yes-Si` — above an empty **signature pad** with an `X` baseline and only a `CANCEL` button. She signs by hand; the buttons become `CANCEL / CLEAR / SAVE`; she saves. | device UI — **no**; the office receives the answers as grid rows, which step 2's assertions cover |
| 2 | An answer outside the expected response is flagged during import. | *kf 23 (device), kf 87–113 (office).* For `VELEZ NERIS, RAQUEL` she flips **all three** answers to the unexpected values — Break→**`No`**, Injury→**`Yes-Si`**, Lunch→**`No`** — signs and saves; for `VILLA, SERGIO` she flips **only Lunch** to **`No`**. Office-side, after the sync, both time-outs appear on **Transfer to Job Cards** and each row's panel carries a **`Questions`** grid holding exactly the responses sent. **No flag badge, no acknowledgment control, and Status stays `Ready`** on the mismatching row as much as on the conforming one. | **partly** — the answers importing and being readable per card is automatable and asserted; **the flag itself is not produced by the import at all** (see the note at the top), so it is a named gate, not an assertion |
| 3 | The real-time service emails the designated notification user and records the signed acknowledgment. | *kf 119–133 (email), kf 99–113 (signature).* Amy switches to Gmail: subject **`Action: Employees required responses did not match`** from `petnotificationsasg@gmail.com`, **two messages** — 10:40 AM for Raquel (three mismatch lines) and 10:41 AM for Sergio (one). The **signed acknowledgment** she demonstrates is the device-captured **Signature** on the time-out card: the panel's `Signature` box holds an image of the whole question sheet, checkboxes visible, with the handwritten signature beneath. | **split** — the **signature is automatable** and asserted; the **email is not** (legacy real-time service, no outbox, no API — named environment gate with this plan's transcription as the manual evidence) |

Not part of any step: *kf 19* and *kf 51*, two aborted attempts answered by the toast
**`Cancelled`** (`VELEZ NERIS, RAQUEL` retried immediately after; `ZAMORA,ALEXIS` produced
no record at all, which is why the device list ends at **4**, not 5).

### What the recording shows, in order

Every step, with the keyframes it is drawn from. This ordered list **is** the test.

| # | kf | What happens |
|---|---|---|
| 1 | 0–1 | Device on `PET - Tiempo de Salida - New`: `08/11/2026`, `10:39 AM`, Empleado empty, Memo empty. |
| 2 | 3–9 | Question sheet opens, three questions pre-checked with the **expected** answers (`Yes-Si` / `No` / `Yes-Si`); signature pad empty; only `CANCEL`. |
| 3 | 11 | She signs the pad ("Amy"); buttons become `CANCEL / CLEAR / SAVE`; saves. |
| 4 | 13 | Empleado `VELARDE MARTINEZ,MIGUEL`, toast **`Record saved for Velarde Martinez,Miguel`** — **all answers expected**. |
| 5 | 19 | Next employee `VELEZ NERIS, RAQUEL`; first attempt aborted, toast **`Cancelled`**. |
| 6 | 21 | Question sheet for Raquel, again pre-checked with the expected answers. |
| 7 | 23 | She flips **all three**: Break→**`No`**, Injury→**`Yes-Si`**, Lunch→**`No`**. Signs, saves. |
| 8 | 27 | Device list `PET Tiempo de Salida Recs (2)`, toast **`Time out saved.`** — Raquel 10:40 AM, Miguel 10:39 AM, both `Cuadrilla de Trabajo: 330 Ivan Felix`. |
| 9 | 33–37 | Next employee `VILLA, SERGIO`; question sheet pre-checked with the expected answers. |
| 10 | 39–41 | She flips **only Lunch** to **`No`** (Break `Yes-Si`, Injury `No` untouched), signs, saves. Toast **`Record saved for Villa, Sergio`**. |
| 11 | 45–47 | `VILLAREAL VAZQUEZ,HORTENCIA` — all expected answers — saved at 10:41 AM. |
| 12 | 51 | `ZAMORA,ALEXIS` attempt aborted, toast **`Cancelled`**; no record. |
| 13 | 55 | Device list `PET Tiempo de Salida Recs (4)`: Hortencia 10:41, Sergio 10:40, Raquel 10:40, Miguel 10:39. |
| 14 | 87 | Device main menu `PET (26.01.22) - Device32@jen…` with `EXPORTAR / IMPORTAR / SIN-CRONIZAR`; the records reach the office. |
| 15 | 58–63 | Office sidebar → **Transfer to Job Cards** (`/transfer-to-job-cards`). |
| 16 | 65–67 | Date-range picker → **08/11/2026 – 08/11/2026** → `Apply`. |
| 17 | 69 | Grid loads: **23 records · 13 blocking · 2 warnings**; **23 Ready · 5 Employees · 13 Pieces**. Columns `Reference · Date/Time · Type · Employee · Job · Crew · Department · Status · Employee Selection`. |
| 18 | 87 | Two **`Time Out`** rows — **10:39:59 AM** (Miguel) and **10:40:22 AM** (Raquel) — Employee Selection **`Barcode Badge`**, Status **`Ready`**. |
| 19 | 93–107 | Miguel's row opens a **`Time Out`** panel (`Hold for Review`; Delete / Cancel / Save): **Reference `0000001-260811-TO-S32-ui`** (read-only), `08/11/2026 10:39 AM`, Transferred `No`, Unedited `Yes`, Employee `Velarde Martinez,Miguel`, Work Crew `330 Ivan Felix`, **Job / Ranch / Field all empty**, **GPS `(36.8076963, -119.8348286)`**, Memo empty; **`Questions`** grid `Question | Response` → **`Break` `Yes-Si`**, **`Injury` `No`**, **`Lunch` `Yes-Si`**, each with `Remove`, plus `Select question…` + `Add Question`; **Verification Picture** empty (`—`); **Signature** = question-sheet image + handwriting. |
| 20 | 111–113 | Raquel's row: **Reference `0000002-260811-TO-S32-ui`**, `10:40 AM`, Employee `Velez Neris, Raquel`, same crew, Job/Ranch/Field empty, same GPS; **`Questions`** → **`Break` `No`**, **`Injury` `Yes-Si`**, **`Lunch` `No`**; Signature = question-sheet image + handwriting. **Status still `Ready`; no flag badge, no acknowledgment control.** |
| 21 | 119 | Gmail tab: inbox top row `petnotificationsasg` — **`Action: Employees required responses did not match`** — 10:41 AM. |
| 22 | 121–133 | The thread: **two** messages (10:40 Raquel, 10:41 Sergio), sender `petnotificationsasg@gmail.com`, `to me`. |

**Miguel and Hortencia produce no email.** The notification fires only for a mismatch, and
one message per time-out card — which is why four saved time-outs yield two emails.

## The notification email (attachment 66895, transcribed verbatim)

| Field | Value |
|---|---|
| Subject | `Action: Employees required responses did not match` (labels: External, Inbox) |
| Sender | `petnotificationsasg@gmail.com` |
| Recipient | `to me` — Amy's own Gmail; the configured notification user's address is *hers* in her LAN environment, so the address is environment data and is never hard-coded |
| Salutation | `Dear Amy Sandoval,` — the **notification user's name** |
| Sign-off | `Yours Faithfully,` / `Bot` |

Message 1 — 10:40 AM:

```
Dear Amy Sandoval,

Date: 8/11/2026
Employee: 11035 Velez Neris, Raquel during [0000002-260811-TO-S32-ui] has responded
to the question Were you allowed to take all your 10 minutes paid breaks today Se le permitio tomar todos sus 10 minutos de descansos pagados hoy? with No instead of Yes-Si.
to the question Have you been injured today Has sido lastimado hoy? with Yes-Si instead of No.
to the question Today, did you take a 30 minute lunch? Tomaste un lonche de 30 minutos hoy? with No instead of Yes-Si.

Yours Faithfully,
Bot
```

Message 2 — 10:41 AM: identical shape,
`Employee: 28717 Villa, Sergio during [0000003-260811-TO-S32-ui] has responded`, one line:
`to the question Today, did you take a 30 minute lunch? Tomaste un lonche de 30 minutos hoy? with No instead of Yes-Si.`

Five things the screenshot settles:

1. **The bracketed token is the time-out card's device reference** — `0000002-260811-TO-S32-ui`
   is `{seq7}-{yyMMdd}-{part}-{prefix}-ui`, byte-for-byte what
   `buildReference` (`src/utils/relay/exportEnvelope.ts:103`) produces, part **`TO`**. The
   office panel confirms the same strings (`0000001…` Miguel, `0000002…` Raquel), so the
   sequence is per-device and the email and the card agree.
2. **One email per card**, not per run — two employees, two messages a minute apart.
3. **Only mismatched questions are listed**, and each line carries **both** values:
   `with <given> instead of <expected>`.
4. **Answer vocabulary is the literal bilingual text `Yes-Si` and `No`.**
5. **The long bilingual sentence is `Question.QuestionText`, not `Question.Name`.** The office
   grid's `Question` column shows **`Break`**, **`Injury`**, **`Lunch`** — those are the
   `Name` values, and `Name` is what the importer's `<Question>` FK matches on. The email
   quotes `QuestionText`. This distinction is load-bearing for the envelope.

**For the record — web-pet's own wording, which is different** (`clockout_flag_notify.go:146-157`):

```
Subject: Clock-out answer flagged for <employeeName>
Dear <recipientName>,

A clock-out answer for <employeeName> on <yyyy-MM-dd HH:mm> did not match the expected response:

- <questionName>: answered "<response>" (expected one of: <requiredResponse>)
```

## Wire format (established read-only from source, before the Planner runs)

### `<TimeCardQuestion>` — the answer grid

`importmap/specs_inbound_grid.go:54-68` (`timeCardQuestionSpec`), porting
`PetDataModel/Models/Input/TimeCards/TimeCardQuestion.cs:34-52`:

| Element | Column | Rule |
|---|---|---|
| `<TimeCard>` | `TimeCardCounter` FK → `TimeCard`, **MatchColumn `Reference`** | NOT NULL — **the Reference join**: the row carries the parent time-out's `<Reference>` string verbatim (`:63`) |
| `<Question>` | `QuestionCounter` FK → `Question`, **MatchColumn `Name`** | NOT NULL — carries the question's **`Name`** (`Break` / `Injury` / `Lunch`), not an id, not the bilingual text (`:64`) |
| `<Response>` | `Response` nvarchar(250) | the answer (`:60`) |
| — | `Line` | **assigned by the import** (`AutoLineColumn`, `:67`); never sent |
| — | `TimeCardQuestionCounter` | IDENTITY, never bound (`:47`) |

Upsert identity `(TimeCardCounter, QuestionCounter)` (`:66`); module gate
`moduleTimeCardQuestions`, live-gated (WEBPET-1413, `:58`). The section arrives as a
**top-level sibling** `<TimeCardQuestion_Records>` of `<TimeOut_Records>` (`:10-12`), which
is exactly the shape `buildEnvelope` already produces. The nested-inside-the-parent form is
also supported (`importengine/nested_grids.go:79` `SplitNestedGrids`, WEBPET-1405) and is
what the real device emits (`AndroidPET .../sync/TimeCardExport.java:74-75` skips the
question table at top level; `:232-240` attaches it via `singleRecItem.addChildItem`), but
the sibling form is the one with an explicit contract, so B12 uses it.

The device puts **no `LookupContents` attribute at all** on `TimeCardQuestion_Records`
(`TimeCardExport.java:156-158, 171-173` — *"No lookup attribute needed"*). Device-side the
record holds `parent_id, Question, Response, UpdateTime, ExportTime, CardType`
(`record/TimeCardQuestionRecord.java:11-17`), `CardType` ∈ `TimeIn|TimeOut|Signature`
(`:43-57`), with `parent_id` and `ExportTime` in `DONT_EXPORT_TAG_LIST`
(`TimeCardExport.java:35`).

### `<SignatureCard>` — the signed acknowledgment row

`importmap/timecard.go:32` registers `nodeSignatureCard = "SignatureCard"` (accepted-node
list `:44`), and `deriveTimeCardTypeAndDateTime` `:438-441`:

```go
case strings.EqualFold(nodeName, nodeSignatureCard):
    when, haveWhen = combineDateAndTime(f, elemDateIn, elemTimeIn)
    cardType, cardTypeSet = cardTypeSignature, true
```

- `<SignatureCard>` inside `<SignatureCard_Records>`; **CardType = 2** (`cardTypeSignature`, `:52`).
- **Date/time comes from `DateIn` + `TimeIn`** — the first arm of the chain (`:348`), **not**
  `DateOut`/`TimeOut`.
- Reference part **`SC`** (`timeCardReferenceParts:672-673`).
- The device's `Signature_Records` LookupContents is
  `Employee:Code|Crew:Code|Job:Code|Equipment:Code` (`TimeCardExport.java:150-154`).

**This is a live defect in our groundwork.** `NODE_SHAPE` (`exportEnvelope.ts:293`) maps
`SignatureCard: 'punchOut'`, emitting `DateOut`/`TimeOut`. The SignatureCard arm reads only
`DateIn`/`TimeIn`, so `haveWhen` would be false and — *"DateTime is NOT NULL on the table, so
a record that yields no date at all fails"* (`timecard.go:360`) — the row would be
**rejected**. Must become `'punchIn'`.

### `<TimeOut>` — unchanged from B11

Node `TimeOut`, part `TO`, `punchOut` shape (`DateOut`+`TimeOut`) → **CardType 0**; no Job,
Ranch or Field; `LookupContents="Employee:Code|Crew:Code"` in the real device sample
(`docs/05-mobile-integration/samples/FromIphone-20240313142926-A02.xml`). The office panel
confirms Job/Ranch/Field empty and Employee Selection `Barcode Badge`. Neither
`TimeCardQuestion` nor `SignatureCard` appears anywhere in that sample, so there is **no
captured wire example** of either — the two rows above are derived from the importer's spec
and the device serializer, and the Planner must confirm the minimal element list live.

### What marks an unexpected answer after import

**Not a field on the time card — a row in a separate table.**
`input/clockout_answer_flag.go:51-121` `DetectAndFlagClockOutAnswers` (WEBPET-1081):

- Only `CardType = 0` cards are considered; Time-Ins return early (`:63-65`).
- For each non-deleted `TimeCardQuestion` whose `Question.RequiredResponse` is non-empty, it
  compares via `isRequiredAnswer` (`:129-139`): `RequiredResponse` is a **comma-separated
  list** of acceptable answers, split with **no whitespace trimming**; an answer is
  acceptable iff non-empty and exactly one of the list values.
- Each mismatch inserts a **`TimeCardQuestionFlag`** row
  `(TimeCardCounter, QuestionCounter, Response, RequiredResponse)`. Idempotent while a flag
  is open (`AcknowledgedAtUtc IS NULL`); a question with empty `RequiredResponse` is never
  flagged.

Observable at **`GET /api/time-cards/{id}/flag-acknowledgment`** (`main.go:2640`) →
`{ timeCardCounter, flags: [{ flagId, questionCounter, questionName, response,
requiredResponse, flaggedAtUtc, acknowledgedAtUtc, acknowledgedByEmployeeCounter,
acknowledgedByEmployeeName, signatureImage }] }`, and
**`GET /api/time-cards/flags/unacknowledged`** (`main.go:2639`) →
`{ timeCardCounters: [...] }`. The office-side signed acknowledgment is
**`POST /api/time-cards/{id}/flag-acknowledgment`** with `{ "signatureImage": "<base64>" }`
(`flag_acknowledgment.go:194-353`), which bulk-stamps every unacknowledged flag with the
**time card's own `EmployeeCounter`** as the acknowledging employee; 404 with zero flags,
**409 `This record has already been acknowledged.`** when all are already acknowledged.

**But — see the top of this plan — the import never calls the detector**, so after an
import there are zero flag rows and the endpoint returns an empty `flags` array.

### The imported answers and the signature, which *are* observable

`GET /api/time-cards/time-out/{id}` (`main.go:2546`) returns the whole card including
`questions: [{ questionCounter, questionName, response }]` (`time_out.go:78`,
`fetchTimeOutQuestions:225`) and `signature` (`time_out.go:80`). That is the assertion
channel for both the answer rows and Amy's signed acknowledgment.

### How the notification user is configured

`clockout_flag_notify.go:105-141`: **`Crew.UserToNotifyBreakAndMeal`** → `Users.UsersCounter`,
reading `Users.Name` (the email's salutation) and `Users.EmailAddress`. A crew with no
notify-user, a deleted crew, a missing user, or a user with a blank email is **logged and
skipped**, `NotifiedAtUtc` left NULL so a later save retries.

Settable through the API: `userToNotifyBreakAndMeal` is a plain `*int` on the crew create and
update requests (`setup/crew.go:91,159,226`; FK declared `{"Users","UsersCounter"}` at
`:1609`), so `PUT /crews/{id}` sets it and `PUT` restores it. Questions are full CRUD:
`GET`/`POST /api/questions`, `GET`/`PUT`/`DELETE /api/questions/{id}` (`main.go:1872-1880`)
with `{ name, questionText, allowedResponses, requiredResponse, active }` plus a read-only
`isReferenced`. **Constraint:** once a `TimeCardQuestion` row references a question, only
`Active` may change — `PUT` returns *"This question is in use by a time card and cannot be
modified. Only Active can be changed."* (`question.go:394-406`). `questionType` is only
`YesNo` (0) / `CustomValue` (1) (`:103-112`) — the answer *format*, not a clock-out
assignment. **No page object is needed for either precondition; both are pure API.**

### Is the email observable on dev? **No.**

`cmd/server/main.go:61-76` `selectEmailSender`: SendGrid if `SENDGRID_API_KEY` → real SMTP if
`SMTP_HOST` → otherwise **`LogEmailSender`**, *"a development/test EmailSender that records
each dispatch in the Sent slice and logs it via slog.Info"* (`export_email.go:237-258`).
`clockOutNotifySender` is built from that selector (`main.go:227-228`), `fromAddress =
os.Getenv("SMTP_FROM")`.

There is **no outbox table, no notification-log endpoint, and no API that returns sent mail**.
`LogEmailSender.Sent` is in-process memory. The only durable trace is
`TimeCardQuestionFlag.NotifiedAtUtc`, which appears in **no JSON response** anywhere in the
repository — only in `clockout_flag_notify.go`, the migrations, the schema snapshot and
comments. With no DB access from tests it is unreachable. And in any case the message Amy
received came from the legacy service, which web-pet cannot trigger.

**Therefore the email leg is a named environment gate**, and this plan's transcription above
is the manual evidence, per PET-12650's "never a silent skip".

## Acceptance criteria (EARS)

| id | Requirement | Cases |
|---|---|---|
| `B12-R1` | While a clock-out question sheet is open, PET Pocket shall pre-check each question with its configured expected answer. | — not automatable: device UI (kf 3–9) |
| `B12-R2` | When a clock-out is saved, PET Pocket shall require a signature before enabling Save. | — not automatable: device UI (kf 11 — `SAVE` appears only once the pad is signed) |
| `B12-R3` | When a clock-out export is imported, PET Tiger shall hold one Time Out card (cardType 0) per clocked-out worker, each linked by id to the scanned employee and to the crew, with `programCreated` true and a `TO` reference. | `B12-001` |
| `B12-R4` | PET Tiger shall leave Job, Ranch and Field unset on an imported Time Out card. | `B12-001` |
| `B12-R5` | When a clock-out export carries `TimeCardQuestion` rows, PET Tiger shall attach every answer to the Time Out card its `<TimeCard>` reference names, preserving each `<Question>` name and `<Response>` verbatim. | `B12-001` |
| `B12-R6` | When a worker answers a clock-out question with a value outside the question's required response, PET Tiger shall store that answer verbatim rather than rejecting or normalising the record. | `B12-001` |
| `B12-R7` | When a clock-out export carries a `SignatureCard` row, PET Tiger shall hold it as a signature card (cardType 2) linked by id to the same employee, with an `SC` reference. | — **out of scope: Amy's flow produces no standalone signature card.** The Transfer grid's `Type` column shows only `Time In` / `Time Out` / `Piece Out` across all 23 rows (kf 69–87), and the signature image sits **inside the Time Out panel** (kf 99–113) — it is the `<Signature>` element on the *TimeOut* row (`input/time_out.go:80`), which `buildRow` already emits as an empty slot. `SignatureCard` (CardType 2) is the device's separate signature-capture screen (`SignatureCardActivity`), which she never opens. The signature requirement is `B12-R9`. |
| `B12-R8` | Where the Notification module is licensed, PET Tiger shall record the crew's notification user as a Users record carrying an email address. | `B12-001` |
| `B12-R9` | When a clock-out export's Time Out row carries a signature, PET Tiger shall store it on that card and expose it alongside the card's question answers. | — **not automatable via import (established live 2026-08-28, run 3).** The importer deliberately does not bind the column: *"Signature and PictureVerification are `image` columns. The device sends them empty in every available sample and their populated encoding is unverified, so they are left unbound (they will simply be NULL) rather than guessing a decode — logged in OPEN_QUESTIONS.md"* (`importmap/timecard.go:80-83`); `timeCardSpec.Columns` has no `Signature` entry. `GET /time-cards/time-out/{id}` duly returned `signature: null` for a card whose envelope carried one. Amy's panel shows a signature because her records came through the legacy stack — the same split that explains the email. The envelope still carries `<Signature>`, asserted as **sample fidelity** in the spec, so the day the importer binds the column this becomes assertable unchanged. **Named in a test annotation, never silently skipped.** |
| `B12-R10` | If a clock-out answer differs from its question's required response, then PET Tiger shall raise a question flag carrying the given and the expected response, and email the crew's notification user. | — **not automatable via import**: `DetectAndFlagClockOutAnswers` / `sendClockOutFlagNotifications` are reachable only from `POST`/`PUT /api/time-cards/time-out`, never from `connectivity/`; and the email has no observable channel on dev (`LogEmailSender`, no outbox, `NotifiedAtUtc` unexposed). Manual evidence: `docs/media/journey-b/b12-notification-email.png`, transcribed above. **Named in a test annotation, never silently skipped.** |

`B12-R10` is the workflow's headline outcome and it is the one row this plan cannot assert
through the transport Amy uses. That is a product gap, not a test gap — see *Follow-up* below.

## Not established / out of scope

Listed, not tested. Nothing here becomes a second scenario.

| # | Question / item | Why it matters |
|---|---|---|
| ~~N1~~ | The minimal accepted element list for a `<TimeCardQuestion>` row. | **Resolved by decision 2026-08-27 (Planner), residual risk named.** Emit exactly `<TimeCard>`, `<Question>`, `<Response>`, `<UpdateTime>` — the three bound elements plus the one timestamp that is a real column. `Line` is import-assigned and must not be sent. The current `'aux'` shape is unusable: `buildRow` opens every row with `<Reference>` (`exportEnvelope.ts:324`), the `'aux'` arm adds `<DateTime>` (`:344-346`) and every shape appends `<TraceabilityCode>` (`:360`) — **none of which are `TimeCardQuestion` columns** — and, decisively, `buildEnvelope` mints a reference for *every* record (`:398-405`) while `deliverAndVerifyCards` asserts `references.length === expected.length` (`officeVerification.ts:332`). **A question row is not a card and must neither carry nor consume a reference.** Hence a new `'grid'` shape. Risk: no wire sample exists (D), so this is unproven until the first live import. Fallback, in order — (1) read the per-file error in the attached import-run JSON (an FK failure on `Question` is a name problem, not a shape problem); (2) switch the section to the nested-inside-`<TimeOut>` form (`SplitNestedGrids`, WEBPET-1405 — what the real device emits); (3) stop and report. Never guess a third shape. |
| ~~N2~~ | Whether `TimeCardQuestion_Records` must omit `LookupContents`. | **Resolved: omit it.** The real device emits none, and the generic string `buildEnvelope` stamps on every section (`exportEnvelope.ts:282,411`) declares `:Code` match columns for entities this section does not reference — while its own FKs match on `Reference` and `Name`. At best noise, at worst an override of the correct server-side MatchColumns. Needs a per-node section-attribute override; every other node keeps today's default verbatim, so B1/B2/B3/B4/B11 stay byte-identical. `SignatureCard_Records` keeps the generic attribute — B11 proved the importer accepts it on a section whose device sample differs. Fallback: re-add the generic attribute, then try `TimeCard:Reference\|Question:Name`. |
| ~~N3~~ | Whether dev already holds `Question` rows named `Break` / `Injury` / `Lunch`, and with which `requiredResponse`. | **Resolved live 2026-08-27.** `GET /questions` returns exactly 4 rows — `Break`(1), `ConfirmationQ2`(2), `Meal`(3), `Off the Clock`(4) — and **every one has `requiredResponse: null` AND `isReferenced: true`**, all `questionType: YesNo`, `allowedResponses: "Si, No"`. So no existing dev question can ever be flagged, and none can be corrected. **Two consequences:** the spec must *create* its questions with a non-empty `requiredResponse`, and it must **not** reuse the name `Break` — the FK matches on `Name`, so Amy's literal would bind our answer to dev's unflaggable row. Hence `B12 Break` / `B12 Injury` / `B12 Lunch`. The unexpected answer is still derived from the stored `requiredResponse` at runtime. |
| ~~N4~~ | Which `Users` row on dev carries an email address suitable as the notification user. | **Resolved live 2026-08-27.** `GET /users` **already returns `emailAddress`** — only our `UserListItem` type omits it, so no detail call is needed (add the field). Many candidates exist (`QA User17`(110) `agukanqauser@gmail.com`, `QA Users`(83), `Deepak`(79)). **`Su`(37) has an empty `emailAddress`** and is ineligible — which matters, because `sendClockOutFlagNotifications` silently skips a notify-user with a blank address. The spec discovers the first user with a non-empty address; never a hard-coded id or address. |
| ~~N5~~ | Whether the `Time Card Questions`, `Notification` and `Signature` modules are enabled on dev. | **Resolved live 2026-08-27: all three are ON.** `GET /session/me` → `modules` lists 20 enabled modules including **`TimeCardQuestions`**, **`Notification`** and **`Signature`**, all `true`. Note the key spelling — **CamelCase, no spaces** — which is also the form `sess.Modules["Notification"]` uses server-side. `GET /license` returns 500 on dev and is not usable. The spec still guards: a gate can close, and a closed gate is a named annotation, never a silent skip. |
| N6 | The office-side flag-acknowledgment feature (`POST /api/time-cards/{id}/flag-acknowledgment`, WEBPET-1083). | A real, observable capability — but Amy never touches it; her acknowledgment is the device-captured signature. Out of scope under the scope rule. |
| N7 | `Hold for Review` on the Time Out panel (kf 93). | Amy does not use it. |
| N8 | The `Cancelled` toast path (kf 19, 51). | Device-side abort producing no record. Negative case — out of scope. |
| N9 | Amy's `23 records / 13 blocking / 2 warnings` and the `JobCounter is required on a piece-out TimeCard` issue group (kf 69). | Same-day noise from other workflows in her environment. Our fixture day is clean, so no count assertion is written. |
| N10 | Tones / audible feedback. | No audio in the capture. |
| N11 | The `Add Question` / `Remove` controls on the panel's Questions grid. | Office-side editing Amy does not perform. |

## Screens and page objects

| Screen | Menu path | Page object | Status |
|---|---|---|---|
| Connectivity ▸ Import ▸ Internet | `Connectivity ▸ Import ▸ Internet` | `src/pages/connectivity/ImportInternetPage.ts` | exists — the office UI half the **internet** transport drives, exactly as in B1/B2/B3/B4/B11 |
| Transfer to Job Cards | `Transfer to Job Cards` | `src/pages/processing/TransferToJobCardsPage.ts` | exists — the screen Amy uses; B12 asserts its data on the API |

**No new page object.** Every outcome B12 asserts is on the API
(`GET /time-cards`, `GET /time-cards/time-out/{id}`, `GET /time-cards/{id}/flag-acknowledgment`,
`GET /crews/{id}`, `GET /users/{id}`, `GET /questions`). The Questions grid and the Signature
box Amy reads in the panel are both returned by the time-out detail endpoint, so nothing she
read off that screen is unreachable.

## Data

Existing Journey B fixture entities only — no new records (`src/data/journey-b/fixture.ts`):

| Role in B12 | Amy's equivalent | Fixture record |
|---|---|---|
| Ranch / Field / Job for the morning time-ins | Harvesting – Coachella Grape | `4001 B1 RANCH` / `4101 B1 FIELD` / `4201 B1 HARVEST` |
| Crew (carries the notification user) | `330 Ivan Felix` | `5001 B1 CREW` |
| Worker whose answers are **all unexpected** | `Velez Neris, Raquel` | `6001 B1 PRESENT ONE` |
| Worker whose answers are **all expected** | `Velarde Martinez, Miguel` | `6002 B1 PRESENT TWO` |
| Worker with **one** unexpected answer | `Villa, Sergio` | `6003 B1 PRESENT THREE` |
| Not clocked in | — | `6004 B1 ABSENTEE FOUR` (asserted absent) |

`Villareal Vazquez, Hortencia` repeats Miguel's all-expected pattern and is deliberately not
modelled — three distinct answer patterns cover every branch the recording shows.

`DAY_OFFSET.B12 = -5` already exists — B12 punches five days back so parallel workers never
collide on the office's duplicate-Time-In rule at `workers=2`.

Times follow the recording's shape: morning time-ins `07:15`; time-outs at `10:39`, `10:40`
and `10:40`; the signature card at the same instant as its time-out.

Question set, mirroring Amy's (names are the FK match values; the bilingual sentences are
`questionText`):

| `name` | `requiredResponse` | `allowedResponses` | `questionText` (from the email) |
|---|---|---|---|
| `B12 Break` | `Yes-Si` | `Yes-Si, No` | `Were you allowed to take all your 10 minutes paid breaks today Se le permitio tomar todos sus 10 minutos de descansos pagados hoy?` |
| `B12 Injury` | `No` | `Yes-Si, No` | `Have you been injured today Has sido lastimado hoy?` |
| `B12 Lunch` | `Yes-Si` | `Yes-Si, No` | `Today, did you take a 30 minute lunch? Tomaste un lonche de 30 minutos hoy?` |

**The `B12 ` prefix is load-bearing, not cosmetic.** Dev already holds a question literally named
**`Break`** which is `isReferenced: true` with `requiredResponse: null` (N3). Because `<Question>`
FK-matches on **`Name`**, sending Amy's literal `Break` would bind our answer to that row — which
can never be flagged and can never be corrected. Fixture-prefixed names mirror the
`B1 RANCH` / `B1 CREW` convention already in `JOURNEY_B_FIXTURE`.

The **unexpected** answer for each question is derived at runtime from the stored
`requiredResponse` (N3), not hard-coded — a referenced question cannot be corrected.

## Preconditions

- [x] **Internet relay — the code default; do not set `IMPORT_TRANSPORT`.** It is what CI
      runs and what Amy's environment does (her relay ingests automatically), and the only
      transport that exercises the **WebMail/relay leg**. B11's plan warns against
      `single-folder` for exactly this reason: it POSTs straight to
      `connectivity/import/single-folder` and skips that leg entirely.
      **Verified on both:** internet relay green in **64.9 s** (2026-08-31 — the run log
      carries `Navigating via menu: Connectivity ▸ Import ▸ Internet`, so the office pull
      really ran) and `single-folder` green in **45.3 s** (2026-08-28). Neither used
      `OFFICE_TRANSPORT_SUBSTITUTE`, and both asserted `programCreated=true`, which
      `deliverAndVerifyCards` only permits on a genuine device import. `single-folder`
      remains the fallback when relay configuration is unavailable.
- [ ] `IMPORT_POLL_TIMEOUT_MS=180000` — the worker claims files on the client's
      `serviceImportInterval` cadence, not on arrival.
- [x] Modules open on dev — `GET /session/me` → `modules` shows `TimeCardQuestions: true`,
      `Notification: true`, `Signature: true` (**CamelCase keys, no spaces**). The spec still
      guards on them: a closed gate is annotated, never silently skipped (N5).
- [x] `Question` rows **`B12 Break` / `B12 Injury` / `B12 Lunch`** exist with a non-empty
      `requiredResponse` — discovered-or-created through `POST /api/questions`, never mutated
      when `isReferenced` is true. **Fixture-prefixed** because dev's own `Break` is referenced
      with a null `requiredResponse` and the FK matches on `Name` (N3).
- [x] `Crew 5001`'s `userToNotifyBreakAndMeal` points at a `Users` row that has an
      `EmailAddress` — set through `PUT /crews/{id}` (read-modify-write with `version`),
      original value recorded for restore. Currently `null` on dev; the user is **discovered**
      as the first with a non-empty `emailAddress` — never a hard-coded id or address, and
      never `Su`, whose address is empty (N4).

## Cleanup

| What | Before the run | After the run |
|---|---|---|
| Fixture punches on the B12 day | `sweepFixtureCards(sessionApi, { employeeIds: [6001–6004 ids], day, cardTypes: [0, 1, 2] })` via `deliverAndVerifyCards`' pre-run sweep — Time-Ins (1), Time-Outs (0) **and** signature cards (2) | — |
| Imported cards (and their `TimeCardQuestion` children) | — | `cleanupCards(sessionApi, cards, testInfo)` in a `finally`; `DELETE /time-cards/{id}` cascades the question rows |
| Crew notification user | original `userToNotifyBreakAndMeal` read and recorded | `PUT /crews/{id}` restores the original value in the same `finally` |
| `Question` rows | discovered or created; never mutated when referenced | **kept** — they become stable QA fixture data, like `seedOfficeFixture`'s records. A question referenced by any time card cannot be deleted cleanly, so B12 deliberately does not try. |
| Office setup records | `seedOfficeFixture` is idempotent — discovered, not recreated | kept |

No SQL, ever — the dev database is unreachable by design; setup and teardown go through the
app's API.

## Test cases

| id | Title | Req | Tags | enabled |
|---|---|---|---|---|
| `B12-001` | Time-out questions to notification | `B12-R3`, `B12-R4`, `B12-R5`, `B12-R6`, `B12-R8` | `regression` + `demo=1` → `@Demo` | 0 → 1 when green |

```ts
test.describe('B12 · Time-out questions to notification', { tag: ['@JourneyB', '@B12'] }, () => {
    test('[Time-Out Questions] Clock three crew members out with their clock-out question answers and a signature, and verify each answer — including the ones outside the expected response — imports against the right time-out card.', {
        tag: ['@Regression', '@Demo'],
        annotation: [
            { type: 'testCaseId', description: 'B12-001' },
            { type: 'requirement', description: 'B12-R3|B12-R4|B12-R5|B12-R6|B12-R7|B12-R8|B12-R9' },
        ],
    }, async ({ sessionApi, pages }, testInfo) => { /* … */ });
});
```

## Follow-up (product, not test)

`B12-R10` cannot be asserted through the device→office transport because web-pet's
`connectivity/` import path never calls `DetectAndFlagClockOutAnswers`. In the legacy stack
the equivalent ran inside the import (`TimeCardImport.cs:1577-1596`), which is why Amy's
run produced flags and emails. Worth a PET ticket (component **Cloud**, assignee **Gukan**):
*"Clock-out answer flag detection and notification do not run on connectivity import — only
on POST/PUT /time-cards/time-out"*, linked to WEBPET-1081/1082 and to PET-12650.

## Open questions for the tester

- [x] N3, N4, N5 — resolved live against dev on 2026-08-27 (see the table above).
- [x] N1, N2 — resolved by Planner decision on 2026-08-27, with the fallback order recorded.
- [ ] **The only genuinely open item:** N1's residual risk. No wire sample of `<TimeCardQuestion>`
      or `<SignatureCard>` exists anywhere, so the first live import is what proves the row
      shapes. If it rejects them, follow N1's fallback order — do not guess.
