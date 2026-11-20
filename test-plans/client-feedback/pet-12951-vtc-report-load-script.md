# PET-12951 · View Time Cards: Report > Load lists and loads the screen's filter scripts (sheet: full)
Spec: tests/web/client-feedback/view-time-cards/pet-12951-vtc-report-load-script.spec.ts
Data: src/data/client-feedback/pet-12951-vtc-report-load-script.json (VtcReportLoadCaseSchema)
  fixtureCrew "C"? NO -> "A", dayOffset -13, seed {employees:["one"], job:"hourly", timeIn 07:00, timeOut 11:00}
  report {name:"Piece Summary by Packing Types", param:{label:"Show Details", value:"Yes"}}  (catalog default No, report-catalog.json:4596)
  resetReport "All Data"; expected {rows:2, savedToast:'Filter script "{name}" saved.', loadTitle:"Load Filter Script",
  emptyText:"There are no saved filter scripts for this screen yet.", bannerTemplate:'Using the filters from "{name}".',
  criterionLine (copy webpet-3819 JSON's criterionLine with CF CREW A), deletedToast:"Filter script deleted"}
Steps (page objects):
0 prepareCfRun + seedCrewDay (A, -13). name = mintReportScriptName(deps, ticket) (teardown by name registered first).
1 viewTimeCards.openFromMenu; scopeToDay(run.day); scopeToTimeCardCrew(run.crew.name); applyFilter;
  totalRows()==2 (Report waits forever before Apply - brief).
2 report.open(); report.selectReport(name); report.setParam("Show Details","Yes")  [NEW];
  report.scripts.saveAsNew(name, toast, {executeReport:false}) [NEW option]; report.close().
3 report.open(); report.selectReport("All Data")  -- PET-12950 keeps the last pick; without this Load proves nothing.
4 report.loadButton.click() [NEW, testid report-load-trigger ReportDialog.tsx:1686];
  scripts.loadDialog visible (dialog "Load Filter Script", i18n common.json:1174);
  expect(scripts.loadEmpty).toHaveCount(0) (testid report-load-picker-empty, ReportLoadFilterScriptDialog.tsx:109);
  expect(scripts.loadSubmit).toBeDisabled() (report-load-submit :174).
5 opts = scripts.pickScript(name) [NEW] -> expect(opts).toContain(name); expect(loadSubmit).toBeEnabled(); scripts.confirmLoad() [NEW].
6 Asserts: report.dialog heading /^Report: Piece Summary by Packing Types — /; report.paramSelect("Show Details") toHaveText "Yes";
  report.loadedBanner toContainText fillTemplate(bannerTemplate) (report-loaded-banner :1515).
7 report.close(); view.expandFilter(); criterionLine('workCrew') toHaveText expected.criterionLine (screen filter untouched).
8 filterScripts.gotoList(); filterScripts.deleteScript(name, deletedToast).
Not asserted: no PDF run (Execute report off on purpose - PET-13151 auto-run would close the dialog).
Cleanup: run.cleanup (time cards by id + crew-day sweep); script by name (mintReportScriptName).
Risks: the Load list holds every "Time In" script in the tenant (Time In report scripts too) - pick by exact name.
  Select options may need scrolling (max-h-72); pickScript should use getByRole('option',{name,exact}).
