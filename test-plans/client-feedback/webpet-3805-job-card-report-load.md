# WEBPET-3805 · Reports > Input > Job Card: Execute/Load/Save; Load lists saved Job Card scripts (re-check; 11-11 manual FAIL)
Spec: tests/web/client-feedback/reports/webpet-3805-job-card-report-load.spec.ts
Data: src/data/client-feedback/webpet-3805-job-card-report-load.json (JobCardReportLoadCaseSchema)
  screen {menuPath:["Reports","Input","Job Card"], url:"/reports/input/job-card"}; no crew/day (no records read)
  expected {buttons:["Execute","Load","Save"], savedToast, loadTitle:"Load Filter Script", deletedToast}
Source: ReportsInputJobCardPage.tsx:188-223 (testids reports-input-job-card-execute/-load/-save; Save gated on a valid range,
  default = current week); ReportDialog partName "Job Card" (:231); initialAction 'load' -> PET-13130 picker alone (:687-701, :1356).
Steps:
0 name = mintReportScriptName.
1 jobCardReportSelection.openFromMenu (deep link, noMenuEntry); each label in buttons: jc.button(label) visible.
2 jc.saveButton.click() [NEW locator] -> Report dialog opens with the Save menu open; jc.report.scripts.saveAsNew(name, toast);
  jc.report.close().
3 jc.loadButton.click() [NEW locator]. Expect scripts.loadDialog visible AND expect(jc.report.dialog).toHaveCount(0)
  ("no Report dialog over or under the picker" - the 11-11 fail).
4 opts = scripts.pickScript(name) (proves the picker is clickable); expect(opts).toContain(name); loadSubmit enabled.
5 scripts.loadCancel.click() -> picker closes and the screen-level flow returns to the selection screen:
  expect(jc.executeButton).toBeVisible(); expect(jc.report.dialog).toHaveCount(0).
6 filterScripts.gotoList(); deleteScript(name, deletedToast).
Not asserted: the script is not loaded (its Execute report is on, so a Load would run a PDF; the ticket only asks that Load lists it).
Cleanup: script by name.
Runner: the existing row WEBPET-3805 (draft,0) -> automated,1 after green.
Risks: if dev still stacks the picker under the dialog, step 3 fails: keep that as the finding and do not heal it.
