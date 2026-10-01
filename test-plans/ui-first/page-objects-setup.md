# UI-first WP1 — what the setup screens actually do

Live exploration of dev staging (`https://app.ptdev.xyz`, as `su`, 2026-09-30) for the
page objects the UI-first conversion needs. **Nothing was created or saved** — forms were
filled to a savable state and read. The one mutating-looking action was *Analyze Transfer
Candidates*, which commits nothing.

This is the Generator's handoff for the page-object build. Where it contradicts the
design plan, **this document wins** — it was measured, the plan was inferred.

## Contradictions with the design plan — read these first

| The plan assumed | The screens actually do | Consequence |
|---|---|---|
| Employee Active is a native `input#active` checkbox | **Every** screen's Active is `span[role="switch"]`, `aria-labelledby="active-label"`, in the page header **outside `<main>`**; the `input#active` behind it has no `offsetParent` and cannot be clicked | one `setActive` in the base class, `getByRole('switch', { name: 'Active' })`. `src/pages/webpet/setup/EmployeeFormPage.ts` documents the checkbox — that is not this build |
| Field's Ranch/Crop/State are sheet-mode pickers listing >100 ranches unfiltered | They are base-ui **Selects** (button triggers, no filter input). Ranch lists all **13** ranches — the whole tenant | the "prefer `data-value` = ranch id from the GET" mitigation is unnecessary; pick by option name. Risk 11 is closed |
| Crew Time In: pick the crew first and the Table picker populates | **Inverted.** With no crew the Table picker lists **all 17** tables in the tenant; after choosing D6 CREW it opens **empty**, because that crew owns none | still select crew first (the scoping is right), but an empty listbox means "this crew has no tables", not "not loaded yet" |
| Per-employee checkbox name is code / name / `code - name` | **Employee name only** — `"D6 PICKER ONE"` | `getByRole('checkbox', { name })`. All members arrive **pre-checked**, so the flow is deselect-then-select; `Deselect All` exists in the section header |
| Users grid may hide inactive users behind a filter | It **lists them by default** (26 rows including inactive). Active renders as plain text `Yes`/`No`; hiding is opt-in via the column's `All` combobox | risk 7 is closed. Note Active is text here but a `checkbox` in the Ranch grid — no shared grid helper may assume one shape |
| Code may be locked by the setup-identifier preference | `/api/setup-identifier-preferences` returns `allowRecordNameModification`, `allowRecordBarcodeModification`, `allowRecordExportIdModify` all **true** on dev; Name/Barcode/Export Identifier are editable on New *and* Edit | `assertCodeEditable()` still earns its place (the preference can change), but no page object may hard-code "read-only on edit" |
| `#paymentType` is a select keyed by numeric `data-value` | True in substance, but it is a **button** `#paymentType[role=combobox][data-slot="select-trigger"]`, not a native `<select>`. **Time = `0`, Piece = `1`** | pick with `getByRole('option', { name: 'Piece', exact: true })`; a synthetic `element.click()` only highlights, a real click is required |

## Rules for the shared base class

These hold on every form inspected and belong in `SetupScreenPage`, not in each subclass.

* **Validity is recomputed only when a plain text input blurs.** The forms use
  react-hook-form with `mode: 'onBlur'`, `reValidateMode: 'onChange'`; blurring a
  `type=number` spinbutton or choosing from a Select/Combobox updates the value and
  leaves `isValid` stale. Measured both ways on New Field: clearing Area and tabbing
  left Save *enabled*; touching Name and tabbing then correctly disabled it.
  → **every fill sequence ends by blurring a text field, normally Name.**
* Setting a value with `element.value = …` plus synthetic events does not register.
  Page objects use real `fill()` / `click()`.
* **Save is `Save`** on every screen — no suffix. `button[type=submit][data-slot=button]`,
  wrapped in `span[data-slot="tooltip-trigger"]`. The button carries
  `disabled:pointer-events-none`, so the tooltip only appears on the **wrapper**; it reads
  **"Fix errors to save"**, and on some forms that is the *only* signal that a required
  field is empty.
