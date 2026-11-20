# PET-13153 · Transfer to Job Cards: Search by Department scopes the analyze to that department's employees
Spec  tests/web/client-feedback/transfer-to-job-cards/pet-13153-tjc-search-by-department.spec.ts
Data  src/data/client-feedback/pet-13153-tjc-search-by-department.json (TjcSearchByDepartmentCaseSchema)
      fixtureCrew "D", dayOffset -13 (moved from -16: WEBPET-3826 holds D -16)
      seed (control, fixture CF D ONE/TWO, no department): one+two hourly 08:00-10:00
      employees {one:{firstName:"DEPT",exportIdentifier:"131531"}, two:{firstName:"DEPT",exportIdentifier:"131532"}}
      departmentSeed (run-minted pair): one+two hourly 07:00-15:00
      expected {searchByOptions:["Employee","Department","Employee Home Crew","Time Card Crew"], match:"Selected",
        sentenceTemplate:"Department is one of: {department}", analyzed:4,
        caption:"Includes 4 Time Cards of 4 initial selection", labelTemplate:"{exportId} : {name}",
        totals:{Employees:2, Gross:16}}
Why minted employees: CF fixture employees have no department, and WEBPET-3577 needs CF D ONE's Department to stay "—".
  So two run-minted employees (home crew CF CREW D) get the fixed CF DEPARTMENT. No fixture row is changed.
  12961 already mints employees in crew D. Crew A/B/C are avoided because 3893 and 3283/3301/3575 run Crew In on whole crews.
Steps
0  m1/m2 = mintQuickAddEmployee(deps, ticket) (delete-by-name registered first); run = prepareCfRun(s, deps);
   dept = ensureCfDepartment(deps) [NEW] -> ensureDepartmentOnScreen({name: CF_FIXTURE.department.name})
   (arrange: create on screen only when missing);
   e.one/e.two = createCfEmployeeOnScreen(run, deps, m, {...s.employees[x], department: dept.name}) [extended];
   expect e.x.department == "CF DEPARTMENT"; seedCrewDay(run, deps, s.seed);
   seedCrewDay(run, deps, s.departmentSeed, {crew: run.crew, employees: [{...e.one, name: e.one.rosterName}, {...e.two, name: e.two.rosterName}], day: run.day})
1  tjc.openFromMenu()
2  tjc.scopeToDay(run.day)
3  expect(await tjc.searchByOptions()).toEqual(expected.searchByOptions) [NEW]
   trigger testid transfer-search-by-trigger (TransferSearchBySelector.tsx:231); listbox options as in probe tjc-searchby.txt:89-94
4  tjc.scopeBySearch('department', dept.name) [NEW]
   option transfer-search-by-department (TransferSearchBySelector.tsx:239)
   expect tjc.searchMatch toHaveText "Selected": transfer-search-op (TransferSearchCriterionInput.tsx:98; common.json:1432)
   picker transfer-filter-departments (TransferDepartmentFilter.tsx:66) -> dialog searchbox (MultiSelectChips.tsx:437)
     -> button name exact -> Escape; chip "Remove CF DEPARTMENT" inside transfer-search-criterion (MultiSelectChips.tsx:410)
   expect tjc.criterionSentence('department') [NEW] toHaveText "Department is one of: CF DEPARTMENT"
     testid transfer-search-criterion-edit-department (TransferSearchCriteriaList.tsx:77; common.json:1467)
5  tjc.analyzeCandidates({expected: 4})  (no Time Card Crew criterion)
6  employee = tjc.cardGrid.columnValues('Employee'): every value is in
     {fillTemplate(labelTemplate,{exportId,name}) for e.one, e.two}; distinct values = 2.
   Neither CF D ONE nor CF D TWO appears (the control proves exclusion).
7  expect tjc.gridCaption toHaveText expected.caption
   expect.poll(totalsNumber('Employees')) == 2, totalsNumber('Gross') == 16
   (control hours add 4: unfiltered Gross would be 20)
Server semantics: non-Oracle Department filters on Employee.DepartmentCounter (candidates.go:932-937).
  The probe shows Employee Home Crew offered, so OracleSync is off.
  The departments lookup label is Name (setup/transfer_lookups.go:41,76).
Cleanup: employee delete-by-name registered before prepareCfRun, so last-in-first-out runs card teardown first.
  prepareCfRun deletes own time cards by id plus the crew-day sweep. CF DEPARTMENT is a permanent fixture,
  protected by /^CF /. Nothing is transferred.
Allowances: arrange (CF rows, department when missing); plumbing reads (preferences, time-cards ids);
  cleanup (cards by id, employees by name).
Risks: Gross 16 must be measured on dev (rounding); if it differs, fix the number in the JSON, never the check.
  CF DEPARTMENT may sit in the recycle bin (ensureDepartmentOnScreen fails by name).
  The Employee-cell label for an exported id must be measured ("131531 : <Name>", as in 12961).
