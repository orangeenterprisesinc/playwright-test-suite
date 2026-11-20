# PET-12987 · Scan Devices & Boards: list Filter (Selected / Exclude / Empty / AND), Multi Update, Undo, Clear All
Spec  tests/web/client-feedback/setup/pet-12987-scan-devices-filter-multi-update.spec.ts
Data  src/data/client-feedback/pet-12987-scan-devices-filter-multi-update.json (ScanDeviceSelectionCaseSchema)
      fixtureCrew "A" (Supervisor = CF A ONE), no dayOffset
      devices [{key:"A",type:"Pocket PDA",supervisor:true},{key:"B",type:"Pocket PDA",supervisor:true},
               {key:"C",type:"Finger Scanner",supervisor:true},{key:"D",type:"Finger Scanner",supervisor:false},
               {key:"E",type:"Pocket PDA",supervisor:false}]
      deviceTypeValues {"Pocket PDA":"0","Finger Scanner":"16"} (scanDevice.json:422,435)
      tick ["A","B"]; muField "Use Job Alias"; muValue "Yes"; undoValue "No"
      expected {pda:[A,B,E], notPda:[C,D], supEmpty:[D,E], supSet:[A,B,C], both:[A,B],
        lines:{selected:"Device Type is one of: Pocket PDA", excluded:"Device Type is not one of: Pocket PDA",
          empty:"Supervisor is empty", notEmpty:"Supervisor is not empty", aliasYes:"Use Job Alias is Yes"},
        updateLabel:"Update Records (2)", updatedToast:"2 records updated", undoneToast:"Update undone"}
Safety: only the 5 run-minted devices are ever ticked or updated. No device 43 (client 3) and no real phone:
  the probe list holds ids 1002-1342 on client 1. Never Select all.
  The spec asserts every ticked name is in scratch.names and that the submit reads "Update Records (2)" before clicking.
  Nothing is pushed to a device.
Steps
0  sup = (await ensureCfFixtures(deps,'A')).employees[0]
   scratch = mintScratchDevices(deps, ticket, 5) [NEW]: 5 names on one stamp "P2987 NEW SD <MMDD-HHmmss>-Wn"
     (+ -2..-5, 29 chars max) and stem = the unsuffixed name; delete-by-name registered first
   for each: scanDevice.createScratchDevice({name, deviceType, webMailAddress: name with spaces -> '-' + '@silo', supervisor?}) [NEW]
     type is set before the name: Name blur auto-fills a free Reference Prefix (ScanDeviceFormPage.tsx:1079-1095;
       prefixes are unique per live device, scan_device_save_checks.go:135)
     webMail may not contain spaces (:151); Supervisor is #supervisorCounter (ScanDeviceFormPage.tsx:1221-1228, ParentPicker.tsx:811)
     id comes from the POST response, as createDevice does
1  scanDevice.gotoList(); baseline = grid.totalRowCount(); grid.columnFilter('Name', scratch.stem) -> total 5
2  openSelection(); pickSelectionField('deviceType'); setSelectionMatch('inList'); pickSelectionValues('deviceType',['Pocket PDA']); applySelection()
   expect selectionLines() == [selected]; selectionCount text "1"
   names == pda; columnValues('Device Type') all "Pocket PDA"
3  openSelection(); pickSelectionField('deviceType') (re-opens it); setSelectionExclude('deviceType', true); apply
   lines == [excluded]; names == notPda; no "Pocket PDA" cell
4  openSelection(); clearAllSelection(); pickSelectionField('supervisor'); setSelectionMatch('empty'); apply
   lines == [empty]; E = total; names == supEmpty
   setSelectionExclude('supervisor', true); apply: lines == [notEmpty]; N = total; names == supSet
   expect(E + N).toBe(5): 5 is the unfiltered Name-scoped total; the two sets are disjoint
5  openSelection(); pickSelectionField('deviceType'); match inList; values Pocket PDA; apply
   (Supervisor not empty stays): count "2"; lines contain both; names == both
6  openSelection(); clearAllSelection(); apply -> 5 rows; setMultiUpdate(true); grid.selectRows(names A,B)
   chooseMuField('Use Job Alias'); chooseMuValue('Yes'); expect muSubmit toHaveText "Update Records (2)"; click
   toast("2 records updated") visible
7  openSelection(); pickSelectionField('useJobAlias'); setSelectionMatch('isTrue'); apply
   lines == [aliasYes]; names == [A,B] (C, D, E unchanged)
8  Undo: selectRows(A,B); Value "No"; "Update Records (2)"; click; toast "2 records updated"
   expect.poll names == [] (they leave the Yes list); toastUndo().click(); toast "Update undone"
   expect.poll names == [A,B] (restored)
9  grid.columnFilter('Name',''); openSelection(); clearAllSelection(); apply
   selectionDescription hidden, selectionCount hidden; totalRowCount() == baseline; setMultiUpdate(false)
Why step 8 undoes a second update: the success toast with Undo lives 10 s (MultiUpdatePanel.tsx:119-128),
  which is too short for the filter round trip in step 7. Step 8 proves Undo restores the previous values.
Out of scope: ticked-then-hidden selection (the 11-17 FAIL), List, Active Only.
Cleanup: 5 delete-by-name (cleanup allowance), registered before the first create; residue prefix readable('NEW SD').
Allowances: arrange (CF A rows when missing); cleanup (scan devices by name). No plumbing write.
Risks: the toast Undo shows only with Access to Reverse (MultiUpdatePanel.tsx:102). If QA Automation lacks it,
  the step fails by name ("Undo" absent). Report that, never work around it.
  The Supervisor caption is aliasable (scan-devices.json:38 aliasKey). Measure it.
  The baseline in step 9 can drift if another run creates or deletes devices meanwhile (e.g. B15 'NEW DEVICE').
  Nested popover: close the Values list by clicking its trigger again, never Escape (it may close the outer Filter).
