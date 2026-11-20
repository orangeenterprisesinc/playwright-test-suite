# PET-13154 · Transfer to Job Cards: Search by Employee Home Crew scopes the analyze to that crew's employees
Spec  tests/web/client-feedback/transfer-to-job-cards/pet-13154-tjc-search-by-home-crew.spec.ts
Data  src/data/client-feedback/pet-13154-tjc-search-by-home-crew.json (TjcSearchByHomeCrewCaseSchema)
      fixtureCrew "C", dayOffset -17
      seed: one+two hourly 07:00-11:00
      extraCrews [{fixtureCrew:"D", dayOffset:-17, seed: one+two hourly 07:00-11:00}]  (control, home crew D)
      expected {option:"Employee Home Crew", match:"Selected", sentenceTemplate:"Employee Home Crew is one of: {crew}",
        analyzed:4, caption:"Includes 4 Time Cards of 4 initial selection",
        employees:["CF C ONE","CF C TWO"], absent:["CF D ONE","CF D TWO"], totals:{Employees:2}}
Why C: no spec mints employees into CF CREW C, so home crew C on the day is exactly CF C ONE/TWO.
  Crew D on the same day is the control that must drop out.
Steps
0  run = prepareCfRun(s, deps) (claims C -17 and D -17, sweeps both); seedCrewDay(run, deps, s.seed);
   seedCrewDay(run, deps, s.extraCrews[0].seed, run.extra[0])
1  tjc.openFromMenu()
2  tjc.scopeToDay(run.day)
3  expect(await tjc.searchByOptions()).toContain(expected.option) [NEW, shared with 13153]
4  tjc.scopeBySearch('homeCrew', run.crew.name) [NEW]
   option transfer-search-by-homeCrew (TransferSearchBySelector.tsx:239)
   Match "Selected" (transfer-search-op, TransferSearchCriterionInput.tsx:98)
   picker transfer-filter-home-crews (TransferHomeCrewFilter.tsx:56)
   expect tjc.criterionSentence('homeCrew') toHaveText "Employee Home Crew is one of: CF CREW C"
     (transfer-search-criterion-edit-homeCrew, TransferSearchCriteriaList.tsx:77; caption transfer.json:369; common.json:1467)
5  tjc.analyzeCandidates({expected: 4})  (no Time Card Crew criterion)
6  employee = tjc.cardGrid.columnValues('Employee'): every value matches /(^|: )(CF C ONE|CF C TWO)$/;
   distinct values = 2; no value matches CF D ONE/TWO
7  expect tjc.gridCaption toHaveText "Includes 4 Time Cards of 4 initial selection" (the TC's footer)
   expect.poll(totalsNumber('Employees')) == 2
Server semantics: Home Crew filters on Employee.CrewCounter (candidates.go:883-885); the Time Card Crew is a different column.
Cleanup: prepareCfRun's teardown (cards by id plus the C -17 and D -17 sweeps). Nothing is created or transferred.
Allowances: arrange (CF rows when missing); plumbing reads; cleanup.
Risks: the control does not prove home crew vs time-card crew, because each crew punches into its own crew.
  Crew Time In only lists a crew's members, so no cross-crew punch is planned.