* **Headings:** New `<h1>` = `New <Entity>`; Edit `<h1>` = `Edit <Entity>: <name>`.
* **Unsaved-changes bar** renders on New and Edit as soon as the form is dirty: pristine
  bar is `Cancel` + `Save`, dirty is `Unsaved changes` + `Discard changes` + `Save`. A
  `N error ▼` summary button appears beside it when validation fails.
* **`beforeunload` trap:** navigating away from a dirty form raises a native dialog and
  `page.goto` hangs until it is handled. Any method that abandons a dirty form registers
  `page.on('dialog', d => d.accept())` first.
* **The field labelled "Barcode" has `id="code"`** on Ranch, Field, Crew, Employee and Job.
  There is no field labelled "Code".
* **Export Identifier auto-populates from Name on blur** — Ranch `<name>`, Field
  `<ranch>, <name>`. Employee does not.
* **Three picker shapes, all `role="combobox"`** — the role does not distinguish them:

  | Shape | DOM | Filters | How to pick |
  |---|---|---|---|
  | base-ui **Select** | `BUTTON[role=combobox][data-slot=select-trigger]` | no | click trigger → `getByRole('option', { name })`; options carry `data-value="<enum>"` |
  | base-ui **Combobox** | `INPUT[type=text][role=combobox]` | yes | click → type to narrow → click option |

  No sheet/drawer picker exists on any of these screens. Each combobox writes its chosen
  id into an adjacent hidden textbox; some write a whole JSON object instead (Crew on
  Employee and Crew Time In, Overtime Rules on Field) — **never assert on that textbox.**
  Server-backed comboboxes cap at 100 with a
  `"Showing the first 100 matches — keep typing to narrow"` footer.
* **Grids:** `grid[aria-label="<Plural>"]`; row edit link
  `link[aria-label="Edit <Entity>: <name>"]` → `<listUrl>/{id}`; footer `status` "Total N rows".

## Per screen

### Setup ▸ Ranch — `/setup/ranches`, `/new`, `/{id}`

Sidebar Setup ▸ Ranch. **Minimum to enable Save: Ranch Name only** — Department is *not*
required. Sub-nav `Ranch`, `Map` (Map is ignored: never wait on it).

| Label | Control | Locator |
|---|---|---|
| Ranch Name * | text | `#name` |
| Export Identifier | text, auto-filled from Name | `#exportIdentifier` |
| Barcode | text, editable on New and Edit | `#code` |
| Department | combobox (filters, 100-cap) | `#departmentCounter` |
| Worker Comp Code | text | `#workerCompCode` |
| Bill To Customer | combobox | `#customerCounter` |
| Markup Amount [%] | number | `#markUp` |
| Active | switch | `getByRole('switch', { name: 'Active' })` |

Grid `Ranches` (13 rows); Active renders here as `checkbox[aria-label="Active: <name>"]`.

### Setup ▸ Field — `/setup/fields`, `/new`, `/{id}`

Sections `Field`, `Map`, `Cultivation`, `Traceability`, `Irrigation` — all rendered at
once; the sub-nav only scrolls.

**The finding of the batch: Save is gated on six fields, only two of which are marked.**
With Ranch + Name + Crop + State + Overtime Rules filled, Save stayed disabled with **no
field error, no error summary and nothing `aria-invalid`** — the only signal was the
"Fix errors to save" tooltip. The form's own resolver reported four more required keys:
`area`, `flowRate`, `flowRateUnit`, `percentIrrigationEfficiency`.

**Minimum set:** Ranch, Name, Area, Flow Rate, Flow Rate Unit, Irrigation Efficiency (%),
then blur a text field.

> **Candidate product bug.** Cultivation ▸ Area and the whole Irrigation section are
> required with no `*`, no inline message and no error-summary chip. Worth filing before
> a spec silently depends on it — if it is fixed, `createField`'s fill sequence changes.

| Label | Control | Locator |
|---|---|---|
| Ranch * | base-ui **Select** | `#ranchCounter` — 13 options, no filter |
| Name * | text | `#name` |
| Barcode / Export Identifier | text | `#code` / `#exportIdentifier` (auto `"<Ranch>, <Name>"`) |
| Crop / State | base-ui Select | `#cropCounter` (8) / `#stateCounter` (60) |
| Overtime Rules | combobox | **`#overTimeRulesCounter`** — capital **T**; Job's is lower-case. Easy trap |
| Area * (unmarked) | number | `#area` |
| Flow Rate * (unmarked) | number | `#flowRate` |
| Flow Rate Unit * (unmarked) | base-ui Select, **no stable id** | `getByRole('combobox', { name: 'Flow Rate Unit' })` — 9 options |
| Irrigation Efficiency (%) * (unmarked) | number | `#percentIrrigationEfficiency` |
| Active | switch | `getByRole('switch', { name: 'Active' })` |

