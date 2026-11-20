# PET-12950 · View Time Cards: Report Selection reopens on the last-run report and its answers (sheet: full)
Spec: tests/web/client-feedback/view-time-cards/pet-12950-vtc-report-keeps-last-run.spec.ts
Data: src/data/client-feedback/pet-12950-vtc-report-keeps-last-run.json (VtcReportKeepsLastCaseSchema)
  fixtureCrew "A", dayOffset -15, seed {employees:["one"], job:"hourly", timeIn 07:00, timeOut 11:00}
  report {name:"Piece Summary by Packing Types", param:{label:"Show Details", value:"Yes"}}, expected {rows:2, defaultReport:"All Data"}
Source: ReportDialog.tsx:615-662 (keep last pick unless initialReportId), :908-922 (keepParamsOnReopen).
Steps:
0 prepareCfRun + seedCrewDay.
1 viewTimeCards.openFromMenu; scopeToDay; scopeToTimeCardCrew; applyFilter; totalRows()==2.
2 report.open(); heading starts "Report: All Data — " (first opening seeds the default).
3 selectReport(name); setParam("Show Details","Yes").
4 out = report.run('pdf', outputPath('pet-12950.pdf')) - run() closes the viewer and the Report dialog.
  expect(out.status).toBe(200); savedBytes > 0.
5 report.open() again (same screen visit - never navigate between).
6 heading /^Report: Piece Summary by Packing Types — / (not All Data); paramSelect("Show Details") toHaveText "Yes".
7 report.close().
Cleanup: run.cleanup.
Risks: "Display Report" passes initialReportId and re-seeds every opening - use reportButton (view-time-cards-report) only.
