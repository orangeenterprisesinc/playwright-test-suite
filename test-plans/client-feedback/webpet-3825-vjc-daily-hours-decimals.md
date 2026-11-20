# WEBPET-3825 · View Job Cards: "Daily Hours" prints hours with Time Decimal Accuracy decimals (sheet: smoke)
Spec: tests/web/client-feedback/view-job-cards/webpet-3825-vjc-daily-hours-decimals.spec.ts
Data: src/data/client-feedback/webpet-3825-vjc-daily-hours-decimals.json (VjcDailyHoursDecimalsCaseSchema)
  fixtureCrew "C", dayOffset -15, seed {employees:["one"], job:"hourly", timeIn 07:00, timeOut 11:15}, jobCards 1
  prefs {section:"Accuracy", label:"Time Decimal Accuracy"} (labels from e06 JSON); workedMinutes 255
  report "Daily Hours" (picker label; reportMenuRows.generated.ts:362), expected {pdfTitle:"Job Card: Daily Hours", totalLabel:"Total Hours"}
Source: catalog :2229 "Show Time in Decimal" default Yes; layout JobCardDailyHours.json:1761 "Total Hours", :4956 title.
Steps:
1 jobCardPreferences.openFromMenu; gotoSection("Accuracy"); N = readNumber("Time Decimal Accuracy") (read only; annotate
  preference-evidence N=<n>).
2 prepareCfRun + seedCrewDay; transferCrewDay(run, deps, seed, 1) (records job-card ids for teardown).
3 viewJobCards.openFromMenu; scopeToDay(run.day); applyFilter; filterByCrew(run.crew.name) (crewIds go into the report).
4 out = viewJobCards.runReport("Daily Hours", 'pdf', path); status 200.
5 text = readPdfText: contains pdfTitle and "Total Hours". Take the line(s) with run.employees[0].name: decimal tokens >= 2
  (day cell + total), each matches ^\d+\.\d{N}$, and each |value - 255/60| <= 0.5*10^-N (not cut off or truncated).
Cleanup: run.cleanup (job cards by id, then time cards).
Risks: E6 changes Time Decimal Accuracy temporarily; a parallel E6 run could change N between steps 1 and 4 (annotate N).
  Non-super access to File > Administration > Job Card Preferences is not confirmed; if it is locked, fail with that reason
  and never read the value from the API instead. Time Rounding minutes at transfer may move 11:15; 15 min is on the usual grid.