Also present: `#varietyCounter #departmentCounter #customerCounter #neededEmployeesCounter
#harvestDate #unitsPerArea #numberOfRows #rowDirection #traceabilityFieldId`.

### Setup ▸ Crew — `/setup/crews`, `/new`, `/{id}`

Sections `Crew & Badge`, `Time Card Defaults`, `Day Boundaries`, `Differential Pay`,
`Break & Automation`. **Minimum to enable Save: Name only.**

**The field that maps to the API's `userToNotifyBreakAndMeal`** (B12 needs it): visible
label **"User to Notify for Break & Meal"**, in **Break & Automation**, a typable combobox
with `id="userToNotifyBreakAndMeal"`. Its neighbour "Break & Meal Notification"
(`#breakAndMealNotification`) is a minutes text input — not the same field.

Ids are the API field names: `#name #exportIdentifier #code #shortName #supervisorCounter
#departmentCounter #defaultRanchCounter`(Select)` #defaultFieldCounter #defaultJobCounter
#includeInTransfer #timeRoundingFactor #roundingType`(Select)` #neededEmployeesCounter
#dayStartFrom #dayStartTo #lunchLengthMinutes #autoPaidBreakType`(Select). Badge Color is
a plain `button` reading `None`, not a combobox.

### Setup ▸ Employee — `/setup/employees`, `/new`, `/{id}`

Sub-nav `General`, `Additional Info`, `Contact`, `Identification`.
**Minimum to enable Save: Name only.** **Pay Period is not required** — `#payPeriod` is a
base-ui Select defaulting to Hourly (hidden value `0`).

* **Crew** is a typable combobox `#crewCounter`, and it arrives **pre-filled on a New form**
  (showed `B1 CREW`, from preferences) — a page object must overwrite, never assume empty.
  `#crewTableCounter` ("Crew Table") sits beside it.
* **Barcode is editable on Edit too** — verified on `/setup/employees/1870` (`#code` = `8002`).
* General ids: `#name #code #exportIdentifier #firstName #middleName #lastName
  #departmentCounter #rate`("Hourly Rate")` #employeeClassCounter`.
* Edit adds repeating sub-grids (Employment History, Rate History, Job Rate Overrides, …),
  each with its own inline `Add`.

### Setup ▸ Job (New) — `/setup/jobs/new`

`#paymentType` is `BUTTON[role=combobox][data-slot="select-trigger"]`, default label `Time`.
Options are `[role=option][data-value="<n>"]`: **Time `0`**, **Piece `1`**, Time & Piece `3`,
Time & All Pieces `4`, Determined by Job End `5`, Bonus `6`, … Off-Clock `16` (no `2`).

What gates Save, measured by running the form's schema:

| Payment type | Schema-required |
|---|---|
| **Time (0)** — the default | `name`, `overtimeRulesCounter` (> 0), `hourlyRate` |
| **Piece (1)** | `name`, `overtimeRulesCounter` (> 0), `pieceRate` |

Switching to Piece re-labels the rate fields live. **Both `#hourlyRate` and `#pieceRate`
are always in the DOM** — presence is not the signal, the asterisk and the schema are.
Overtime Rules is required for both, so there is no "Name + rate only" path.
Note `#overtimeRulesCounter` here is **lower-case t**, unlike Field's.

### File ▸ Administration ▸ Users — `/settings/users`, `/{id}`

Grid `Users`, toolbar only `Report` + `New User` (no "View deleted"). Columns Name /
Initials / Role / Email / Active, the last as plain text `Yes`/`No`.
Edit form Active is a switch — `getByRole('switch', { name: 'Active' })`, read
`aria-checked` — and the whole Permissions tab uses the same pattern, which is what
`src/pages/admin/UsersPage.ts` already does. Tabs: General / Password / Permissions / Crew
/ Departments / Job Groups / Devices / Time Card Defaults / Personal Info.
Watch `#accesstoReverse` — lower-case **t**.

