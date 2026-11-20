# PET-12985 · Transfer to Job Cards: Report > Save then Load the script (sheet: full, no transfer)
Spec: tests/web/client-feedback/transfer-to-job-cards/pet-12985-tjc-report-load-script.spec.ts
Data: src/data/client-feedback/pet-12985-tjc-report-load-script.json (TjcReportLoadCaseSchema; same expected shape as 12951)
  fixtureCrew "A", dayOffset -14, seed {employees:["one"], job:"hourly", timeIn 07:00, timeOut 11:00}
  report {name:"Piece Summary by Packing Types", param:{label:"Show Details", value:"Yes"}}, resetReport "All Data"
  expected {savedToast, emptyText, bannerTemplate, deletedToast} as in 12951
Steps:
0 prepareCfRun + seedCrewDay; name = mintReportScriptName.
1 transferToJobCards.openFromMenu; scopeToDay(run.day); scopeToTimeCardCrew(run.crew.name);
  analyzeCandidates({expected: seed.timeCardCounters.length}).
2 report.open() (alertdialog "Report: All Data — <date>", probe tjc-report.txt); selectReport(name); setParam("Show Details","Yes");
  report.scripts.saveAsNew(name, toast, {executeReport:false}); report.close().
3 report.open(); selectReport("All Data").
4 report.loadButton.click(); scripts.loadDialog visible with combobox "Select a filter script" (probe tjc-report-load.txt);
  loadEmpty count 0; loadSubmit disabled.
5 pickScript(name) lists name; loadSubmit enabled; confirmLoad().
6 heading /^Report: Piece Summary by Packing Types — /; paramSelect("Show Details") = "Yes"; loadedBanner names the script.
7 report.close(); expect(tjc.timeCardCrewChip(run.crew.name)).toBeVisible() (screen scope kept).
8 filterScripts.gotoList(); deleteScript(name, deletedToast).
Not asserted: no transfer, no PDF.
Cleanup: run.cleanup; script by name.
Risks: check the transfer picker lists "Piece Summary by Packing Types" (transferReportPickerReports). If not, put another
  Time In report that has an enum parameter in the JSON (e.g. "Time Card Detail by Employee" / "Show Details" = "No").
