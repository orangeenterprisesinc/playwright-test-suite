# Finding · Pushed Field is not selectable on the device until Sync

**Status:** draft, not filed. Jira is read-only in the automation pipeline — file this
by hand if the triage below holds.

**Suggested labels:** `qa-beta-test`, `journey-b`, `connectivity` — no parent.
(`beta-core` is Test-items only and would hide the bug.)

**Source:** `WEBPET-1533` [B15] Device sync and offline operation — attachments
**66971** (Part 2) and **66972** (Part 3), annotated under
`.video-annotations/b15-device-sync-part2/` and `…-part3/`.

## Summary

A Field assigned to a scan device in the office is present in the pushed setup export
file, but the device reports **"No Field records found on device."** through four
consecutive Imports. The Field only becomes selectable after an end-of-day **Sync**.

## Why this is worth a decision

Either Import is meant to apply `Field_Records` and silently does not (a defect), or
Fields are delivered on Sync only (working as designed, and the error message is
misleading). The recordings do not settle it, and the answer changes what the B15
automation is allowed to assert. Until it is settled, requirement `B15-R9` in
`test-plans/journey-b/b15-device-sync.md` is deliberately left unencoded.

## Evidence

The Field *was* sent. The operator downloaded the pushed file
(`PET-Setup_Device 30 [B8] CREW PIECES_260814163652.xml`, attachment **66974**,
478,337 bytes) and read it in Notepad++ (Part 3, kf 351–359):

```
<Ranch_Records Clear="True">  -> Amy's Ranch, Code 33198
<Field_Records Clear="True">  -> Field 01, Code 33199, Ranch Amy's Ranch, Crop Blueberries
<Crew_Records  Clear="True">  -> 104 Martha Santoyo (11879), 125 Laureano Lopez Velasco (18860), ALL EMPLOYEES (10220)
```

The office configuration was correct: device 30, `Include Field = ON`, assignment row
`Amy's Ranch | Whole ranch`, saved with the toast "Scan device saved" (Part 3, kf 100,
236–243). `Amy's Ranch` has exactly one Active field — verified in the office at
`/setup/fields?ranchName=Amy%27s+Ranch`, **Total 1 rows**, `Field 01`, barcode 33199
(Part 2, kf 163).

**The same push delivered everything else.** After Import the device's crew picker
correctly gained `104 Martha Santoyo` (Part 3, kf 46 → 128) and the employee table was
replaced wholesale (kf 50–55 → 144–149). Only Fields were missing.

## Steps to reproduce

1. Office → File → Administration → Scan Devices & Boards → open a pocket-class device.
2. Set `Include Field = ON` and add a ranch with no specific field ("Whole ranch").
   Ensure that ranch has at least one Active field. **Save**.
3. **Push to Device**. Confirm a Completed run in Display Log → Internet Export Log.
4. On the device, tap **IMPORTAR** → Yes. Let it finish
   (`Importing Job_Records` → `Employee_Records` → `Preferen_Records`).
5. Open Tiempo de Entrada and tap **Campo**.

**Expected:** the ranch's Active fields are listed.
**Actual:** error dialog **"No Field records found on device."**, and the `Campo` value
is cleared. Repeats on every subsequent Import.

## Observed sequence

| Event | Part / keyframes | Result |
|---|---|---|
| Import #1 | P3 kf 110–129 | Crew arrives; `Campo` → "No Field records found on device." (kf 132–133) |
| Import #2 | P3 kf 152–165 | Same error (kf 168–169) |
| Import #3 | P3 kf 184–187 | "No new records found on server"; error persists (kf 192–193, 204–205) |
| Push again + Import #4 | P3 kf 244–259 | Same error (kf 264–265, 300–301, 316–317, 324–325) |
| **Sync** (`SIN-CRONIZAR`) | P3 kf 382–387 | — |
| After Sync | P3 kf 388–391 | `Campo = FIELD 01`; the picker now lists **"Amy's Ranch - Field 01"** |

Part 2 shows the identical failure independently (kf 133, 137, and again at 141), and
that recording ends with the operator still investigating it.

## Environment

Captured on an on-prem build, **not** dev staging: `https://192.168.1.74`, client
"Sycamore", version `"7715","77.15"`, PET Pocket app `26.01.22`, device **Device 30
[B8] CREW PIECES** (`Device30@jensilo`, Connectivity Method `Web`, `PocketPDA`).

**Reproduce on dev staging before filing** — this may already be fixed, or may be
specific to that build.

## Secondary observations from the same recordings

Not bugs on their own; worth confirming while the above is triaged.

- **`Push to Device` gives no confirmation** — no toast, no dialog, and `Last Export
  Date` does not visibly change. Success is only inferable from the Export Log row
  (P3 kf 104–107, 244–247).
- **The `Rancho` row disappears from the capture form after Import** (P2 kf 123, 135).
  Plausibly correct when the device narrows to a single ranch, but never stated.
- **`Last Export Date` changed 16:09 → 16:20 with no operator action** (P3 kf 63 → 69),
  probably a stale-then-fresh render.