### Input ▸ Crew Time In — `/input/crew-time-in/new`

Fields: `#dateTime` (datetime-local), `#basedOnLaterTimeCards`, `#ranchCounter` (**Select**,
not typable), `#fieldCounter` *, `#jobCounter` (this is Phase), `#crewCounter` *,
`#crewTableCounter`, `#memo`. Required: Date/Time, Field, Crew, Employees.

* **Table picker is crew-scoped** — see the contradictions table.
* **Employees** section renders only after a crew is chosen; all members arrive checked;
  `Deselect All` is a button in the section header (it toggles to `Select All`, so
  `CrewPunchPage.waitForEmployees()`'s `/Deselect All|Select All/i` is correct).
* Empty crew renders `No employees found for this crew.` + `Select at least 1` and a
  `1 error ▼` chip.

> **Blocker for the C6 conversion (WP3).** Of the 11 crews on dev, only `Callie Daddario`,
> `D6 CREW` and `su` have selectable employees. **`B1 CREW` and `C6 CREW` — the fixture
> crews the journey suite punches — currently return 0** from
> `GET /api/time-cards/crew-time-in/employees?crewCounter=…`. Any UI-driven crew punch
> needs those employees re-homed first. This is an environment fix, not a page-object one.

### Processing ▸ Transfer to Job Cards — `/transfer-to-job-cards`

* Scope by date through **`#transfer-date-scope`, a `BUTTON`** (accessible name `Dates`)
  that opens a dialog with two segmented date fields, two calendars, presets
  (`date-range-preset-last30`, …) and `Apply`. Future dates are disabled.
  Leave `#transfer-hide-piece-outs` **off** — it hides exactly the piece-out rows.
* **The grid does not load on scope change.** After Apply the body reads
  *"Ready to analyze. / Click Analyze above to load the Time Cards for this range."* —
  rows exist only after **`Analyze Transfer Candidates`**.
* Summary chips: Ready / Blocking / Warnings / Deferred.
* **Status is a badge, not text:**

  ```html
  <span role="status" class="…bg-success/10 text-success"><svg/><span>Ready</span></span>
  <span>Manually edited</span>   <!-- optional sibling, SAME cell -->
  ```

  Values seen: `Ready`, `Warning` (singular in the cell, plural in the chip), `Blocking`;
  `Deferred` is a fourth bucket with no rows in range. **Locate with
  `row.getByRole('status')`** — reading the cell's text yields `"ReadyManually edited"` on
  flagged rows, which is what a naive `toHaveText('Ready')` trips over. Assert
  "Manually edited" separately.
* Columns: *(select)*, *(add)*, *(delete)*, Crew, Employee, date, time, Field, Job, Pieces,
  Traceability, Ranch, Reference, Type, Pay by Piece, Transferred, Export Identifier, Run,
  Employee Selection, **Status**. Row controls name the record
  (`checkbox "Select 260922-0000001-TI-065-Su"`). The header `checkbox "Select all rows"`
  means *all across the filter* — **no page object may expose it.**

## Open questions

1. **The URL after saving a New form is inferred, not observed** — the handoff forbade
   creating records. Every Edit route seen is `<listUrl>/{id}`, and both
   `SetupScreenPage.editUrlPattern` and the green `a01-user-setup` spec already depend on
   `New → <listUrl>/{id}` for Users. Unconfirmed for Ranch / Field / Crew / Employee / Job.
   **This is what the WP1 smoke run settles** — the first `create*()` that returns an id
   confirms it for all of them.
2. **Field Edit and Crew Edit were not opened.** Unknown whether Edit applies Field's four
   unmarked Irrigation/Cultivation requirements to an existing record that has them null.
   Ranch, Employee and User edit forms were opened and match their New forms.
3. **`Deferred` as a Status badge value** is inferred from the summary chip; no row carried
   it in the last-30-days range.
4. **Employee Pay Period enum values** not captured — established as an optional Select
   defaulting to Hourly (`0`), listbox not enumerated.
5. **Why `isValid` is sticky** is established empirically, not from the app source. The
   practical rule (end the fill by blurring a text field) is verified in both directions.
