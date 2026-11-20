# WEBPET-3828 · View Job Cards: "Payroll Summary by Crew" opens a PDF with crew group, lines and totals (sheet: smoke)
Spec: tests/web/client-feedback/view-job-cards/webpet-3828-vjc-payroll-summary-by-crew.spec.ts
Data: src/data/client-feedback/webpet-3828-vjc-payroll-summary-by-crew.json (VjcPayrollByCrewCaseSchema)
  fixtureCrew "C", dayOffset -16, seed {employees:["one","two"], job:"hourly", timeIn 07:00, timeOut 11:00}, jobCards 2
  range {fromOffset:-19, toOffset:-13} (a past week around the day); report "Payroll Summary by Crew"
  expected {status:200, totals:["Total Time","Grand Totals:"]}
Source: catalog :2897-2900 (monetary true; Group by Crew default "Work Crew"); layout JobCardPayrollSummaryByCrew.json
  :514 "Total Time", :2851 "Grand Totals:"; VJC crew chip -> JobCard.CrewCounter filter (JobCardsReportDialog.tsx:132).
Steps:
0 prepareCfRun + seedCrewDay; transferCrewDay(run, deps, seed, 2).
1 viewJobCards.openFromMenu; scopeToRange(cfDay(-19), cfDay(-13)); applyFilter; filterByCrew(run.crew.name).
2 report.open(); expect(await report.reportOptions(), 'monetary report hidden without rates.view').toContain(name);
  selectReport(name); out = report.run('pdf', path); status 200, savedBytes > 0.
3 text = readPdfText: contains run.crew.name (crew group), both employee names (payroll lines), "Total Time", "Grand Totals:".
Cleanup: run.cleanup (job cards by id, then time cards).
Risks: if QA Automation cannot view rates the option is absent: report that as a finding, not a heal. Other crews' cards in
  the week are excluded by the crew chip.
